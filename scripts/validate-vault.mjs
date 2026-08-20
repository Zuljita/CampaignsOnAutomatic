#!/usr/bin/env node
// Campaign Vault validator + index compiler (reference implementation).
// Usage: node scripts/validate-vault.mjs <vault-dir> [--write-index] [--check]
//   --write-index  regenerate _index/ids.json and _index/relationships.json
//   --check        regenerate derived indexes in memory and fail on drift
//
// Structured errors follow the family convention: { code, message, file }.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";

const SPEC_VERSION = "0.2.0";

const KINDS = new Set([
  "campaign", "region", "hex", "settlement", "site", "npc", "faction", "quest", "map", "session", "faction_map",
]);

const KIND_PREFIXES = {
  campaign: "camp_", region: "reg_", settlement: "set_", site: "site_",
  npc: "npc_", faction: "fac_", quest: "quest_", map: "map_", session: "sess_", faction_map: "fac_",
};

const QUEST_STATUSES = new Set(["rumored", "active", "completed", "failed", "abandoned"]);
const REVEAL_STATUSES = new Set(["revealed", "partial"]);

const RELATIONSHIP_KINDS = new Set([
  "ally", "enemy", "rival", "truce", "trade", "family",
  "member_of", "leader_of", "patron_of", "vassal_of", "owes_debt", "worships", "spies_on",
  "custom",
]);
const SYMMETRIC_KINDS = new Set(["ally", "enemy", "rival", "truce", "trade", "family"]);

const HEX_TERRAIN = new Set([
  "plains", "forest", "hills", "mountains", "marsh", "desert", "tundra", "water", "coast", "badlands",
]);
const HEX_FEATURES = new Set([
  "lair", "ruin", "settlement", "site", "landmark", "resource", "hazard", "crossing", "road", "river",
]);
const HEX_CLIMATE = new Set(["cold", "temperate", "hot"]);
const HEX_OBSTACLES = new Set([
  "ford", "bridge", "pass", "cliffs", "bog", "scree", "dense_growth", "flood_plain", "toll", "no_water",
]);
const SETTLEMENT_SIZES = new Set(["thorp", "hamlet", "village", "small_town", "large_town", "city"]);
const NARRATIVE_ROLES = new Set([
  "guard", "hireling", "rival_delver", "lieutenant", "boss", "captive", "merchant", "guide", "cultist", "noncombat",
]);
const THREAT_TIERS = new Set(["minor", "standard", "major", "severe"]);
const LOCK_CLASSES = new Set(["content", "narrative", "geometry"]);
const STATUSES = new Set(["stub", "active", "retired"]);

const OA_ID_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const ENTITY_REF_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*(#[A-Za-z0-9._:-]+)?$/;
const DOTTED_VERSION_RE = /^\d+(\.\d+)*$/;
const GENERATOR_RE = /^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/;
const PACKAGE_REF_RE = /^[a-z][a-z0-9-]*@\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
const HEX_COORD_RE = /^(\d{4}|\d{6})$/;
const HEX_FRAGMENT_RE = /^hex-(\d{4}|\d{6})$/;
// One combined fence regex: group 1 = begin section name, group 2 = "end".
const REGION_FENCE_RE = /<!--\s*oa:generated (?:begin section="([^"]+)"(?:\s+generator="[^"]*")?|(end))\s*-->/g;

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const args = process.argv.slice(2);
const vaultDir = args.find((a) => !a.startsWith("--"));
const writeIndex = args.includes("--write-index");
const checkDerived = args.includes("--check");
if (!vaultDir) fail("Usage: validate-vault.mjs <vault-dir> [--write-index] [--check]");
if (!existsSync(vaultDir)) fail(`Vault directory not found: ${vaultDir}`);

const errors = [];
const warnings = [];
function err(code, message, file) { errors.push({ code, message, file }); }
function warn(code, message, file) { warnings.push({ code, message, file }); }

// ---- walk ------------------------------------------------------------------

