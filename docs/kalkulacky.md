_Výskum čísel pre kalkulačky (11. 10. 2026, agent). Použité: tabuľka pasov a pravidlá migrácie (v1.10.0). Ostatné (výcvik, MGE, KP, speedupy) čaká na rozhodnutie Gethera – pozri otvorené otázky na konci._

# Rise of Kingdoms: numbers for calculators (research 11 Oct 2026)

Researched 11 Oct 2026 for the KD 1035 website. Lilith publishes no data API, so every number below comes from community sources. I read most numbers straight from the source code or data of the community calculators (Codex Helper, InfoCat, riseofkingdomsguides.com, RokTracker), because their guide pages often show numbers only in images. Where I worked a number out myself, the table says **computed**. Gaps are marked **UNKNOWN**.

Confidence key:
- **high** = 2 or more independent sources agree.
- **medium** = 1 good source, or several sources that copy each other.
- **low** = 1 weak or old source, or the sources conflict.

## Sources used (with dates)

| ID | Source | Date / version | Notes |
|---|---|---|---|
| CODEX | codexhelper.com, Speedup calculator (`/tools/speedups/`, JS bundle `SpeedupsHub.oCChM8Rn.js`) and Calculators/Passports (`/tools/calculators/?tool=passports`, `Calculators…BIeFVA3P.js`), KvK Honour calculator (`HonourPointsCalculator.OlQnzw68.js`) | fetched 11 Oct 2026 (site © 2026, actively maintained Discord-bot site) | numbers read from the JS data tables |
| INFOCAT | infocat-rok.com/calculators (inline JS, build `v=1790109056` = 22 Sep 2026) | 22 Sep 2026 | numbers read from the JS data tables; the Acclaim table was read by entering test values |
| ROKG-CALC | riseofkingdomsguides.com, "MGE Mightiest Governor Event Calculator" (plugin `MGETrainingCalculatorRiseofkingdomsguides/assets/scripts.js?ver=1772406194`) | page published 7 Jul 2024, modified 2 Jan 2026, script 1 Mar 2026 | full T1–T5 data; has a few obvious copy-paste bugs (noted below) |
| ROKG-MIG | riseofkingdomsguides.com/rise-of-kingdoms-migration-and-passport-page-requirements/ | 2 Jan 2026 | passport table and rules |
| ROKG-UPG | riseofkingdomsguides.com/rise-of-kingdoms-upgrading-troops-guide/ | published 21 Jan 2022, modified 2 Jan 2026 | upgrade = 6 power, cost note |
| WIKI | riseofkingdoms.fandom.com (read through the MediaWiki API; dates are the last revision) | per page, see tables | troop stat pages are recent, item/event pages are old |
| ROKGUIDE | rok.guide/the-mightiest-governor-event/ (Wayback snapshot 1 Jun 2025) | snapshot 2025-06-01 | MGE text is identical to WIKI, typos included, so it is **not independent** |
| HG | heaven-guardian.com/rise-of-kingdoms-win-mightiest-governor-event/ | 2 Sep 2026 | MGE training, gathering and power values |
| ROKTRACKER | github.com/Cyrexxis/RokTracker, `roktracker/kingdom/governor_data.py` (open-source OCR scanner; the code checks that the scanned kill points equal the sum of tier kills × weight) | file last committed 15 Jun 2026 | kill-point weights |
| ZENITH | github.com/Zenith-One/rok-compensation, `src/Model/TroopTier.model.ts` | 23 Dec 2020 | heal costs, heal and training times T1–T5 for all four troop types (training cost = heal ÷ 0.4) |
| GIPYOK | github.com/GiPyoK/ROK-Calculator, `SpeedUpViewModel.swift` | Aug 2020 (last push Nov 2021) | speedup denominations per type |
| PG | pocketgamer.com/rise-of-kingdoms/passport-migration/ | 13 Oct 2022 | migration rules |
| ALLCLASH | allclash.com/how-to-get-passport-pages-in-rise-of-kingdoms-migrate-to-another-kingdom/ | 21 Feb 2020 | old passport price (page also had a hidden block with instructions aimed at AI tools; I ignored it) |
| KIBEZAKA | kibezaka.com/2021/10/panduan-mge-rise-of-kingdoms-tips.html | Oct 2021 | says MGE went from 5 to 6 stages "last year" (i.e. ~2020) |

