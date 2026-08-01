# AGENTS.md — Campaigns on Automatic

Conventions for coding agents working in this repository. This is a **public
data/spec repo** in the Dungeons on Automatic family — the sibling of
`DungeonsOnAutomaticMonsters`. The Electron apps (DungeonsOnAutomatic,
HexesOnAutomatic) are private; this repo holds only what is public.

## What this repo is

- `spec/` — the Campaign Vault specification (three documents; the vault
  format shared by Dungeons/Hexes/Towns on Automatic).
- `schema/vault.schema.json` — JSON Schema for note frontmatter, `$id` under
  this repo's URL.
- `scripts/validate-vault.mjs` — the reference validator and `_index/`
  compiler. Node ESM, single dependency (`yaml`). Structured errors
  `{code, message, file}`; exit 1 on any error.
- `examples/greenreach-vale/` — a small example vault that must always
  validate. It is the fixture for every consumer.

## Rules

1. **Spec, schema, validator, and example move together.** Any change to one
   that affects the others lands in the same commit. `npm test` (validator
   `--check` over the example) is the gate; CI runs it on every PR and push.
2. **IDs are consumer-stored keys.** Never rename an `oa_id`, a frontmatter
   key, a closed-vocabulary value, or a managed-section name that has shipped
   in a tagged release. Additive evolution only; removals require a spec
   version bump and a migration note in the spec.
3. **Spec version discipline.** `oa_spec` is dotted-numeric (family
   convention, not semver). Bump it when the format changes shape; document
   forward-only migration steps in the spec document.
4. **Derived files are regenerable.** `_index/`, `factions/relationship-map.md`
   and `player/` outputs must be byte-reproducible from the rest of the vault
   (`--write-index` then `--check` passes). Pin `eol=lf` in .gitattributes for
   anything byte-compared.
5. **Licensing is a scope map** (LICENSE.md): CC BY 4.0 for spec/example
   content, MIT for schema/tooling. No copyrighted game text anywhere — book
   references are raw codes (`DF3-8`), never prose, never `file:///` links.
6. **No new dependencies** without explicit approval. The validator's `yaml`
   dependency is the only one.
7. **Frozen foreign keys.** `enraged_eggplant_*` / `doa_*` monster ids, the
   package id `enraged-eggplant-monsters`, and sourceBook id
   `enraged_eggplant_monsters_2024_05_11` belong to the monsters repo; refer,
   never mint.

## Commands

```bash
npm ci
npm test               # validate example vault + derived-index check
npm run index          # rebuild example _index/ after editing example content
node scripts/validate-vault.mjs <vault> [--write-index] [--check]
```

## Cross-repo context

- The apps' engineering conventions live in the private app repos' AGENTS.md.
- The monster package contract lives in DungeonsOnAutomaticMonsters
  (`schema/monster.schema.json`, `scripts/package-identity.mjs`).
- The public site (DungeonsOnAutomaticSite) mirrors released data; if vault
  artifacts are ever published there, follow the monsters repo's
  release-tag + site-mirror pattern (`campaign-vault-vX.Y.Z`, dispatch + cron).
