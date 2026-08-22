# Campaign Vault Specification

**Spec version:** 0.2.0
**Status:** Draft — implemented first by Hexes on Automatic (writer) and
Campaigns on Automatic (reader); Dungeons on Automatic and Towns on Automatic
adopt in stages (see [interop-contracts.md](interop-contracts.md)).

**0.2.0 adds** (2026-08-20, all additive — every valid 0.1.0 vault remains
valid, no migration required): the campaign layer the lenses share — a
campaign **calendar** with a current date and elapsed-day counter, dated
**session** metadata and a per-session reveal log, the **quest** kind (threads
with objectives), the **map** kind (image maps with entity-linked pins), and
**reveal states** (`oa_reveal`, plus `revealed` on relationship edges and map
pins) — the fact-level "what do the players know" layer that player exports
derive from. It also gives the campaign note a **setting-questions** managed
region: the GM's own answers to the questions players ask about a setting,
kept in the vault where every lens can read them — and, for the ones the
campaign cannot answer yet, the **`npc` commission kind**, so "there is no
wizard in this land" can become a work order for the app that makes people
(see [interop-contracts.md](interop-contracts.md)). Files that use none of the new
vocabulary may keep stamping `oa_spec: 0.1.0`.

## What this is

A campaign vault is an **Obsidian-compatible markdown directory** that acts as
the shared campaign layer between the "on Automatic" family of tools:

- **Dungeons on Automatic (DOA)** — keyed dungeon sites
- **Hexes on Automatic (HOA)** — overworld hex regions
- **Towns on Automatic (TOA)** — settlements

The vault is the *world*; each app is a *lens* that generates or edits one kind
of thing in it. A GM can open the vault directly in Obsidian (or any editor),
read everything, and write anywhere — the format is designed so app-generated
content and GM-authored content coexist in the same files without either
clobbering the other.

## Design principles

These are inherited from the family's existing rules and are load-bearing:

1. **Local-first.** The vault is a directory on the user's disk. No server, no
   network access at read or write time. Apps and GMs are the only writers.
2. **Store the site, not the recipe.** Vault pages carry full rendered content.
   Seeds and generation profiles travel as opaque attachments for best-effort
   regeneration, but regeneration is *never promised* to reproduce content.
   (Owner ruling 2026-07-30: determinism is an internal test mechanism, not a
   product promise.)
3. **IDs are consumer-stored keys.** Once an `oa_id` is written to disk it is
   immutable forever. Display names, file names, and titles may all change; the
   id may not. Other apps and other files will have stored it.
4. **The dungeon does not know about the world.** (SiteCommission doctrine.)
   Cross-app linkage lives in the vault, not inside app state. DOA never learns
   hex coordinates; HOA never reaches into room lists. Apps compose through
   vault references, not shared internals.
5. **One writer per file.** Every generated file names its owning app. Other
   apps read it; only the owner regenerates it. GMs may edit anything, and
   GM edits are protected (see Managed regions).
6. **GM-canonical, player-safe by export.** The vault is a GM document set.
   Player-facing output is a *derived export*, produced by the same field-level
   leak rules DOA uses (`gm`/`player` view modes). Secrets never depend on a
   reader politely skipping a section.
7. **Degrade to plain markdown.** Every machine convention (frontmatter keys,
   managed-region comments, wikilinks) must render acceptably in a vanilla
   markdown viewer. A vault with no apps installed is still a usable campaign
   binder.

## Vault layout