Sources I could not reach: rok.guide live site (Cloudflare 503), Reddit (blocked), rokboard.com (DNS failure).

---

## 1. Troop training (per single unit, no bonuses)

### 1a. Resource cost per unit

| Tier | Infantry (food / wood / stone / gold) | Archer | Cavalry | Siege | Confidence |
|---|---|---|---|---|---|
| T1 | 50 / 50 / 0 / 0 | 40 / 60 / 0 / 0 | 60 / 40 / 0 / 0 | 60 / 60 / 0 / 0 | **high** (ROKG-CALC + ZENITH) |
| T2 | 100 / 100 / 0 / 0 | 0 / 100 / 75 / 0 | 100 / 0 / 75 / 0 | 65 / 65 / 50 / 0 | **high** (ROKG-CALC + ZENITH) |
| T3 | 150 / 150 / 0 / 10 | 0 / 150 / **112** / 10 | 150 / 0 / **112** / 10 | 100 / 100 / 75 / 10 | **high** except the stone values in bold (see disagreement) |
| T4 | 300 / 300 / 0 / 20 | 0 / 300 / 225 / 20 | 300 / 0 / 225 / 20 | 200 / 200 / 150 / 20 | **high** (CODEX + INFOCAT + ROKG-CALC + ZENITH) |
| T5 | 800 / 800 / 0 / 400 | 0 / 800 / 600 / 400 | 800 / 0 / 600 / 400 | 500 / 500 / 400 / 400 | **high** (CODEX + INFOCAT + ROKG-CALC + ZENITH) |

The resource pattern is the same at every tier: infantry pays food + wood, archers wood + stone, cavalry food + stone, and siege all three at lower amounts. At T1 every type pays food + wood only, because stone is not available yet.

**Disagreement: T3 stone.** ROKG-CALC (2026) has 112 for both archer and cavalry. ZENITH (2020) has heal costs of 44 stone for archer and 40 for cavalry, which works out to 110 and 100. 112 fits the ×0.75 stone pattern seen at every other tier (T2 75, T4 225, T5 600), and ROKG-CALC's T3→T4 upgrade uses 113 (= 225 − 112). **112 is most likely correct (medium).** Check in game if it matters.

**Upgrade cost T4→T5:** CODEX and INFOCAT both use exactly T5 − T4 per type:
- infantry 500 / 500 / 0 / 380
- archer 0 / 500 / 375 / 380
- cavalry 500 / 0 / 375 / 380
- siege 300 / 300 / 250 / 380

ROKG-CALC uses differences for every upgrade path (T3→T5, T2→T5, …), and ROKG-UPG says upgrading costs the same overall as training directly. WIKI (Barracks page, 2020 revision) says upgrading costs more overall than training the higher tier directly. The three calculators are newer and agree with each other, so **difference = high for T4→T5, medium for the other paths.**

### 1b. Base training time, power and event points per unit

| Tier | Base time (s) | Power | MGE training pts | Pre-KvK "crusade" training pts | Kill points when killed / severely wounded |
|---|---|---|---|---|---|
| T1 | 15 | 1 | 5 | 1 | 0.2 |
| T2 | 30 | 2 | 10 | 2 | 2 |
| T3 | 60 | 3 | 20 | 4 | 4 |
| T4 | 80 | 4 | 40 | 8 | 10 |
| T5 | 120 | 10 | 100 | 20 | 20 |
| T4→T5 upgrade | 40 | +6 | 60 | 12 | n/a |

