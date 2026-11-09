---
name: mats-count
description: Count Gether's Rise of Kingdoms equipment materials from screenshots of his item bag – how many legendary (gold) leather, stone and wood they make (4 of a tier = 1 of the next, bones left out) and how many gold the unmarked material chests make. Use when Gether runs /mats-count or sends screenshots of materials or material chests asking how many gold he has.
---

# /mats-count – materials into gold

Gether sends screenshots of his materials and material chests from the game (Gether 9. 11. 2026: „potrebujem vedieť
podľa takýchto fotiek počet materiálov … nabudúce ti už len pošlem screenshoty"). Answer in Slovak, nothing to commit.

## 1. Read every tile
A tile = an icon on a coloured square with the count in the bottom right corner ("1,660" = 1660).

**The colour of the square is the tier:**

| Square | Tier |
|---|---|
| grey | white (biele) |
| green | green (zelené) |
| blue | blue (modré) |
| purple | purple (fialové) |
| orange | gold – legendary (zlaté) |

**The icon is the type:**

| Icon | Type | Counted |
|---|---|---|
| a hide – flat or rolled up like scrolls, light brown | leather (koža) | yes |
| grey rocks | stone (iron ore, kameň) | yes |
| dark red planks or logs | wood (ebony, drevo) | yes |
| bones, claws, teeth | animal bone (kosti) | **no** – Gether does not count them |
| the plain bronze chest – the same chest in all five colours (300 grey, 405 green… on 9. 11. 2026) | neutral material chest of that tier: any type of that tier | yes, as neutral |

**Not materials – left out, named in the answer:** the red-gold chests with a piece of equipment on them (helmet,
armour, gloves… – equipment chests), the paper with a puzzle piece (blueprint pieces).

**Not sure what it is** (on 9. 11. 2026: the orange crystal, the grey iron-bound chest on green, the wooden chest on
blue) – do not guess: count without it, list it under „Neznáme“ and ask once. When Gether says what it is, add it to
the tables above.

If a number is unreadable or a tile is cut off at the edge of a screenshot, ask instead of guessing. Several screenshots
of the same bag can overlap (scrolled) – a tile with the same icon, colour and count on two of them is one tile.

## 2. Count – always with the script, never in your head
Five counts per type: white,green,blue,purple,gold (0 for a tier it has none of):
```bash
python -I .claude/skills/mats-count/count.py --leather W,G,B,P,O --stone W,G,B,P,O --wood W,G,B,P,O --neutral W,G,B,P,O
```
- **Zvlášť**: each type crafted up on its own (4 → 1, tier by tier), the rest left over, and the neutral chests on
  their own (a neutral chest of a tier becomes any type of that tier, so they also craft 4 → 1).
- **S neutrálnymi na doplnenie zvyškov**: printed only when the neutral chests can complete a type's leftover fours into
  more gold – the most gold altogether.

## 3. Answer
1. A short table of what was read: type × tier, so Gether can check the reading.
2. Gold per type (leather, stone, wood) and neutral gold, the total, and the bonus with neutral chests filling the
   leftovers if the script prints one.
3. What was left out (bones, equipment chests, blueprints) and anything under „Neznáme“ with a question.

Example (9. 11. 2026): leather 857,40,23,2,23 · stone 99,40,18,4,34 · wood 122,34,20,7,25 · neutral 300,405,153,67,27
→ koža 28, kameň 37, drevo 29, neutrálne 60 = 154 zlatých; neutrálnymi zvyškami +1 koža = 155.