```
<campaign-root>/
  campaign.md                    # the campaign root note (kind: campaign)
  regions/
    <region-slug>/
      region.md                  # kind: region        (owner: HOA)
      hexes/
        hex-0101.md              # kind: hex           (owner: HOA)
        hex-0102.md
  settlements/
    <settlement-slug>.md         # kind: settlement    (owner: TOA)
  sites/
    <site-slug>/
      site.md                    # kind: site          (owner: DOA)
      key.md                     # GM room key export  (owner: DOA)
      state/                     # opaque app saves (e.g. doa-dfrpg-<seed>.json)
  npcs/
    <npc-slug>.md                # kind: npc           (owner: vault — any app may mint)
  factions/
    <faction-slug>.md            # kind: faction       (owner: vault — any app may mint)
    relationship-map.md          # generated mermaid map (derived, regenerable)
  quests/
    <quest-slug>.md              # kind: quest         (owner: GM — apps may mint stubs)
  maps/
    <map-slug>.md                # kind: map           (owner: GM; images live under assets/)
  sessions/
    <date>-<slug>.md             # kind: session       (owner: GM)
  commissions/
    <slug>.request.json          # cross-app work orders (see interop-contracts.md)
  assets/                        # images, exported maps, handouts
  player/                        # derived player-safe exports (regenerable)
  _index/                        # generated machine indexes (regenerable)
    ids.json                     # oa_id -> vault-relative path
    relationships.json           # compiled relationship edges
```

Rules:

- Folder names above are **canonical**. Apps must create them as needed and
  must not invent sibling meanings for them.
- `player/` and `_index/` and `factions/relationship-map.md` are **derived** —
  any app (or the validator tool) may regenerate them from the rest of the
  vault. Nothing hand-authored belongs there.
- Unknown files and folders are **preserved and ignored**. GMs will add their
  own notes anywhere; apps must never delete or "clean up" what they do not own.
- File names are human-readable slugs. Renaming a file is legal (Obsidian
  users will); identity lives in `oa_id`, and `_index/ids.json` re-resolves
  paths. Apps must resolve references id-first, path-second.

## File format

Every vault note is UTF-8 markdown with YAML frontmatter:

```markdown
---
title: Mirefall Warren
aliases: [The Warren]
tags: [site, dungeon, goblinoid]
oa_id: site_k3f9x2
oa_kind: site
oa_spec: 0.1.0
oa_generator: dungeons-on-automatic@0.1.71
oa_status: active
oa_refs:
  region: reg_b8h2m4
  hex: reg_b8h2m4#hex-0407
  factions: [fac_goblinoid_raiders]
---

# Mirefall Warren

GM prose here, written by hand, survives every regeneration.

<!-- oa:generated begin section="digest" -->
...app-owned content...
<!-- oa:generated end -->
```

### Frontmatter keys

Human lane (Obsidian-native, freely editable):

| Key | Meaning |
| --- | --- |
| `title` | Display name. Freely renameable. |
| `aliases` | Obsidian aliases. |
| `tags` | Obsidian tags. Apps append; never remove GM tags. Hierarchical tags (`faction/religious`) welcome. |

Machine lane (all keys prefixed `oa_`; apps own these, GMs edit at their own risk):

| Key | Required | Meaning |
| --- | --- | --- |
| `oa_id` | yes | Stable id. Immutable once written. See ID scheme. |
| `oa_kind` | yes | One of: `campaign`, `region`, `hex`, `settlement`, `site`, `npc`, `faction`, `quest`, `map`, `session`, `faction_map`. |
| `oa_spec` | yes | Vault spec version this file was written against (dotted numeric string). |
| `oa_generator` | generated files | `<app-package-name>@<version>` of the writing app. Absent on pure GM notes. |
| `oa_status` | no | `stub` \| `active` \| `retired`. `stub` marks a placeholder minted by one app for another (or the GM) to fill. Default `active`. |
| `oa_refs` | no | Map of named references to other vault entities by `oa_id` (see References). |
| `oa_locks` | no | List drawn from `content`, `narrative`, `geometry`. Mirrors DOA's preservation locks: the owning app must not regenerate locked aspects of this file. |
| `oa_audience` | no | `gm` (default) \| `player`. Files under `player/` are `player`. |
| `oa_reveal` | no | The note's player-knowledge state — see GM/player split. Absent = hidden (GM-only), the default for everything a GM or app writes. |
| `relationships` | npc/faction | Typed relationship edges — see [entity-model.md](entity-model.md). Not `oa_`-prefixed because GMs are *encouraged* to author these. |

