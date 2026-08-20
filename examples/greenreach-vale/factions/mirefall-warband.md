---
title: The Mirefall Warband
aliases: [The Toll-Stakes]
tags: [faction, faction/goblinoid]
oa_id: fac_mirefall_warband
oa_kind: faction
oa_spec: 0.2.0
oa_generator: dungeons-on-automatic@0.1.71
oa_reveal:
  status: revealed
faction:
  scope: local
  origin: commissioned
  theme_tags: [goblinoid, raider]
  source_faction_id: goblinoid_raiders
  goals:
    - text: Stake the causeway approach with fresh boots
      done: true
    - text: Keep the toll flowing until first frost
    - text: Find out what the delvers really paid for at the parley
oa_refs:
  seat: site_mirefall_warren
  presence: [reg_greenreach_vale#hex-0407, reg_greenreach_vale#hex-0506]
relationships:
  - to: fac_lantern_vigil
    kind: enemy
    strength: -3
    notes: The Vigil's relit lanterns would put eyes on every causeway the
      warband tolls; Uzrek dowses shrines on principle.
  - to: fac_thornwake
    kind: rival
    strength: -1
    notes: Warband foraging parties that enter the spiral oaks come back
      short one member and will not say which.
---

# The Mirefall Warband

Goblinoid raiders who came *up* the Deep Stair in spring and turned the
vale's mire road into a toll operation. Under
[[npcs/uzrek-nine-teeth|Uzrek Nine-Teeth]] they fight like people with an
exit strategy: parley first, ambush second, and never, under any
circumstance, downstairs. Roughly thirty fighters, paid in shares.

Their tells: left boots on stakes, kettle-brass bells, tar-marked bales
awaiting pickup that a sharp eye will match to Bracken Ford barge-brands.