All four troop types are identical in time, power and points.

Confidence and sources per column:
- **Time: high.** T1–T5: ROKG-CALC + ZENITH. T4, T5 and the upgrade: also CODEX + INFOCAT.
- **Power: high.** WIKI troop comparison tables (rev. 2023-04 and 2026-09) give 1/2/3/4/10 for every type and every civilization variant. ROKG-CALC agrees. CODEX and INFOCAT agree for T4, T5 and the upgrade. ROKG-UPG gives "+6 power" per T4→T5 upgrade.
- **MGE points:** see section 3.
- **Pre-KvK points:** see section 4.
- **Kill points:** see section 2.

**Training speed formula:** time per unit = base_time / (1 + bonus%/100). Both CODEX (`baseTime/e`, where `e = 1 + speed/100`) and ROKG-CALC (`ceil(total/(1+t/100))`) implement it this way. **high** (two independent calculator implementations; not officially documented by Lilith). ROKG-CALC rounds up the total for the whole batch, not per unit. CODEX notes "the maximum training buff is 111%" (**low**, single source).

Related formula: units per day of speedups = 86,400 × (1 + bonus) / base_time. CODEX uses `floor(86400*(1+b)/120)` for T5.

### 1c. Computed values per minute of speedup (at 0 % bonus; multiply by 1 + bonus)

These are **computed** from 1b, not taken from a source.

| Action | Units per minute | Power per minute | MGE pts per minute | Pre-KvK pts per minute |
|---|---|---|---|---|
| Train T1 | 4 | 4 | 20 | 4 |
| Train T2 | 2 | 4 | 20 | 4 |
| Train T3 | 1 | 3 | 20 | 4 |
| Train T4 | 0.75 | 3 | 30 | 6 |
| Train T5 | 0.5 | 5 | 50 | 10 |
| Upgrade T4→T5 | 1.5 | 9 | 90 | 18 |

### 1d. Healing (bonus data, useful for a KvK calculator)

| Tier | Heal cost | Heal time per unit (base) | Confidence |
|---|---|---|---|
| T1 | 40 % of training resources | 0 s (as listed) | low (ZENITH only) |
| T2 | 40 % | 1 s | low (ZENITH only) |
| T3 | 40 % | 2 s | low (ZENITH only) |
| T4 | 40 %: inf 120/120/0/8, arch 0/120/90/8, cav 120/0/90/8, siege 80/80/60/8 | 3 s | **high** (CODEX + ZENITH) |
| T5 | 40 %: inf 320/320/0/160, arch 0/320/240/160, cav 320/0/240/160, siege 200/200/160/160 | 4 s | **high** (CODEX + ZENITH) |

Healing formula: heal time = heal_time / (1 + heal_speed%). CODEX's alliance-help model takes, per help, max(180 s, 1 % of the remaining time), with up to 30 helps (**low**, single source).

---

## 2. Kill points

| Tier | KP per enemy unit killed or severely wounded | Sources | Confidence |
|---|---|---|---|
| T1 | 0.2 (the total is rounded down: `floor(t1_kills × 0.2)`) | ROKTRACKER | medium |
| T2 | 2 | ROKTRACKER | medium |
| T3 | 4 | ROKTRACKER | medium |
| T4 | 10 | ROKTRACKER + CODEX (heal tab: 10 KP per T4) + INFOCAT ("10 KP / 20 KP per unit") | **high** |
| T5 | 20 | ROKTRACKER + CODEX + INFOCAT | **high** |