Kind-specific keys are defined in [entity-model.md](entity-model.md) (npc,
faction), the kind contracts in [interop-contracts.md](interop-contracts.md),
and the JSON schema (`schema/vault.schema.json` `$defs`). Consumers must
**ignore unknown keys and preserve them on rewrite** — the frontmatter is an
open namespace with the same pass-through rule as DOA's `generationConfig`.

### Versioning and migration

`oa_spec` follows the family's dotted-numeric convention (missing segments are
0; no semver prerelease tags). Rules, copied from DOA's save-file contract:

- Readers apply **forward-only migrations** step by step to older files.
- A file written by a **newer** spec than the reader understands produces a
  typed soft failure; the file is preserved verbatim, never rewritten, never
  discarded.
- Missing `oa_spec` is treated as `0.0.0` (a pure GM note); apps must still
  read it as best-effort markdown.

## ID scheme

`oa_id` grammar: `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` (snake_case, like every id in
the family). Uniqueness scope is the vault.

Minting conventions (conventions, not requirements — the only hard rules are
grammar, uniqueness, and immutability):

- **Kind prefix:** `camp_`, `reg_`, `set_`, `site_`, `npc_`, `fac_`, `sess_`.
  Hex ids carry no leading prefix of their own — a hex note's id flattens its
  region's id plus coordinate into `<region oa_id>_hex_<CCRR>` (see the hex
  bullet below). Prefix/kind agreement is a validator **warning**
  (`prefix_mismatch`), not an error — the hard rules remain grammar,
  uniqueness, and immutability.
- **Generated entities:** apps should derive ids from their own stable inputs,
  e.g. HOA mints `reg_<seed36>` and derives hex ids positionally (below).
  GM-created notes may use readable slugs (`fac_sacred_order`).
- **Hexes are positional:** hex coordinates are **1-based** — the top-left hex
  is `0101`; a zero column or row component is invalid. A hex's id is
  `<region oa_id>#hex-<CCRR>` where `CC`/`RR` are zero-padded column/row in
  the region's offset grid. Hex *files* carry
  `oa_id: <region oa_id>_hex_<CCRR>` (flattened, since `#` is reserved).
  Location references to hexes always use the fragment form
  `<region oa_id>#hex-CCRR`; the flattened form appears only as the hex note's
  own `oa_id`.
- **Never mint into foreign namespaces.** `doa_*`, `enraged_eggplant_*` and
  other published-package id spaces belong to their packages.

### Compound references

App-internal entities (a room inside a site, a district inside a settlement)
are addressed as `<oa_id>#<app-internal-id>`:

```
site_k3f9x2#room_13        # DOA room id, per-dungeon base36 — unique only inside that site
reg_b8h2m4#hex-0407        # hex by coordinate inside a region
set_a77c1p#district_2      # a TOA district
```

The fragment's grammar and meaning belong to the owning app. DOA room ids
(`room_<base36>`) are unique **per dungeon only** — the `site_` prefix is what
makes them world-unique. Consumers must treat fragments as opaque keys.

## References and links

Two parallel mechanisms, both required of writing apps:

1. **Machine references** (`oa_refs` in frontmatter): a map from role names to
   `oa_id`s (or lists of them, or compound refs). Roles are defined per kind in
   the kind contracts ([interop-contracts.md](interop-contracts.md)): `region`,
   `hex`, `settlement`, `site`, `factions`, `npcs`, `monsters`, `parent`, ...
   This is what apps resolve.
2. **Wikilinks in prose** (`[[npcs/Aethgrim|Aethgrim]]`): for humans and
   Obsidian's graph view. Apps writing prose should emit wikilinks with
   explicit vault-relative paths and a display alias, matching the established
   Arden Vul vault style. Wikilinks are *presentation*; if a wikilink and an
   `oa_refs` entry disagree, the `oa_refs` entry wins.

Monster references (to the published monster library) are **not** vault
entities. They are external package references and keep the package's own keys:

```yaml
oa_refs:
  monsters:
    - id: enraged_eggplant_aboleth          # monsterId — the durable key
      package: enraged-eggplant-monsters@0.5.0
      bestiaryUrl: https://dungeonsonautomatic.com/monsters#enraged_eggplant_aboleth
```

