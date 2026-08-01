---
title: Uzrek Nine-Teeth
aliases: [Uzrek]
tags: [npc, role/boss, faction/mirefall-warband]
oa_id: npc_uzrek_nine_teeth
oa_kind: npc
oa_spec: 0.1.0
oa_generator: dungeons-on-automatic@0.1.71
identity:
  personal_name: Uzrek
  epithet: Nine-Teeth
  quirk: files a notch in a tooth for every toll paid without a fight
  motive: make the vale pay rent before winter, then never fight again
narrative_role: boss
stats:
  status: summary
  source: dungeons-on-automatic
  cer: 58
  threat_tier: major
oa_refs:
  home: site_mirefall_warren
  location: site_mirefall_warren#room_5
  factions: [fac_mirefall_warband]
relationships:
  - to: fac_mirefall_warband
    kind: leader_of
  - to: npc_skarn_halfweight
    kind: rival
    strength: -2
    secret: true
    notes: Uzrek is sure Skarn shorts him on every bale and is quietly
      auditioning a replacement fence in Greenreach.
---

# Uzrek Nine-Teeth

Broad, wet-season goblinoid chieftain with a ledger-keeper's eyes and a
filed grin he uses like a receipt. Speaks the trade tongue better than he
lets on. He came up the Deep Stair owing something to the dark under the
falls, and every toll he takes is, in his own head, an installment.

Table voice: reasonable, unhurried, faintly injured that anyone would make
him do violence over what is, after all, only money.

<!-- oa:generated begin section="identity" -->
Boss of the Mirefall Warren toll operation. Uzrek Nine-Teeth taxes the mire
road, counts in boots, and dreams — unwillingly, nightly — of the plunge
pool. He will bargain with anyone, betray only creditors, and break before
he lets a fight reach the Deep Stair.
<!-- oa:generated end -->