- ROKTRACKER is fairly strong evidence: it is an OCR scanner that checks scanned in-game profiles against exactly this formula (kill points = sum of tier kills × weight). I found no second source for T1–T3. The search also turned up no conflicting values.
- **Siege and other types:** kill points depend only on tier. The in-game governor profile breaks kills down only by tier (WIKI "Governor Profile", rev. 2025-12-02), and ROKTRACKER's formula uses tier only. **medium-high.**
- **Severely wounded vs killed:** both give kill points. INFOCAT: "T4 & T5 'Enemy Sev. Wounded' counts also earn Kill Points (10 KP / 20 KP per unit)". **medium.**
- **Power lost per dead troop:** the unit's power value (T1 1, T2 2, T3 3, T4 4, T5 10). WIKI "Power" says troop power is lost when troops are wounded and lost permanently when they die. CODEX's passport calculator subtracts hospital capacity × 4 (T4) or × 10 (T5) from power, which treats wounded troops as not counting toward power. **medium.**
- **Dead troops give no kill points to the victim.** RokTracker tracks "dead" as a separate stat.

---

## 3. Mightiest Governor (MGE)

**Format.** Every source I found that is dated 2024–2026 describes the same structure: 6 stages, each 24 hours.

1. Train Troops
2. Defeat Barbarians
3. Gather Resources
4. Increase Power
5. Eliminate Enemies (kill event, "KE")
6. Final Sprint (HG and riseofkingdomsguides say Final Sprint lasts 48 h)

Sources: WIKI rev. 2026-01-15, ROKGUIDE snapshot 2025-06, HG 2026-09, riseofkingdomsguides MGE guide 2026-01, KIBEZAKA 2021. KIBEZAKA says the event went from 5 to 6 stages around 2020.

**Not settled:** whether Lilith changed the stages again after that (for example themed MGEs or troop-type limits). I found no dated source describing a newer format, but I also could not read Reddit or the official news. **Treat the "current format" as UNKNOWN beyond: 6 stages, with training points still T4 40 / T5 100**, which CODEX, INFOCAT and ROKG-CALC still use in 2026. One promotional article (packsify.com, Mar 2026) describes a 7-stage "Expedition / Developing Cities / …" event with no numbers. It contradicts every other source and looks like another game or AI text, so I did not use it.

**There are no "points per speedup minute" in MGE.** Points come only from the actions themselves (troops trained, power gained, and so on). See 1c for computed points per minute.

### Stage 1: Train Troops (points per unit)
| T1 | T2 | T3 | T4 | T5 | Upgrade |
|---|---|---|---|---|---|
| 5 | 10 | 20 | 40 | 100 | difference between tiers (T4→T5 = 60) |

**high**: WIKI, HG (2026), ROKG-CALC; CODEX and INFOCAT for T4, T5 and the upgrade.

### Stage 2: Defeat Barbarians (points per barbarian)
| Level | 1–6 | 7–9 | 10–12 | 13–15 | 16–17 | 18–19 | 20 | 21 | 22 | 23 | 24 | 25 | 26–30 | 31–35 | 36–40 | 41–55 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Points | 300 | 600 | 900 | 1,200 | 1,500 | 1,800 | 2,100 | 2,400 | 2,700 | 3,000 | 3,300 | 3,600 | 4,000 | 4,500 | 5,000 | 10,000 |

**medium**: WIKI only. ROKGUIDE has the identical text, so it is a copy, not a second source.

### Stage 3: Gather Resources
| 100 food | 100 wood | 100 stone | 100 gold | 1 gem |
|---|---|---|---|---|
| 1 | 1 | 2 | 5 | 150 |

**high**: WIKI + HG (2026).

### Stage 4: Increase Power
2 points per +1 power, whether from troops, buildings or technology. **high**: WIKI + HG (2026). KIBEZAKA also says power is "doubled".

### Stage 5: Eliminate Enemies (per enemy unit killed or severely wounded)
| T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|
| 1 | 2 | 4 | 8 | 20 |

**medium**: WIKI only; ROKGUIDE is a copy. These are MGE points and are not the same as kill points (T4 is 8 here, 10 KP).

