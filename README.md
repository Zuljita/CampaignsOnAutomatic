# Campaigns on Automatic

The **Campaign Vault** — an Obsidian-compatible markdown format that connects
the "on Automatic" family of tabletop tools into one shared campaign world:

- [Dungeons on Automatic](https://dungeonsonautomatic.com) — keyed dungeon sites
- Hexes on Automatic — overworld hex regions *(in development)*
- Towns on Automatic — settlements *(planned)*

The vault is the world; each app is a lens on it. A campaign vault is a plain
directory of markdown files with YAML frontmatter — open it in
[Obsidian](https://obsidian.md), read it in any editor, keep it in git, and it
stays fully usable even with no apps installed. **No lock-in is the point:**
the format is public so user campaigns never depend on private software.

## What's here

| Path | What | License |
| --- | --- | --- |
| [`spec/campaign-vault-spec.md`](spec/campaign-vault-spec.md) | The core vault format: layout, frontmatter, IDs, managed regions, GM/player split | CC BY 4.0 |
| [`spec/entity-model.md`](spec/entity-model.md) | NPCs, factions, and the relationship map shared by all three apps | CC BY 4.0 |
| [`spec/interop-contracts.md`](spec/interop-contracts.md) | App ownership matrix, per-kind contracts, cross-app commissions | CC BY 4.0 |
| [`schema/vault.schema.json`](schema/vault.schema.json) | JSON Schema for note frontmatter | MIT |
| [`scripts/validate-vault.mjs`](scripts/validate-vault.mjs) | Reference validator + index compiler | MIT |
| [`examples/greenreach-vale/`](examples/greenreach-vale/) | A small example campaign vault | CC BY 4.0 |

## Quick start

```bash
npm ci
npm test          # validate the example vault + check derived indexes
```

To validate your own vault:

```bash
node scripts/validate-vault.mjs path/to/your/vault
node scripts/validate-vault.mjs path/to/your/vault --write-index   # rebuild _index/
```

## Design in one paragraph

Every note carries a stable, immutable `oa_id`; apps reference ids, humans
follow wikilinks. Each generated file has exactly one owning app, and generated
prose lives inside `<!-- oa:generated -->` fences so GM writing outside them
survives every regeneration. Cross-app linkage (which hex holds which dungeon,
who leads which faction) lives in the vault — never inside app state — and the
NPC/faction relationship graph is a vault-owned layer with a closed edge
vocabulary, compiled to `_index/relationships.json` and a Mermaid map. Content
is stored, not recipes: seeds travel as best-effort extras, but the markdown
and saved state are the artifacts of record.

## Status

Spec 0.2.0 (draft) — 0.1.0 plus the campaign layer: calendar, quests, maps with
pins, reveal states, and the campaign note's `setting-questions` region (all
additive; 0.1.0 vaults remain valid). Hexes on
Automatic is the first vault-native writer and Campaigns on Automatic the
first whole-vault reader;
Dungeons on Automatic's existing GM markdown + state exports drop into a vault
by hand today (Stage 0 in the interop contracts), with native support staged
behind it.

Issues and discussion: this repo's issue tracker. Monster data lives in
[DungeonsOnAutomaticMonsters](https://github.com/Zuljita/DungeonsOnAutomaticMonsters);
the public site source is
[DungeonsOnAutomaticSite](https://github.com/Zuljita/DungeonsOnAutomaticSite).