function walkMarkdown(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkMarkdown(full, out);
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function vaultPath(file) {
  return relative(vaultDir, file).split(sep).join("/");
}

// ---- frontmatter -----------------------------------------------------------

function splitFrontmatter(raw, file) {
  if (!raw.startsWith("---\n")) return { fm: null, body: raw };
  const close = raw.indexOf("\n---", 3);
  if (close === -1) {
    err("frontmatter_unclosed", "Frontmatter opened but never closed", file);
    return { fm: null, body: raw };
  }
  const fmText = raw.slice(raw.indexOf("\n") + 1, close);
  const nl = raw.indexOf("\n", close + 1);
  const body = nl === -1 ? "" : raw.slice(nl + 1);
  try {
    const fm = parseYaml(fmText);
    if (fm !== null && typeof fm !== "object") {
      err("frontmatter_not_map", "Frontmatter must be a YAML mapping", file);
      return { fm: null, body };
    }
    return { fm, body };
  } catch (e) {
    err("frontmatter_parse", `YAML parse failed: ${e.message.split("\n")[0]}`, file);
    return { fm: null, body };
  }
}

// ---- per-note validation ---------------------------------------------------

const notes = []; // { file, rel, fm, body }
const idToPath = new Map();

const files = walkMarkdown(vaultDir);
for (const file of files) {
  const rel = vaultPath(file);
  // Strip a UTF-8 BOM and normalize CRLF so frontmatter and fence detection
  // behave identically regardless of platform line endings.
  const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const { fm, body } = splitFrontmatter(raw, rel);
  const sectionNames = validateManagedRegions(body, rel);
  notes.push({ file, rel, fm, body, sectionNames });

  if (!fm) continue; // pure GM note or parse failure (already reported)
  if (fm.oa_id === undefined && fm.oa_kind === undefined && fm.oa_spec === undefined) {
    continue; // pure GM note with human-only frontmatter — always legal
  }

  for (const key of ["oa_id", "oa_kind", "oa_spec"]) {
    if (fm[key] === undefined) err("missing_key", `Machine note missing required key ${key}`, rel);
  }
  if (fm.oa_id !== undefined) {
    if (typeof fm.oa_id !== "string" || !OA_ID_RE.test(fm.oa_id)) {
      err("bad_id", `oa_id ${JSON.stringify(fm.oa_id)} violates id grammar`, rel);
    } else if (idToPath.has(fm.oa_id)) {
      err("duplicate_id", `oa_id ${fm.oa_id} already used by ${idToPath.get(fm.oa_id)}`, rel);
    } else {
      idToPath.set(fm.oa_id, rel);
    }
  }
  if (fm.oa_kind !== undefined && !KINDS.has(fm.oa_kind)) {
    err("bad_kind", `Unknown oa_kind ${JSON.stringify(fm.oa_kind)}`, rel);
  }
  if (typeof fm.oa_id === "string" && typeof fm.oa_kind === "string") {
    const prefix = KIND_PREFIXES[fm.oa_kind];
    if (prefix && !fm.oa_id.startsWith(prefix) && fm.oa_kind !== "hex") {
      warn("prefix_mismatch", `oa_id ${fm.oa_id} does not use the conventional ${prefix} prefix for kind ${fm.oa_kind}`, rel);
    }
  }
  if (fm.oa_spec !== undefined && (typeof fm.oa_spec !== "string" || !DOTTED_VERSION_RE.test(fm.oa_spec))) {
    err("bad_spec", `oa_spec ${JSON.stringify(fm.oa_spec)} is not a dotted numeric version`, rel);
  }
  if (fm.oa_generator !== undefined && !GENERATOR_RE.test(String(fm.oa_generator))) {
    err("bad_generator", `oa_generator ${JSON.stringify(fm.oa_generator)} must be <app>@<x.y.z>`, rel);
  }
  if (fm.oa_status !== undefined && !STATUSES.has(fm.oa_status)) {
    err("bad_status", `oa_status ${JSON.stringify(fm.oa_status)} not in stub|active|retired`, rel);
  }
  if (fm.oa_audience !== undefined && fm.oa_audience !== "gm" && fm.oa_audience !== "player") {
    err("bad_audience", `oa_audience ${JSON.stringify(fm.oa_audience)} not in gm|player`, rel);
  }
  if (fm.oa_locks !== undefined) {
    if (!Array.isArray(fm.oa_locks) || fm.oa_locks.some((l) => !LOCK_CLASSES.has(l))) {
      err("bad_locks", `oa_locks must be a list drawn from content|narrative|geometry`, rel);
    }
  }

  validateKindBlock(fm, rel);
  validateRelationships(fm, rel);
  validateReveal(fm, sectionNames, rel);
}

function validateReveal(fm, sectionNames, rel) {
  if (fm.oa_reveal === undefined) return;
  const reveal = fm.oa_reveal;
  if (typeof reveal !== "object" || reveal === null || !REVEAL_STATUSES.has(reveal.status)) {
    err("reveal_status", `oa_reveal.status must be revealed|partial (absent oa_reveal means hidden)`, rel);
    return;
  }
  if (reveal.status === "partial") {
    if (!Array.isArray(reveal.sections) || reveal.sections.length === 0 || reveal.sections.some((s) => typeof s !== "string")) {
      err("reveal_sections", "oa_reveal.status partial requires a non-empty sections list", rel);
      return;
    }
    for (const section of reveal.sections) {
      if (!sectionNames.has(section)) {
        warn("reveal_section_unknown", `oa_reveal.sections names "${section}" but this file has no such managed section`, rel);
      }
    }
  }
}

function validateManagedRegions(body, rel) {
  const sections = new Set();
  let depth = 0;
  for (const line of body.split("\n")) {
    // One combined regex so multiple fences per line (and end-before-begin on
    // one line) are handled in document order.
    for (const match of line.matchAll(REGION_FENCE_RE)) {
      if (match[2]) {
        // end fence
        if (depth === 0) err("region_unopened", "oa:generated end without begin", rel);
        else depth -= 1;
      } else {
        // begin fence
        if (depth > 0) err("region_nested", "Nested oa:generated regions are not allowed", rel);
        depth += 1;
        const section = match[1];
        if (sections.has(section)) err("region_dup_section", `Duplicate managed section "${section}"`, rel);
        sections.add(section);
      }
    }
  }
  if (depth !== 0) err("region_unclosed", "oa:generated begin without end", rel);
  return sections;
}

function validateKindBlock(fm, rel) {
  switch (fm.oa_kind) {
    case "region": {
      const grid = fm.region?.grid;
      if (!grid) { err("region_missing_grid", "region.grid is required", rel); break; }
      if (grid.orientation !== "flat") err("region_orientation", 'region.grid.orientation must be "flat" (flat-top hexes)', rel);
      if (grid.offset !== "even-q") err("region_offset", 'region.grid.offset must be "even-q" in spec 0.1.0', rel);
      if (!Number.isInteger(grid.columns) || grid.columns < 1) err("region_columns", "region.grid.columns must be a positive integer", rel);
      if (!Number.isInteger(grid.rows) || grid.rows < 1) err("region_rows", "region.grid.rows must be a positive integer", rel);
      break;
    }
    case "hex": {
      const regionRef = fm.oa_refs?.region;
      if (typeof regionRef !== "string") {
        err("hex_missing_region_ref", "Hex note requires a string oa_refs.region naming its region", rel);
      }
      const hex = fm.hex;
      if (!hex) { err("hex_missing_block", "hex block is required", rel); break; }
      if (typeof hex.coord !== "string" || !HEX_COORD_RE.test(hex.coord)) {
        err("hex_coord", `hex.coord ${JSON.stringify(hex.coord)} must be CCRR / CCCRRR zero-padded`, rel);
      } else {
        const base = rel.split("/").pop();
        if (base !== `hex-${hex.coord}.md`) {
          err("hex_filename", `Hex file ${base} does not match coord ${hex.coord} (expected hex-${hex.coord}.md)`, rel);
        }
        const { col, row } = parseHexCoord(hex.coord);
        if (col === 0 || row === 0) {
          err("hex_coord_zero", `hex.coord ${hex.coord} has a zero column or row component — coordinates are 1-based (top-left is 0101)`, rel);
        }
      }
      if (!HEX_TERRAIN.has(hex.terrain)) err("hex_terrain", `hex.terrain ${JSON.stringify(hex.terrain)} not in closed vocabulary`, rel);
      if (hex.features !== undefined && (!Array.isArray(hex.features) || hex.features.some((f) => !HEX_FEATURES.has(f)))) {
        err("hex_features", "hex.features contains values outside the closed vocabulary", rel);
      }
      // Biome layer (optional in 0.1): climate closed vocab; biome must agree with climate_terrain.
      if (hex.climate !== undefined && !HEX_CLIMATE.has(hex.climate)) {
        err("hex_climate", `hex.climate ${JSON.stringify(hex.climate)} not in closed vocabulary`, rel);
      }
      if (hex.biome !== undefined) {
        const expectedBiome = hex.climate !== undefined && HEX_TERRAIN.has(hex.terrain) ? `${hex.climate}_${hex.terrain}` : null;
        if (typeof hex.biome !== "string" || !/^(cold|temperate|hot)_[a-z]+$/.test(hex.biome)) {
          err("hex_biome", `hex.biome ${JSON.stringify(hex.biome)} is malformed (expected <climate>_<terrain>)`, rel);
        } else if (expectedBiome !== null && hex.biome !== expectedBiome) {
          err("hex_biome", `hex.biome ${hex.biome} does not agree with climate+terrain (${expectedBiome})`, rel);
        }
      }
      // Obstacle layer (optional in 0.1): closed vocab.
      if (hex.obstacles !== undefined && (!Array.isArray(hex.obstacles) || hex.obstacles.some((o) => !HEX_OBSTACLES.has(o)))) {
        err("hex_obstacles", "hex.obstacles contains values outside the closed vocabulary", rel);
      }
      if (typeof regionRef === "string" && typeof hex.coord === "string" && typeof fm.oa_id === "string") {
        const expected = `${regionRef}_hex_${hex.coord}`;
        if (fm.oa_id !== expected) {
          err("hex_id", `Hex oa_id ${fm.oa_id} should be ${expected} (region id + coord)`, rel);
        }
      }
      break;
    }
    case "settlement": {
      const s = fm.settlement;
      if (!s) { err("settlement_missing_block", "settlement block is required", rel); break; }
      if (!SETTLEMENT_SIZES.has(s.size)) err("settlement_size", `settlement.size ${JSON.stringify(s.size)} not in closed vocabulary`, rel);
      if (s.population !== undefined && (!Number.isInteger(s.population) || s.population < 1)) {
        err("settlement_population", "settlement.population must be a positive integer", rel);
      }
      break;
    }
    case "npc": {
      if (fm.narrative_role !== undefined && !NARRATIVE_ROLES.has(fm.narrative_role)) {
        err("npc_role", `narrative_role ${JSON.stringify(fm.narrative_role)} not in closed vocabulary`, rel);
      }
      if (fm.stats !== undefined) {
        if (!["none", "summary", "linked"].includes(fm.stats.status)) {
          err("npc_stats_status", "stats.status must be none|summary|linked", rel);
        }
        if (fm.stats.threat_tier !== undefined && !THREAT_TIERS.has(fm.stats.threat_tier)) {
          err("npc_threat_tier", `stats.threat_tier ${JSON.stringify(fm.stats.threat_tier)} not in closed vocabulary`, rel);
        }
        if (fm.stats.status === "linked" && typeof fm.stats.sheet !== "string") {
          err("npc_stats_sheet", "stats.status linked requires stats.sheet path", rel);
        }
        if (typeof fm.stats.sheet === "string") {
          const segments = fm.stats.sheet.split(/[\\/]/);
          if (segments.includes("..")) {
            err("npc_sheet_traversal", `stats.sheet ${fm.stats.sheet} must be vault-relative with no ".." segments`, rel);
          } else if (!existsSync(join(vaultDir, fm.stats.sheet))) {
            warn("npc_sheet_missing", `stats.sheet ${fm.stats.sheet} does not exist in the vault`, rel);
          }
        }
      }
      break;
    }
    case "faction": {
      const f = fm.faction;
      if (f?.scope !== undefined && !["site", "local", "regional", "world"].includes(f.scope)) {
        err("faction_scope", `faction.scope ${JSON.stringify(f.scope)} not in closed vocabulary`, rel);
      }
      if (f?.origin !== undefined && !["seed", "emergent", "commissioned", "gm"].includes(f.origin)) {
        err("faction_origin", `faction.origin ${JSON.stringify(f.origin)} not in closed vocabulary`, rel);
      }
      break;
    }
    case "campaign": {
      if (fm.calendar !== undefined) validateCalendar(fm.calendar, rel);
      break;
    }
    case "quest": {
      const q = fm.quest;
      if (!q) { err("quest_missing_block", "quest block is required", rel); break; }
      if (!QUEST_STATUSES.has(q.status)) {
        err("quest_status", `quest.status ${JSON.stringify(q.status)} not in rumored|active|completed|failed|abandoned`, rel);
      }
      if (q.objectives !== undefined) {
        if (!Array.isArray(q.objectives)) {
          err("quest_objectives", "quest.objectives must be a list", rel);
        } else {
          for (const objective of q.objectives) {
            if (typeof objective?.text !== "string" || objective.text.length === 0) {
              err("quest_objective_text", "each quest objective needs non-empty text", rel);
            }
            for (const flag of ["done", "revealed"]) {
              if (objective?.[flag] !== undefined && typeof objective[flag] !== "boolean") {
                err("quest_objective_flag", `quest objective ${flag} must be boolean`, rel);
              }
            }
          }
        }
      }
      break;
    }
    case "map": {
      const m = fm.map;
      if (!m) { err("map_missing_block", "map block is required", rel); break; }
      if (typeof m.image !== "string" || m.image.length === 0) {
        err("map_image", "map.image must be a vault-relative image path", rel);
      } else if (m.image.split(/[\\/]/).includes("..")) {
        err("map_image_traversal", `map.image ${m.image} must be vault-relative with no ".." segments`, rel);
      } else if (!existsSync(join(vaultDir, m.image))) {
        warn("map_image_missing", `map.image ${m.image} does not exist in the vault`, rel);
      }
      if (m.pins !== undefined) {
        if (!Array.isArray(m.pins)) {
          err("map_pins", "map.pins must be a list", rel);
        } else {
          for (const pin of m.pins) {
            for (const axis of ["x", "y"]) {
              if (typeof pin?.[axis] !== "number" || pin[axis] < 0 || pin[axis] > 1) {
                err("map_pin_coord", `map pin ${axis} must be a number in 0..1 (fraction of image size)`, rel);
              }
            }
            if (pin?.revealed !== undefined && typeof pin.revealed !== "boolean") {
              err("map_pin_revealed", "map pin revealed must be boolean", rel);
            }
            // Pin ref grammar here; dangling is checked cross-note.
            if (pin?.ref !== undefined && (typeof pin.ref !== "string" || !ENTITY_REF_RE.test(pin.ref))) {
              err("map_pin_ref", `map pin ref ${JSON.stringify(pin.ref)} is not a valid entity ref`, rel);
            }
          }
        }
      }
      break;
    }
    case "session": {
      if (fm.in_world !== undefined) validateWorldDate(fm.in_world, "in_world", rel);
      if (fm.reveals !== undefined) {
        if (!Array.isArray(fm.reveals) || fm.reveals.some((r) => typeof r !== "string" || !ENTITY_REF_RE.test(r))) {
          err("session_reveals", "reveals must be a list of entity refs (oa_id or oa_id#section)", rel);
        }
      }
      break;
    }
    default:
      break;
  }
}

function validateWorldDate(date, keyName, rel) {
  if (typeof date !== "object" || date === null) {
    err("world_date", `${keyName} must be a {year, month, day} map`, rel);
    return false;
  }
  for (const part of ["year", "month", "day"]) {
    if (!Number.isInteger(date[part])) {
      err("world_date", `${keyName}.${part} must be an integer`, rel);
      return false;
    }
  }
  if (date.month < 1 || date.day < 1) {
    err("world_date", `${keyName} month and day are 1-based`, rel);
    return false;
  }
  return true;
}

function validateCalendar(calendar, rel) {
  if (typeof calendar !== "object" || calendar === null) {
    err("calendar_shape", "calendar must be a map", rel);
    return;
  }
  let months = null;
  if (calendar.months !== undefined) {
    if (!Array.isArray(calendar.months) || calendar.months.some((m) => typeof m?.name !== "string" || !Number.isInteger(m?.days) || m.days < 1)) {
      err("calendar_months", "calendar.months must be a list of { name, days >= 1 }", rel);
    } else {
      months = calendar.months;
    }
  }
  if (calendar.weekdays !== undefined && (!Array.isArray(calendar.weekdays) || calendar.weekdays.some((w) => typeof w !== "string"))) {
    err("calendar_weekdays", "calendar.weekdays must be a list of names", rel);
  }
  if (calendar.elapsed_days !== undefined && (!Number.isInteger(calendar.elapsed_days) || calendar.elapsed_days < 0)) {
    err("calendar_elapsed", "calendar.elapsed_days must be a non-negative integer", rel);
  }
  if (calendar.current === undefined) {
    err("calendar_current", "calendar.current is required inside the calendar block", rel);
    return;
  }
  if (validateWorldDate(calendar.current, "calendar.current", rel) && months !== null) {
    if (calendar.current.month > months.length) {
      err("calendar_current_month", `calendar.current.month ${calendar.current.month} exceeds the ${months.length} defined months`, rel);
    } else if (calendar.current.day > months[calendar.current.month - 1].days) {
      err("calendar_current_day", `calendar.current.day ${calendar.current.day} exceeds ${months[calendar.current.month - 1].name}'s ${months[calendar.current.month - 1].days} days`, rel);
    }
  }
}

function validateRelationships(fm, rel) {
  if (fm.relationships === undefined) return;
  if (!Array.isArray(fm.relationships)) {
    err("rel_not_list", "relationships must be a list", rel);
    return;
  }
  for (const edge of fm.relationships) {
    if (typeof edge !== "object" || edge === null) { err("rel_shape", "relationship entry must be a map", rel); continue; }
    if (typeof edge.to !== "string" || !ENTITY_REF_RE.test(edge.to)) {
      err("rel_to", `relationship.to ${JSON.stringify(edge.to)} is not a valid entity ref`, rel);
    }
    if (!RELATIONSHIP_KINDS.has(edge.kind)) {
      err("rel_kind", `relationship.kind ${JSON.stringify(edge.kind)} not in closed vocabulary`, rel);
    }
    if (edge.kind === "custom" && typeof edge.label !== "string") {
      err("rel_custom_label", "custom relationships require a label", rel);
    }
    if (edge.strength !== undefined && (!Number.isInteger(edge.strength) || edge.strength < -3 || edge.strength > 3)) {
      err("rel_strength", `relationship.strength ${JSON.stringify(edge.strength)} must be an integer in -3..3`, rel);
    }
    if (edge.revealed !== undefined && typeof edge.revealed !== "boolean") {
      err("rel_revealed", "relationship.revealed must be boolean", rel);
    }
  }
}

// ---- cross-note validation -------------------------------------------------

function baseId(ref) {
  const hash = ref.indexOf("#");
  return hash === -1 ? ref : ref.slice(0, hash);
}

// CCRR / CCCRRR -> 1-based { col, row } (equal-width halves).
function parseHexCoord(coord) {
  const half = coord.length / 2;
  return { col: Number(coord.slice(0, half)), row: Number(coord.slice(half)) };
}

// region oa_id -> grid bounds, for hex-fragment range checking.
const regionGrids = new Map();
for (const note of notes) {
  const fm = note.fm;
  if (fm?.oa_kind !== "region" || typeof fm.oa_id !== "string") continue;
  const grid = fm.region?.grid;
  if (grid && Number.isInteger(grid.columns) && Number.isInteger(grid.rows)) {
    regionGrids.set(fm.oa_id, { columns: grid.columns, rows: grid.rows });
  }
}

function checkHexFragment(ref, context, rel) {
  const hash = ref.indexOf("#");
  if (hash === -1) return;
  const match = HEX_FRAGMENT_RE.exec(ref.slice(hash + 1));
  if (!match) return;
  const grid = regionGrids.get(ref.slice(0, hash));
  if (!grid) return;
  const { col, row } = parseHexCoord(match[1]);
  if (col === 0 || row === 0 || col > grid.columns || row > grid.rows) {
    err("hex_fragment_bounds", `${context} -> ${ref}: hex ${match[1]} is outside the region's ${grid.columns}x${grid.rows} grid (coordinates are 1-based; top-left is 0101)`, rel);
  }
}

function checkEntityRef(ref, roleName, rel) {
  if (typeof ref === "object" && ref !== null) {
    // monster/package reference object
    if (typeof ref.id !== "string" || !OA_ID_RE.test(ref.id)) {
      err("ref_monster_id", `oa_refs.${roleName} package reference has invalid id ${JSON.stringify(ref.id)}`, rel);
    }
    if (typeof ref.package !== "string" || !PACKAGE_REF_RE.test(ref.package)) {
      err("ref_monster_package", `oa_refs.${roleName} package reference needs package "<id>@<version>"`, rel);
    }
    return;
  }
  if (typeof ref !== "string" || !ENTITY_REF_RE.test(ref)) {
    err("ref_grammar", `oa_refs.${roleName} value ${JSON.stringify(ref)} is not a valid reference`, rel);
    return;
  }
  const base = baseId(ref);
  if (!idToPath.has(base)) {
    err("ref_dangling", `oa_refs.${roleName} -> ${ref}: no note with oa_id ${base}`, rel);
  }
  checkHexFragment(ref, `oa_refs.${roleName}`, rel);
}

for (const note of notes) {
  const { fm, rel } = note;
  if (!fm?.oa_refs) continue;
  if (typeof fm.oa_refs !== "object" || Array.isArray(fm.oa_refs)) {
    err("refs_shape", "oa_refs must be a map of role -> ref(s)", rel);
    continue;
  }
  for (const [role, value] of Object.entries(fm.oa_refs)) {
    const list = Array.isArray(value) ? value : [value];
    for (const ref of list) checkEntityRef(ref, role, rel);
  }
  if (Array.isArray(fm.relationships)) {
    for (const edge of fm.relationships) {
      if (typeof edge?.to === "string" && ENTITY_REF_RE.test(edge.to)) {
        if (!idToPath.has(baseId(edge.to))) {
          err("rel_dangling", `relationship -> ${edge.to}: no note with oa_id ${baseId(edge.to)}`, rel);
        }
        checkHexFragment(edge.to, "relationship", rel);
      }
    }
  }
}

// Section names per oa_id, for reveal-log fragment checking.
const sectionsById = new Map();
for (const note of notes) {
  if (typeof note.fm?.oa_id === "string") sectionsById.set(note.fm.oa_id, note.sectionNames ?? new Set());
}

for (const note of notes) {
  const { fm, rel } = note;
  if (!fm) continue;
  // Map pin targets resolve like any other ref.
  if (fm.oa_kind === "map" && Array.isArray(fm.map?.pins)) {
    for (const pin of fm.map.pins) {
      if (typeof pin?.ref !== "string" || !ENTITY_REF_RE.test(pin.ref)) continue;
      if (!idToPath.has(baseId(pin.ref))) {
        err("map_pin_dangling", `map pin -> ${pin.ref}: no note with oa_id ${baseId(pin.ref)}`, rel);
      }
      checkHexFragment(pin.ref, "map pin", rel);
    }
  }
  // Session reveal-log entries resolve; a #section fragment should name a
  // managed section of the target (warning — logs may outlive refactors).
  if (fm.oa_kind === "session" && Array.isArray(fm.reveals)) {
    for (const ref of fm.reveals) {
      if (typeof ref !== "string" || !ENTITY_REF_RE.test(ref)) continue;
      const base = baseId(ref);
      if (!idToPath.has(base)) {
        err("reveal_dangling", `reveals -> ${ref}: no note with oa_id ${base}`, rel);
        continue;
      }
      const hash = ref.indexOf("#");
      if (hash !== -1) {
        const fragment = ref.slice(hash + 1);
        const targetSections = sectionsById.get(base);
        if (targetSections !== undefined && !targetSections.has(fragment)) {
          warn("reveal_fragment_unknown", `reveals -> ${ref}: target has no managed section "${fragment}"`, rel);
        }
      }
    }
  }
}

// ---- per-file player/ rules -------------------------------------------------

for (const note of notes) {
  if (!note.rel.startsWith("player/")) continue;
  if (note.fm?.oa_id !== undefined) {
    err("player_has_id", "Files under player/ are derived shadows and must not carry an oa_id", note.rel);
  }
}

// ---- player/ derivation (spec: normative derived file shape) ----------------

function yamlString(value) {
  if (/^[A-Za-z0-9][A-Za-z0-9 .,'()-]*$/.test(value) && !/^(true|false|null|yes|no)$/i.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function noteInPlayerView(fm) {
  if (!fm) return false;
  return fm.oa_audience === "player" || (fm.oa_reveal !== undefined && fm.oa_reveal !== null);
}

// Body split into alternating gm/generated runs, same grammar as the fences.
function splitSegments(body) {
  const segments = [];
  const beginRe = /<!--\s*oa:generated begin section="([^"]+)"(?:\s+generator="[^"]*")?\s*-->/;
  let rest = body;
  for (;;) {
    const match = beginRe.exec(rest);
    if (!match) {
      if (rest.trim() !== "") segments.push({ kind: "gm", section: null, text: rest });
      return segments;
    }
    const endAt = rest.indexOf("<!-- oa:generated end -->", match.index);
    if (endAt === -1) {
      if (rest.trim() !== "") segments.push({ kind: "gm", section: null, text: rest });
      return segments;
    }
    const before = rest.slice(0, match.index);
    if (before.trim() !== "") segments.push({ kind: "gm", section: null, text: before });
    const interior = rest.slice(match.index + match[0].length, endAt).replace(/^\n/, "").replace(/\n$/, "");
    segments.push({ kind: "generated", section: match[1], text: interior });
    rest = rest.slice(endAt + "<!-- oa:generated end -->".length);
  }
}

function segmentInPlayerView(fm, segment) {
  if (fm.oa_audience === "player") return true;
  if (fm.oa_reveal === undefined || fm.oa_reveal === null) return false;
  if (segment.kind === "gm") return false;
  if (segment.section === "secret") return false;
  if (fm.oa_reveal.status === "revealed") return true;
  return Array.isArray(fm.oa_reveal.sections) && fm.oa_reveal.sections.includes(segment.section);
}

function stripGmMarkers(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\*GM:\*/.test(line.trim()))
    .map((line) => line.replace(/\*\*\[(?:true|false|partial)\]\*\*\s*/g, ""))
    .join("\n");
}