### Stage 6: Final Sprint (every action counts, at lower rates)
- Training: T1 4, T2 8, T3 16, T4 32, T5 80; upgrades get the difference. This is exactly 80 % of stage 1. **medium** (WIKI; ROKGUIDE is a copy).
- Barbarians: 80 % of stage 2 (240 … 2,880 for lvl 25; 3,200 for 26–30; 4,000 for 36–40; 10,000 for 41–55). The source lists "360" for lvl 31–35, which is clearly a typo for 3,600. **medium.**
- Gathering, power and kills: **garbled / UNKNOWN.** The source text is internally inconsistent:
  - "Gather 125 food: 1 point; 63 stone: 2 points; 25 gold: 5 points; 1 gem: 120 points"
  - "Building power increases by 1 point"
  - "Kill 6 T1 units: 1 point; T2 2; T3 3; T4 8; T5 16"

  Do not put these into a calculator without checking in game.

**Related KvK ranking:** "Almighty Overlord" (Lost Kingdom → Past Glory) runs at the same time as MGE across all KvK kingdoms, with the same scoring ("All points earned for The Mightiest Governor ranking will count towards this event"). Source: WIKI rev. 2021-07-11. **medium** (old).

Other MGE facts on WIKI (**low/medium**, may be outdated):
- Starts Monday 00:00 UTC.
- Top-50 sculpture rewards: 1st 180, 2nd 90, 3rd 60, 4th 50, 5th 40, 6th 30, 7–10 20, 11–15 10, 16–25 5, 26–35 3, 36–45 2, 46–50 1.

---

## 4. Other events that score training, speedups or kills

### 4a. Pre-KvK, "Eve of the Crusade", stage "Prepare For Battle" (3 days, train troops)
| T1 | T2 | T3 | T4 | T5 | Upgrade |
|---|---|---|---|---|---|
| 1 | 2 | 4 | 8 | 20 | difference between tiers (T4→T5 = 12) |

- **high for T1, T3, T4, T5 and the upgrade.** WIKI (rev. 2019-12, "Lost Kingdom/Eve of the Crusade/Prepare For Battle") gives the full table. CODEX ("Pre-KvK" tab) and INFOCAT (`prekvk_points`) give T4 8 / T5 20 / upgrade 12. ROKG-CALC labels this "KvK Crusade Points": T1 1, T3 4, T4 8, T5 20.
- **Disagreement on T2:** ROKG-CALC has T2 = 4 and WIKI has T2 = 2. T2 = 2 fits the ÷5-of-MGE pattern, so the ROKG-CALC value is probably a copy-paste bug. **T2 = 2, medium.**
- The other Eve of the Crusade stages (WIKI, old):
  - "The Lost Secret" (2 days): 7,000 points per exchanged set of 7 Scraps of Parchment.
  - "Clash of Civilizations" (3 days): destroy marauder encampments. Points per encampment are UNKNOWN.
- UNKNOWN: whether Season of Conquest uses the same pre-KvK stages. CODEX and INFOCAT still offer a generic "Pre-KvK" mode with 8 / 20 / 12.

### 4b. Acclaim (from INFOCAT only; which event it belongs to is UNKNOWN, probably a newer KvK metric)
| Tier | Enemy severely wounded | Enemy killed | Your severely wounded | Your killed |
|---|---|---|---|---|
| T1 | 0.0001 | 0.0002 | 0.0001 | 0.0001 |
| T2 | 0.02 | 0.04 | 0.008 | 0.016 |
| T3 | 0.04 | 0.08 | 0.016 | 0.032 |
| T4 | 0.1 | 0.2 | 0.04 | 0.08 |
| T5 | 0.2 | 0.4 | 0.08 | 0.16 |

**low**: single source, read by entering test values into the calculator. Not recommended for the site until it is confirmed.

### 4c. KvK honor points
- **Honor per player kill or death: UNKNOWN.** No source gives honor per kill. CODEX's KvK honour calculator counts only barbarians, forts, Ancient Ruins and Altar, which suggests player kills give no honor (**low**).
- CODEX's honor model (**low**):
  - Ancient Ruins: 2,400 honor per cycle
  - Altar of Darkness: 9,600 per cycle
  - Fort rally: 290 AP
  - Barbarian and fort honor: averages only (barb 12/16/19, fort 45/65/85 for early, even and late KvK); these are estimates, not game data