Store `monsterId` + `package@version`; treat any embedded stat text as a cached
snapshot. Never reconstruct asset URLs from ids (the CDN path needs the source
key, which ids do not carry) — copy the URLs the package provides.

## Managed regions

Generated markdown lives inside comment-fenced regions:

```markdown
<!-- oa:generated begin section="digest" -->
One-paragraph site pitch, hooks, danger band...
<!-- oa:generated end -->
```

Rules (this is the vault's edit-preservation contract, mirroring DOA's
content/narrative/geometry preservation locks):

- Everything **outside** a managed region is GM-authored. Apps never modify,
  reorder, or delete it. Regeneration rewrites only the interior of regions
  whose `section` name the app owns, in place.
- A begin fence MAY carry an informational `generator="..."` attribute after
  the section name
  (`<!-- oa:generated begin section="digest" generator="dungeons-on-automatic@0.1.71" -->`).
  Writers are not required to emit it; readers treat it as provenance display
  only.
- `section` names are stable identifiers, unique within a file, declared per
  kind in the kind contracts ([interop-contracts.md](interop-contracts.md)).
  Unknown sections are preserved untouched.
- If a GM edits *inside* a managed region and wants to keep the edit, they
  either delete the fence markers (the content becomes GM-authored and the app
  will re-add its own region elsewhere... it must not overwrite) or add the
  matching lock to `oa_locks` (`content`, `narrative`, or `geometry` — each
  section declares which lock class governs it).
- A file that is 100% generated (e.g. `key.md`, `relationship-map.md`) may
  declare `oa_locks: []` and a single whole-file region; the owner may rewrite
  it wholesale *only* when no locks are present.

## GM/player split and reveal states

