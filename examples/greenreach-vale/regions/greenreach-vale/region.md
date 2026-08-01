---
title: Greenreach Vale
aliases: [The Vale]
tags: [region, wilderness]
oa_id: reg_greenreach_vale
oa_kind: region
oa_spec: 0.1.0
oa_generator: hexes-on-automatic@0.1.0
oa_status: active
region:
  grid:
    orientation: flat
    columns: 10
    rows: 8
    hex_scale_miles: 6
    offset: even-q
  terrain_summary:
    forest: 28
    plains: 17
    hills: 15
    marsh: 11
    mountains: 6
    water: 3
oa_refs:
  campaign: camp_greenreach
  settlements: [set_bracken_ford, set_greenreach]
  sites: [site_mirefall_warren]
---

# Greenreach Vale

GM note: the vale is deliberately small — sixty miles across the flats. Keep
travel times honest and the mire will feel far enough.

<!-- oa:generated begin section="overview" -->
Greenreach Vale is a shallow bowl of barley plains and old oak forest, walled
by tin-bearing hills to the east and a single line of true mountains in the
north. The River Bracken drains the whole of it, slowing into eleven hexes of
peat marsh in the southeast before it finds the gap. Two settlements matter:
[[settlements/bracken-ford|Bracken Ford]], the village at the only good river
crossing, and [[settlements/greenreach|Greenreach]] itself, the market town on
the plains road. Since the spring floods, traffic between them has thinned —
the mire road is tolled by something with teeth, and the wayshrine line
through the hills has gone dark one lantern at a time.
<!-- oa:generated end -->

<!-- oa:generated begin section="travel" -->
| Terrain | Foot, per hex | Mounted, per hex | Notes |
| --- | --- | --- | --- |
| plains | half day | third of a day | road hexes count as plains |
| forest | one day | one day | no mounted advantage off the tracks |
| hills | one day | one day | mind the mine tailings |
| marsh | two days | not passable | causeway hexes as hills; see `DF16-6` |
| mountains | two days | not passable | one pass, snowed shut by late autumn |
| water | ferry only | ferry only | the Bracken is fordable at hex 0203 only |

Roll for an encounter once per hex entered and once per night camp; use the
hex file's encounter guidance where one exists, otherwise the terrain default.
Lost checks in the marsh are at a stiff penalty once the causeway is left.
<!-- oa:generated end -->