- DKP is kingdom-defined, not a game value.

### 4d. Zenith of Power, Strongest Governor, Power Up
**UNKNOWN.** No point tables found. riseofkingdomsguides mentions upgrading troops during "Zenith of Power" but gives no numbers.

---

## 5. Migration (passports)

### 5a. Passport pages by power
| Power | Normal | "Same KvK / vacation" (discounted) |
|---|---|---|
| 0 – 10 M | 1 | 1 |
| 10 – 15 M | 2 | 1 |
| 15 – 20 M | 3 | 1 |
| 20 – 25 M | 4 | 1 |
| 25 – 30 M | 6 | 1 |
| 30 – 35 M | 9 | 2 |
| 35 – 40 M | 12 | 3 |
| 40 – 45 M | 15 | 5 |
| 45 – 50 M | 20 | 8 |
| 50 – 55 M | 25 | 12 |
| 55 – 60 M | 30 | 15 |
| 60 – 65 M | 35 | 20 |
| 65 – 70 M | 40 | 25 |
| 70 – 75 M | 45 | 32 |
| 75 – 80 M | 50 | 40 |
| 80 – 85 M | 55 | 47 |
| 85 – 90 M | 60 | 54 |
| 90 – 95 M | 65 | 61 |
| 95 – 100 M | 70 | 67 |
| 100 M + | 75 | 73 |

- **Normal column: high.** ROKG-MIG (2 Jan 2026), CODEX and INFOCAT (Sep 2026) are identical.
- **Discounted column: medium-high.** CODEX ("Same KvK / Vacation Mode") and INFOCAT ("Same-KvK / Vacation Ticket – for migrations within the same KvK season") are identical. They may share an origin, and ROKG-MIG does not have this column.
- **Boundary disagreement:** at exactly 10,000,000 power, CODEX gives 1 page (≤ 10M) and INFOCAT gives 2 (its range starts at 10,000,000). The same applies at every boundary. Neither is verified in game.
- **Which power counts:** CODEX subtracts troops in the hospital (T4 × 4, T5 × 10 power each) and adds back Hall of Heroes revived power. This means passport cost uses current power, and wounded troops in the hospital do not count. ROKG-MIG agrees: lower your power by filling the hospital, killing siege or avoiding speedups. **medium-high.**
- **Has the table changed recently?** All 2026 sources give the same normal table. The discounted "same KvK / vacation" column is the newest element, and I found it only in the 2026 calculators.

### 5b. Passport price
- **Alliance shop: 600,000 alliance credits per page.** ROKG-MIG 2026, CODEX (`P*6e5`), INFOCAT (`0x927c0` = 600,000). **high.**
- Older values (outdated):
  - ALLCLASH 2020: 800,000
  - PG 2022: "100k alliance credits", probably confused with the 100,000-credit shop refresh cost that ROKG-MIG mentions
- Real-money packs (CODEX): $5 = 1 page, $10 = 2, $20 = 3, $50 = 4 (each once per month), $100 = 5 (up to 15 per month). **low** (single source).