Everything outside `player/` is GM material **by default** — the vault is
spoiler-safe to write in freely because disclosure is always an explicit act.
0.2.0 makes the knowledge layer concrete: reveal state lives in the vault (the
GM's own files, portable forever), and player exports are a pure derivation
over it.

### Reveal state (`oa_reveal`)

```yaml
oa_reveal:
  status: revealed        # or: partial
  sections: [digest]      # partial only: the revealed managed-section names
```

- **Absent means hidden.** A note without `oa_reveal` (and without
  `oa_audience: player`) is GM-only.
- `status: revealed` — the whole note is player-known (its GM-only fields and
  secret edges are still stripped on export; see the leak rules).
- `status: partial` — only the managed sections listed in `sections` are
  player-known; GM prose and unlisted sections stay hidden. `sections` names
  refer to the file's own `oa:generated` section names.
- Relationship edges may carry `revealed: true` (see
  [entity-model.md](entity-model.md)); map pins may carry `revealed: true`
  (see the map kind contract). A `secret: true` edge that later carries
  `revealed: true` is a *disclosed* secret — both flags stay, preserving the
  history.
- Reveal state is **current knowledge**; the per-session `reveals` log on
  session notes (see the session contract) is **history**. The two are
  related but not enforced against each other — a GM may prune either.
- **Who writes reveal state:** the campaign lens (or the GM by hand) may add
  or update `oa_reveal` on any note, set `revealed: true` on any relationship
  edge, and append to a session's `reveals` log — regardless of which app
  owns the file. Reveal state is campaign-layer data that happens to live on
  the entity's note; owners must preserve it on regeneration like any other
  frontmatter they did not write.

### Player exports (`player/`)

Derived files under `player/` — `oa_audience: player`, regenerated on demand,
never hand-edited — produced by the leak rules below with the same
single-predicate discipline as DOA's `includeRoomKeyFeature`: one exported
function decides, every consumer calls it.

**The derived file shape** (normative, so independent implementations agree
byte for byte; the reference validator's `--write-index` derives it and
`--check` compares it):

- One file per player-visible source note, at `player/<source path>` — so
  `player/` opened as its own vault root mirrors the campaign's structure and
  explicit-path wikilinks keep resolving.
- Frontmatter, in exactly this order and nothing else: `title`, `aliases`,
  `tags` (each only when the source has them — the human lane names what
  players know exists), then `oa_audience: player`, then
  `oa_source: <source oa_id>` (when the source is a machine note). Player
  files carry **no** `oa_id` — they are derived shadows, not entities, and a
  copied id would collide with its source.
- Body: for `oa_audience: player` sources, the source body with the
  `oa:generated` fence markers stripped (content kept; run boundaries
  normalize to exactly one blank line). For reveal-based sources, the
  player-visible section bodies in document order, joined by single blank
  lines, fence markers stripped, GM markers stripped (rule 5).
- Wikilinks in the exported body: a link whose target (before any `#`)
  resolves as an explicit vault-relative path (with or without `.md`) to a
  player-visible note is kept as written; any other wikilink is replaced by
  its display text (its alias, else the target's last path segment). Hidden
  things are absent even as link targets.
- Regeneration replaces the whole tree: a previously derived file (one
  carrying the `oa_audience: player` marker) whose source is no longer
  player-visible is deleted. Files under `player/` without the marker are
  someone's mistake and are left alone (and flagged).
- One structured carve-out: a quest note's **revealed objectives** derive as
  a markdown task list appended after the body — a `## Objectives` heading,
  then `- [x] `/`- [ ] ` lines (done/undone) in declaration order, revealed
  objectives only.
- v1 scope note: beyond that, player files are prose — other kind blocks
  (map pins, calendar), relationship edges, and referenced assets are not
  yet carried; the campaign lens's live player view covers them until a
  later revision defines their derived shapes.

The leak rules, normative for any deriving tool:

1. A note enters the player export iff `oa_audience: player` or
   `oa_reveal.status` is present.
2. `partial` notes keep only the sections listed in `oa_reveal.sections`;
   GM prose outside managed regions is never exported (it is the GM's
   private lane) unless the note is `oa_audience: player`. A managed section
   named `secret` is always GM-only regardless of reveal status — it is the
   established excisable-secret section (hex secrets), and `revealed` on the
   note must not sweep it along.
3. Relationship edges export iff not `secret`, or `secret` with
   `revealed: true`. Edge `notes` and any `gm_note`-suffixed field never
   export.
4. Map pins export iff the pin is `revealed: true` or the pin's target note
   passes rule 1.
5. Rumor veracity markers (`**[true|false|partial]**`) and `*GM:*` lines are
   stripped from exported section bodies.
6. Hidden content must be absent — not greyed out, not elided-with-a-stub —
   and derived search indexes over `player/` must not contain it.

## Source attribution

The vault carries the family's licensing posture:

- Every generated file that draws on published game material records raw
  references (`sourceBook` ids, page codes like `DF3-8`) — never resolved
  local-path links (`file:///...pdf#page=N` embeds a user's disk layout) and
  never copyrighted prose or rules text.
- Monster stat snapshots keep their `provenance` credits when embedded.
- Example/public vault content is CC BY 4.0 (see repo LICENSE.md).

## Validation

`scripts/validate-vault.mjs` in this repo walks a vault and enforces:

- frontmatter parses; required keys present per kind; `oa_spec` readable
- `oa_id` grammar and uniqueness (errors); kind-prefix agreement (warning)
- every `oa_refs` target resolves to an existing `oa_id` (or is an explicit
  external package reference)
- relationship edges use the closed kind vocabulary or declare `kind: custom`
- managed-region fences are balanced and sections unique per file
- `oa_reveal` uses the closed status vocabulary; `partial` lists at least one
  section (a listed section missing from the file is a warning); quest, map,
  and campaign-calendar blocks follow their kind contracts, and session
  `reveals` entries resolve like any other ref
- derived files are re-derivable: `--check` regenerates and byte-compares
  `_index/` and the `player/` export; a file under `player/` carrying an
  `oa_id` is an error (derived shadows are not entities), and one without the
  `oa_audience: player` marker is flagged as foreign. Extending the same
  check to `relationship-map.md` is planned.

Vaults are allowed to be *incomplete* (stubs, dangling wikilinks in prose) but
never *inconsistent* (dangling `oa_refs`, duplicate ids).