function rewriteWikilinks(text, visibleByPath) {
  return text.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (whole, target, alias) => {
    const clean = target.split("#")[0].trim();
    const resolved = visibleByPath.get(clean) ?? visibleByPath.get(`${clean}.md`);
    if (resolved === true) return whole;
    const display = alias !== undefined ? alias : (clean.split("/").pop() ?? clean).replace(/\.md$/, "");
    return display;
  });
}

function derivePlayerFiles() {
  const sources = notes.filter((note) => !note.rel.startsWith("player/"));
  const visibleByPath = new Map();
  for (const note of sources) visibleByPath.set(note.rel, noteInPlayerView(note.fm));
  const out = new Map();
  for (const note of sources) {
    const fm = note.fm;
    if (!noteInPlayerView(fm)) continue;
    const lines = ["---"];
    if (typeof fm.title === "string") lines.push(`title: ${yamlString(fm.title)}`);
    if (Array.isArray(fm.aliases) && fm.aliases.length > 0) {
      lines.push(`aliases: [${fm.aliases.map((a) => yamlString(String(a))).join(", ")}]`);
    }
    if (Array.isArray(fm.tags) && fm.tags.length > 0) {
      lines.push(`tags: [${fm.tags.map((t) => yamlString(String(t))).join(", ")}]`);
    }
    lines.push("oa_audience: player");
    if (typeof fm.oa_id === "string") lines.push(`oa_source: ${fm.oa_id}`);
    lines.push("---");
    let body;
    if (fm.oa_audience === "player") {
      body = splitSegments(note.body).map((s) => s.text.replace(/^\n/, "").replace(/\n$/, "")).join("\n\n").trim();
    } else {
      body = splitSegments(note.body)
        .filter((s) => segmentInPlayerView(fm, s))
        .map((s) => stripGmMarkers(s.text))
        .join("\n\n")
        .trim();
    }
    body = rewriteWikilinks(body, visibleByPath);
    // The one structured carve-out: revealed quest objectives as a task list.
    if (fm.oa_kind === "quest" && Array.isArray(fm.quest?.objectives)) {
      const revealedObjectives = fm.quest.objectives.filter((o) => o?.revealed === true && typeof o?.text === "string");
      if (revealedObjectives.length > 0) {
        const list = revealedObjectives.map((o) => `- [${o.done === true ? "x" : " "}] ${o.text}`).join("\n");
        body = body === "" ? `## Objectives\n\n${list}` : `${body}\n\n## Objectives\n\n${list}`;
      }
    }
    const content = body === "" ? `${lines.join("\n")}\n` : `${lines.join("\n")}\n\n${body}\n`;
    out.set(`player/${note.rel}`, content);
  }
  return out;
}