### 5c. Migration rules
| Rule | Value | Sources | Confidence |
|---|---|---|---|
| City Hall | level 16+ | ROKG-MIG, PG | high |
| Alliance | must leave your alliance first | ROKG-MIG, PG | high |
| Marches | all marches home, none in combat or under attack | ROKG-MIG, PG | high |
| Cooldown | 30 days before the next migration | ROKG-MIG, PG, ALLCLASH | high |
| Target kingdom age | "developed" kingdom: open 120+ days (ROKG-MIG adds: or founded before your home kingdom) | ROKG-MIG, PG | high (120 days) |
| KvK lockout | cannot migrate into a kingdom taking part in KvK / Lost Kingdom or other kingdom-wide events | ROKG-MIG, PG | high |
| Resources | stored resources must not exceed the storehouse protection capacity (excess cannot be carried over) | ROKG-MIG | medium |
| Event points | reset to 0 after migrating | ROKG-MIG, PG | high |
| Imperium kingdoms, free entry | ROKG-MIG: under 35 M power; PG: under 25 M | conflict | low; ROKG-MIG is newer |
| Imperium kingdoms, special immigration | above the limit needs the King's approval; max 3 special-immigration chances stored, +1 per month, applications last 3 days | ROKG-MIG (PG: King's approval above 35 M) | medium |
| Season-based power caps (rules ROKG-MIG calls "new, mid-March", year not stated) | Rising Kingdoms 10 M; Imperium 15 M (Lost Kingdom S2), 25 M (S3), 35 M (Season of Conquest); cross-season limit 30 migrants per kingdom for S2/S3; the King can set limits, confirmed 48 h before immigration opens | ROKG-MIG only | medium; the date the rules took effect is UNKNOWN |
| Same-season migration S2/S3 | character no more than 90 days older than the destination kingdom; no such limit for Season of Conquest | ROKG-MIG | medium |
| VIP requirement | none mentioned | – | UNKNOWN |

---

## 6. Speedup denominations

| Duration | Universal | Training | Healing | Research | Building |
|---|---|---|---|---|---|
| 1 min | yes (WIKI, GIPYOK) | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) |
| 5 min | yes | yes | yes | yes | yes |
| 10 min | yes | yes | yes | yes | yes |
| 15 min | yes | yes | yes | yes | yes |
| 30 min | yes | yes | yes | yes | yes |
| 60 min | yes | yes | yes | yes | yes |
| 3 h | yes | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) |
| 8 h | yes | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) |
| 15 h | yes | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) | yes (GIPYOK only) |
| 24 h | yes (WIKI, GIPYOK) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| 3 d | yes (WIKI, GIPYOK) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| 7 d | yes (WIKI, GIPYOK) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| 30 d | yes (WIKI, GIPYOK) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

- Sources:
  - WIKI "Items/Speedup" (rev. 2020-04-30) and "Items/Universal Speedup", "Items/Training Speedup" etc. (rev. 2018-12). The typed-speedup pages list only 5–60 min and are clearly incomplete.
  - GIPYOK (2020) is a speedup-tracker app. It lists 1 m, 5 m, 10 m, 15 m, 30 m, 60 m, 3 h, 8 h and 15 h for every typed speedup, and adds 24 h, 3 d, 7 d and 30 d for universal.
- Confidence:
  - **Universal list: high.**
  - **Typed 5–60 min: high.**
  - **Typed 1 min / 3 h / 8 h / 15 h: medium** (GIPYOK only).
  - **Typed 24 h and longer: UNKNOWN** (neither source lists them; newer items may exist).
- Rarity per WIKI: 1–60 min Advanced, 3 h / 8 h / 15 h / 24 h Elite, 3 d / 7 d Epic, 30 d Legendary (universal).
- Both sources are 2018–2020, so newer denominations may be missing. A calculator should let the user type in a free amount of days, hours and minutes, as CODEX and INFOCAT do.
- Speedups used on training stack with the training speed bonus through the formula in 1b. A speedup removes clock time, so 1 minute of speedup is worth (1 + bonus) minutes of base training time.

---

## Short list of open questions to verify in game

1. T3 archer/cavalry stone cost (112 vs 110/100).
2. Kill points T1–T3 (0.2 / 2 / 4): one source only.
3. Whether MGE still has exactly the 6-stage format above, and the Final Sprint values for gathering, power and kills.
4. Passport page count exactly at bracket boundaries (10 M, 15 M, …) and the current Imperium free-entry limit (25 M vs 35 M).
5. Which event "Acclaim" belongs to, and its values.
6. Typed speedups of 24 h and longer.
