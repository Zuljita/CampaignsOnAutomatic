# Interop Contracts — How the Apps Share a Vault

**Spec version:** 0.2.0 · Part of the [Campaign Vault Specification](campaign-vault-spec.md).

## Ownership matrix

| Vault path | Kind | Owner (writer) | Readers |
| --- | --- | --- | --- |
| `campaign.md` | `campaign` | GM (apps update `oa_refs`, `calendar.current`, `calendar.elapsed_days`, and `party.location` only; the campaign lens owns the `setting-questions` region) | all |
| `regions/*/region.md` | `region` | Hexes on Automatic | all |
| `regions/*/hexes/*.md` | `hex` | Hexes on Automatic | all |
| `settlements/*.md` | `settlement` | Towns on Automatic | all |
| `sites/*/site.md`, `key.md`, `state/` | `site` | Dungeons on Automatic | all |
| `npcs/*.md`, `factions/*.md` | `npc`/`faction` | shared (minting app or GM; see entity-model) | all |
| `quests/*.md` | `quest` | GM (apps may mint stubs, `oa_status: stub`) | all |
| `maps/*.md` | `map` | GM (hand-placed pins are the GM's; apps never regenerate them) | all |
| `sessions/*.md` | `session` | GM (the campaign lens may append to `reveals`) | all |
| `commissions/*` | — | requesting app writes request; fulfilling app writes result | both |
| `player/`, `_index/`, `factions/relationship-map.md` | derived | any writer, deterministic output | all |

"Owner" means: the only app that regenerates the file's managed regions.
Everyone else treats the file as read-only reference data. GMs outrank owners
everywhere (managed regions + `oa_locks` are how their edits survive).

## Kind contracts

### `campaign` — campaign.md

Root note. `oa_refs`: `regions`, `settlements`, `sites` (lists — apps append
their entities on creation). Body: GM material. Frontmatter extras:
`system: dfrpg` (the family is DFRPG-focused; other values are legal but
unsupported today), and optionally the shared campaign **calendar**:

```yaml
calendar:
  months:                        # optional; omit for an abstract day-count calendar
    - { name: Thawmoot, days: 30 }
    - { name: Greentide, days: 30 }
  weekdays: [Firstday, Middleday, Lastday]   # optional
  year_label: VR                 # optional era suffix for display
  current: { year: 837, month: 6, day: 12 }  # the one current in-world date
  elapsed_days: 47               # campaign day counter since play began
```

Rules: `current` is required inside the block (`month` is a 1-based index
into `months` when months are given); `elapsed_days` is a non-negative
integer. This is the shared clock every lens reads. Region-local day counters
(Hexes' campaign state) sync to `elapsed_days` **by offset** — mapping shared
days onto their own counters, never re-keying their deterministic
derivations. A lens that plays time forward writes the higher
`elapsed_days` back (advancing `current` by the same delta); a lens that
finds the shared clock ahead of its own mapping catches its local counter up
instead. The clock never rewinds.

And the party's one continuous position across the lenses:

```yaml
party:
  location: reg_b8h2m4#hex-0506   # any entity ref — a hex, a settlement, a site
```

`party.location` is updated by whichever lens the party is currently moving
through (Hexes as they cross hexes, Towns when they enter a settlement,
Dungeons when they descend) — the cross-app travel record is the succession
of values, remembered by each lens's own log and the session notes.

Managed sections: `setting-questions` (campaign lens).

#### The `setting-questions` region

The answers to the questions players actually ask about a setting — *where do
we buy gear, who heals us, who is the mightiest wizard, what is there to eat*.
The tradition is Jeff Rients' [Twenty Quick Questions for Your Campaign
Setting](https://jrients.blogspot.com/2011/04/twenty-quick-questions-for-your.html)
(2011); the vault's contribution is keeping the answers **in the campaign
instead of in the GM's head**, one file every lens already opens.

The region lives in `campaign.md` and is owned by the campaign lens. Its
interior is a flat list of answered questions:

```markdown
<!-- oa:generated begin section="setting-questions" generator="campaigns-on-automatic@0.1.0" -->
### 2. Where does the party buy ordinary adventuring gear?

Bracken Ford's market row, three days out. Anything above a woodsman's kit is
a special order through [[npcs/skarn-halfweight|Skarn]] and takes a season.

### 21. Who do we pay when the ford floods?

The reeve, in barley, and she remembers who was short.
<!-- oa:generated end -->
```

Grammar — the whole of it:

- One `### <n>. <question>` heading per answered question, `<n>` a positive
  integer, followed by the answer as ordinary markdown until the next heading
  or the end fence.
- **Only answered questions appear.** An unanswered question is an absent
  heading, not an empty one; the region is a record, not a form.
- Numbers **1–20** are the canonical question set. The set — its wording and
  its order — belongs to the campaign lens, not to this spec, so it can be
  reworded for a system's vocabulary without a spec bump; the number is what
  the lens keys an answer to. Numbers **21 and up** are the GM's own
  questions: their heading text is GM-authored and every writer must round-trip
  it unchanged.
- Foreign consumers (a lens that did not write the region) read it as
  **heading text plus answer prose** and ignore the numbering. Nothing else in
  the vault may key off these numbers.

Rules:

- The region is the one part of `campaign.md` an app may rewrite, and it
  rewrites the **whole** interior from the answers it parsed — so a GM's edits
  made in Obsidian survive by being read back in, not by being avoided. The
  usual escape hatches still apply (delete the fences, or add a `content` lock).
- The answers are the **GM's**, whatever drafted them. A lens with a model
  behind it may propose an answer, but nothing lands in the vault until the GM
  keeps it, and the region records no authorship — an answer here is campaign
  fact, the same as prose the GM typed.
- Like any managed section it is GM material by default and participates in the
  reveal model unchanged: naming `setting-questions` in the campaign note's
  `oa_reveal.sections` turns the answers into a player-facing setting primer,
  and until then they do not derive into `player/`.

### `quest` — quests/\<slug\>.md (GM; apps may mint stubs)

The campaign's threads. Prefix `quest_`. Frontmatter extras:

```yaml
quest:
  status: active                 # rumored|active|completed|failed|abandoned
  objectives:
    - text: Find the back entrance under the falls
      done: true                 # optional, default false
      revealed: true             # optional, default false — player-visible objective
oa_refs:
  giver: npc_hedda_carse         # optional
  targets: [site_k3f9x2, fac_goblinoid_raiders]   # optional — what the thread points at
```

An objective's `revealed` follows the reveal model: hidden objectives are the
GM's forward plan and never export. A stub quest (`oa_status: stub`) is a
rumor promoted to a thread that nobody has fleshed out yet.

### `map` — maps/\<slug\>.md (GM)

An image map with entity-linked pins — the hand-drawn layer beside the
generated hex atlas. Prefix `map_`. Frontmatter extras:

```yaml
map:
  image: assets/vale-overview.png    # vault-relative; images live under assets/
  pins:
    - { x: 0.42, y: 0.17, ref: set_bracken_ford, label: Bracken Ford, revealed: true }
    - { x: 0.71, y: 0.64, ref: site_k3f9x2, label: The Warren }
```

Pin `x`/`y` are **fractions of image width/height** (0..1) so pins survive
image rescaling. `ref` is optional (a pin may be a bare label) and may target
another `map` note — that is the world→city→dungeon nesting chain. Pin
`revealed` follows the reveal model.

### `session` — sessions/\<date\>-\<slug\>.md (GM)

Frontmatter extras, all optional:

```yaml
in_world: { year: 837, month: 6, day: 9 }   # when the session happened in-world
reveals:                                     # what the players learned this session
  - site_k3f9x2#digest                       # a section of a note
  - fac_goblinoid_raiders                    # a whole note
```

`reveals` is the session-keyed reveal **log** — history, where `oa_reveal` on
the target notes is current state. Ready-made recaps ("here's what you
learned") derive from it.

### `region` — regions/\<slug\>/region.md (HOA)

Frontmatter extras:

```yaml
region:
  grid:
    orientation: flat            # flat-top hexes — family convention (flat_top_hex)
    columns: 24
    rows: 18
    hex_scale_miles: 6           # miles across flats
    offset: even-q               # offset coordinate scheme; fixed value in 0.1.0
  terrain_summary: { forest: 102, hills: 58, marsh: 22, ... }
oa_refs:
  campaign: camp_...
  settlements: [set_..., ...]    # settlements located in this region
  sites: [site_..., ...]         # dungeon sites located in this region
```

Managed sections: `overview` (prose gazetteer), `travel` (movement cost table,
encounter guidance). The region's *map data* (per-hex terrain grid) lives in
the hex files plus an optional opaque app save under `regions/<slug>/state/`.

### `hex` — regions/\<slug\>/hexes/hex-CCRR.md (HOA)

One file per hex **that has content**. Empty wilderness hexes may be elided;
consumers derive "nothing here" from absence.

A hex is described along **four layers**, each owned differently:

| Layer | What | Who owns it |
| --- | --- | --- |
| **biome** | the substrate: `terrain` × `climate` → `biome` id | deterministic only; models never touch it; every other layer keys off it |
| **features** | what is physically there (`features`) | deterministic places; directors describe |
| **residents** | who is there (`oa_refs.monsters`, `oa_refs.factions`, later NPCs) | deterministic builds candidate lists; directors pick and stage |
| **obstacles** | what makes travel or entry hard (`obstacles`) | deterministic seeds from geometry; directors voice, never add or remove |

Frontmatter extras:

```yaml
hex:
  coord: "0407"                  # CCRR, zero-padded column then row
  terrain: marsh                 # closed vocabulary, see hexBlock in schema/vault.schema.json
  climate: cold                  # cold|temperate|hot (optional in 0.1)
  biome: cold_marsh              # derived <climate>_<terrain>; must agree
  features: [lair, ruin]         # closed vocabulary of overlay features
  obstacles: [bog, ford]         # closed vocabulary, see hexBlock.obstacles
oa_refs:
  region: reg_b8h2m4
  settlement: set_a77c1p         # if a settlement sits in this hex
  site: site_k3f9x2              # if a dungeon entrance sits in this hex
  factions: [fac_...]            # who operates here
  monsters:                      # residents by package key (see main spec)
    - id: doa_giant_toad
      package: enraged-eggplant-monsters@0.5.0
      bestiaryUrl: https://dungeonsonautomatic.com/monsters#doa_giant_toad
```

Managed sections: `description` (what travelers see, including voiced
obstacle notes), `encounters` (hex-scoped encounter guidance, monster refs by
package key).

### `settlement` — settlements/\<slug\>.md (TOA)

Frontmatter extras:

```yaml
settlement:
  size: village                  # thorp|hamlet|village|small_town|large_town|city
  population: 640
oa_refs:
  region: reg_b8h2m4
  hex: reg_b8h2m4#hex-0311
  factions: [fac_...]            # civic factions present
  npcs: [npc_...]                # notable residents
  sites: [site_...]              # nearby dungeons this town rumors about
```

Managed sections: `overview`, `locations` (keyed places of interest),
`rumors` (rumor table in DOA's `- **[true|false|partial]** text` + indented
`*GM:*` grammar — the same shape DOA's Adventure Frame emits, so dungeon
rumors can be merged in verbatim).

### `site` — sites/\<slug\>/ (DOA)

- `site.md` — overview note. Frontmatter extras carry the SiteDigest shape DOA
  already emits (`pitch`, `hooks`, `rumors`, `danger_band`, room/zone/encounter
  counts, `factions` with origins`)`; `oa_refs`: `region`, `hex`, `factions`,
  `npcs` (named opponents that were minted as vault NPCs). Managed sections:
  `digest`, `getting-there`.
- `key.md` — the full GM room key, exactly the existing `markdown-gm` export
  wrapped in one whole-file managed region. Kind `site` with its own `oa_id`
  and `oa_refs.parent` naming the owning `site.md` note (`parent` is the
  generic sub-document role: any secondary note of an entity points back with
  it). Room references inside the key stay in DOA's native grammar
  (`39 Boss or Master Chamber`, backticked `room_13`); the vault does not
  rewrite them.
- `state/` — opaque app artifacts: the saved DungeonState JSON (the artifact
  of record), generation profiles, exported GCS sheets. Apps other than DOA
  never open these; the vault ships them around byte-for-byte.

## Cross-app flows

### Stage 0 — manual (works today)

DOA already exports a GM markdown key and a state JSON. A GM makes a
`sites/<slug>/` folder, drops both in, adds frontmatter to `site.md`. The spec
is written so this is legal — hand-assembled vaults validate.

### Stage 1 — native vault write (HOA first)

Hexes on Automatic launches vault-native: "Export to Campaign Vault" writes
`region.md` + hex files + stub settlements/sites/factions with
`oa_status: stub`, and creates `campaign.md` if the vault does not have one.
When a `campaign.md` already exists, HOA reads its `oa_id` and links the
region back to the campaign (`oa_refs.campaign`); appending the region to the
existing `campaign.md`'s own `oa_refs` and refreshing `_index/` are the
maturing path, not yet part of the shipping export. Stubs are invitations: a
stub settlement is TOA's work order, a stub site is DOA's, a stub faction is
anyone's.

### Stage 2 — file commissions

A structured work order in `commissions/`:

```
commissions/<slug>.request.json    # written by requesting app or GM
```

```jsonc
{
  "commission_version": 1,
  "kind": "site",                       // site | settlement | region
  "vault_ref": "site_k3f9x2",           // the stub entity this fulfills
  "requested_by": "hexes-on-automatic@0.1.0",
  "request": { /* kind-specific payload, see below */ },
  "status": "open"                      // open | fulfilled | declined
}
```

- `kind: "site"` payloads use DOA's **SiteCommission** contract verbatim
  (`seed`, `footprint`, `geographyProse`, `factions[{name?, prose?}]`,
  `biomeCount`, `knobs`, `enabledSourceBooks`, `polish`, `exports`) — the
  vault adds only the envelope. Everything the commission doctrine bans
  (coordinates, exit bindings, caller ids echoed into the dungeon) stays
  banned; the `vault_ref` linkage lives in the envelope, which DOA writes back
  but never interprets.
- The fulfilling app writes the results into the entity's own folder, flips
  `status: fulfilled`, and fills the stub (`oa_status: stub` → `active`).
- A hex app commissioning a dungeon hashes its own world coordinates into the
  seed it requests — "a caller that wants a stable site hashes its own
  coordinates into the seed" — but per the no-determinism ruling, what it
  *keeps* is the returned state and markdown, not the recipe.

### Stage 3 — loopback commissions (live handshake)

DOA already runs an opt-in loopback HTTP commission server. The file
commission and the HTTP commission carry the same payload; Stage 3 just
delivers it live (requesting app POSTs, then writes the returned artifacts
into the vault itself). Contract details live with each app; the vault spec
only fixes the payload shapes and where results land.

## Monster and source references

- Monsters: always `monsterId` + `package@version` (+ `bestiaryUrl`), per the
  main spec. The 457-record library's ids (`enraged_eggplant_*`, `doa_*`) and
  the sourceBook key `enraged_eggplant_monsters_2024_05_11` are frozen
  consumer-stored keys.
- Book citations: raw codes (`DF3-8`, `DFA109`) — portable; each app re-resolves
  to local PDFs through its own page-reference mappings. Never write
  `file:///` links into the vault.
- Tags referencing DOA's generation vocabulary (`systems/dfrpg/tags.json`,
  107 ids) must use canonical ids; consumers silently drop unknown tags —
  same closed-vocabulary posture the apps use internally.

## Publishing (public supporting data)

This spec repo is the canonical public home of the vault format, following the
family's data-repo conventions:

- Canonical repo → site mirror. If/when vault artifacts are published to
  dungeonsonautomatic.com, the site mirrors released snapshots into
  `data/vault/` with an `index.json` pointer; raw repo URLs are never the
  public API.
- Releases tag `campaign-vault-vX.Y.Z` with a stable asset name.
- Licensing is a scope map: spec text + example vault CC BY 4.0, schemas +
  tooling MIT (see LICENSE.md).
- Apps stay private; their EULAs and release channels are unchanged. The vault
  format is public so that *user campaigns are never locked in* — a campaign
  vault must remain fully usable with no "on Automatic" app installed.