// ---- derived index compilation ---------------------------------------------

function compileIds() {
  const sorted = [...idToPath.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`;
}

function compileRelationships() {
  const edges = [];
  const seen = new Map(); // dedupe/conflict key -> edge
  for (const note of notes) {
    const fm = note.fm;
    if (!fm || typeof fm.oa_id !== "string" || !Array.isArray(fm.relationships)) continue;
    for (const edge of fm.relationships) {
      if (typeof edge?.to !== "string" || !RELATIONSHIP_KINDS.has(edge.kind)) continue;
      const record = {
        from: fm.oa_id,
        to: edge.to,
        kind: edge.kind,
        ...(edge.label !== undefined ? { label: edge.label } : {}),
        ...(edge.strength !== undefined ? { strength: edge.strength } : {}),
        ...(edge.secret !== undefined ? { secret: edge.secret } : {}),
        ...(edge.revealed !== undefined ? { revealed: edge.revealed } : {}),
        source_file: note.rel,
      };
      const pairKey = SYMMETRIC_KINDS.has(edge.kind)
        ? [record.from, record.to].sort().join("|") + "|" + edge.kind
        : `${record.from}>${record.to}|${edge.kind}`;
      if (seen.has(pairKey)) {
        const prior = seen.get(pairKey);
        const differs =
          prior.strength !== record.strength ||
          prior.secret !== record.secret ||
          prior.revealed !== record.revealed ||
          prior.label !== record.label;
        if (differs) {
          err("rel_conflict", `Conflicting duplicate ${edge.kind} edge between ${record.from} and ${record.to} (also declared in ${prior.source_file})`, note.rel);
        } else {
          warn("rel_duplicate", `Duplicate ${edge.kind} edge between ${record.from} and ${record.to} (also declared in ${prior.source_file}) — declare each edge once; the index materializes both directions`, note.rel);
        }
        continue;
      }
      seen.set(pairKey, record);
      edges.push(record);
      if (SYMMETRIC_KINDS.has(edge.kind)) {
        edges.push({ ...record, from: record.to, to: record.from });
      }
    }
  }
  edges.sort((a, b) => {
    const ka = `${a.from}|${a.kind}|${a.to}`;
    const kb = `${b.from}|${b.kind}|${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return `${JSON.stringify({ oa_spec: SPEC_VERSION, edges }, null, 2)}\n`;
}

const playerFiles = derivePlayerFiles();
const derived = {
  "_index/ids.json": compileIds(),
  "_index/relationships.json": compileRelationships(),
  ...Object.fromEntries(playerFiles),
};

// Previously derived player files whose source went dark: delete on write,
// error on check. Marker-less files under player/ are someone's mistake and
// are only flagged — nothing hand-authored belongs there, but we never
// delete what we did not write.
const stalePlayer = [];
for (const note of notes) {
  if (!note.rel.startsWith("player/") || playerFiles.has(note.rel)) continue;
  if (note.fm?.oa_audience === "player") stalePlayer.push(note.rel);
  else warn("player_foreign_file", "File under player/ without the oa_audience: player marker — player/ is derived, nothing hand-authored belongs here", note.rel);
}

if (writeIndex) {
  if (errors.length === 0) {
    for (const [relPath, content] of Object.entries(derived)) {
      mkdirSync(join(vaultDir, relPath, ".."), { recursive: true });
      writeFileSync(join(vaultDir, relPath), content, "utf8");
      console.log(`wrote ${relPath}`);
    }
    for (const relPath of stalePlayer) {
      rmSync(join(vaultDir, relPath));
      console.log(`removed ${relPath} (source no longer player-visible)`);
    }
  } else {
    console.error(`--write-index skipped: vault has ${errors.length} error(s); derived indexes are only written for a clean vault.`);
  }
}

if (checkDerived) {
  for (const [relPath, content] of Object.entries(derived)) {
    const full = join(vaultDir, relPath);
    if (!existsSync(full)) {
      err("derived_missing", `Derived file missing — run with --write-index`, relPath);
      continue;
    }
    const onDisk = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    if (onDisk !== content) {
      err("derived_drift", `Derived file is stale — run with --write-index`, relPath);
    }
  }
  for (const relPath of stalePlayer) {
    err("derived_stale", `Derived player file's source is no longer player-visible — run with --write-index`, relPath);
  }
}

// ---- report ----------------------------------------------------------------

for (const w of warnings) console.warn(`WARN ${w.code} [${w.file}] ${w.message}`);
for (const e of errors) console.error(`ERROR ${e.code} [${e.file}] ${e.message}`);
console.log(`\n${files.length} notes, ${idToPath.size} ids, ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length > 0) process.exit(1);
console.log("vault OK");
