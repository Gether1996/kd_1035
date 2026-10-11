# Commanderi – vzácnosť, zlaté kľúče a chýbajúca meta (výskum 11. 10. 2026)

_Výskum agenta pre Gethera (11. 10. 2026). Použité: zoznam skrytých commanderov v `frontend/src/app/pages/guides/hidden-commanders.ts` („Čo môžem postaviť“ a výber pri marchoch – bez epických, elitných, zo zlatých kľúčov, zberačov a KvK1/KvK2). Chýbajúcich meta commanderov do návodov pridáva mesačná aktualizácia (`kd-meta-update`) iba so zdrojmi._

## Zhrnutie
- **Epickí (fialoví) z našich 50:** Baibars, Belisarius, Bjorn Ironside, Boudica, Imhotep, Joan of Arc, Lohar, Matilda of Flanders, Pelagius, Sun Tzu. **Elitná:** Constance. Ostatní sú legendárni (Hermann Prime, Scipio Africanus Prime, Sun Tzu Prime tiež).
- **Zlaté kľúče z našich 50 (legendárni):** isto Cao Cao, Charles Martel, El Cid, Seondeok; pravdepodobne Casimir III, Pepin III, Yahya ibn Khalid (podľa dát z hry, starší návod z 1/2026 ich ešte nemal).
- **Chýbajúca meta (od KvK3 / SoC):** Vercingetorix (leadership, 6/2026), Alexander Nevsky, Huo Qubing, Justinian I (jazda), Ragnar Lodbrok Prime (pechota), Choe Yeong (lukostrelci, garrison), Shapur I, Siyaj K'ak', Ashurbanipal (lukostrelci, rally), Matthias I (leadership, garrison).
- **Najnovší legendárni, ktorých nemáme:** Vercingetorix, Elizabeth I (2026), Siyaj K'ak', Shapur I, Afonso de Albuquerque, Matthias I (2025).

---

# Rise of Kingdoms commanders – research for KD 1035 (as of 11 Oct 2026)

## Sources (accessed 11 Oct 2026)
- **[RS] app.rokstats.online/commanders**: data "read from the game client tables", page `generatedAt` 2026-09-26. 135 commanders (109 Legendary, 22 Epic, 4 Elite). The list page embeds JSON (rarity, troop type, tags, `releasedAt`, Prime links). Each dossier (`/commanders/<slug>`) has a client "Where to obtain" list (`sources.items`). Raw extracts are in `rokstats_commanders.json` and `sources.json` in this scratchpad. **This is the primary source for rarity and golden key.**
- **[WIKI] riseofkingdoms.fandom.com, Buildings/Tavern/Gold_Chests** (api.php wikitext, last edit 2022-09-14): legendaries in gold chests are those *not* from Wheel of Fortune, KvK rewards, or exclusive to Mightiest Governor, Expedition or VIP. The epic pool excludes Lohar and Keira.
- **[OCG] onechilledgamer.com/rise-of-kingdoms-commander-guide/** (updated 29 Apr 2024): golden-key legendaries Julius Caesar, Charles Martel, El Cid, Cao Cao, Frederick, Cleopatra VII, Mehmed II, Mulan, Ragnar Lodbrok, Seondeok, Ishida Mitsunari.
- **[NAMU] en.namu.wiki, RoK legendary commanders** (search snippet only, the page returned 403): "Tavern (Golden Key)" list adds Thutmose III and Pyrrhus. It also lists Minamoto, Hannibal, Charlemagne and Wu Zetian, which conflicts with the client data.
- **[RG] riseofkingdomsguides.com Casimir / Pepin guides** (dated 2 Jan 2026): "Hopefully, he will be added to the gold chests", meaning they were not in the chests in Jan 2026.
- **[AC-T] allclash.com/best-commanders-tier-list-in-rise-of-kingdoms-with-talents/** ("2026 – with William Marshal & Ivan IV", after 1.1.11).
- **[AC-P] allclash.com/best-commander-pairings-defense-rally-open-field-canyon-barbarians/** (4 Aug 2026).
- **[HG] heaven-guardian.com/rise-of-kingdoms-best-commander-tier-list-guide/** (8 Oct 2026, "2026 Season of Conquest Tier Snapshot").
- **[LD] ldshop.gg/blog/rise-of-kingdoms/rise-of-kingdoms-commander-tier-list.html** (10 Apr 2026).
- **[X] Official Rise of Kingdoms posts on x.com**: status 1963920042350821534 (5 Sep 2025, Casimir III announced as a new Gathering commander) and 1982387290157748469 (26 Oct 2025, next-gen cavalry late Nov 2025 and next-gen infantry Jan 2026). Dates were decoded from the post IDs.
- **topuplive.com/news/rise-of-kingdoms-8th-anniversary.html**: version 1.1.11 on 27 Aug 2026 with William Marshal and Ivan IV.
- Not usable: rok.guide ("Site Currently Unavailable"), fandom wiki pages behind HTTP 402 (the API worked), and the riseofkingdomsguides tier table (title says Oct 2026, but the table stops before the 2025 commanders, so it is stale).

**How to read "Golden key":** "Yes" means the game client lists **Tavern** as an origin for that commander (golden chests, opened with golden keys). Epic commanders with "Tavern" come from golden chests (about 2.35 % per chest for an epic commander, per [WIKI]). "No" means the client lists only other origins (Wheel of Fortune, Mightiest Governor, Legendary Chests = the Sovereign-key Legendary Tavern in Season of Conquest, VIP, Expedition, events).

## 1+2. Our 50 commanders – rarity and golden key

Prime naming: for **Boudica, Joan of Arc, Belisarius and Pelagius** the site uses the plain name, and our guides use them as **epic** commanders (F2P and barbarian pairs; commanders.py says "Epická Joan of Arc"). Both variants are listed. **Hermann Prime, Scipio Africanus Prime and Sun Tzu Prime** are separate Legendary commanders; their base versions are Epic and come from the Tavern. **Ivar** is called "Ivar" in the client. **Richard = Richard I. Minamoto = Minamoto no Yoshitsune.**

| Our name | Rarity | Golden key | Troop type / tags (client) | Released (client) | Obtain sources (game client via rokstats) | Notes |
|---|---|---|---|---|---|---|
| Achilles | Legendary | No | Cavalry / Versatility, Combo | 2025-10-27 | Universal Sculpture; Event |  |
| Aethelflaed | Legendary | No | Leadership / Peacekeeping, Support | – | Expedition | Expedition (Medal Store) only; never in gold chest per client. |
| Alexander the Great | Legendary | No | Infantry / Versatility, Attack | – | Universal Sculpture; Wheel of Fortune; Legendary Chests |  |
| Alp Arslan | Legendary | No | Archer / Versatility, Skill | 2026-05-11 | Universal Sculpture; Wheel of Fortune |  |
| Arthur Pendragon | Legendary | No | Cavalry / Versatility, Combo | 2025-01-07 | Universal Sculpture; Wheel of Fortune |  |
| Attila | Legendary | No | Cavalry / Conquering, Attack | – | Universal Sculpture; The Mightiest Governor; Legendary Chests |  |
| Bai Qi | Legendary | No | Infantry / Versatility, Smite | 2025-04-28 | Universal Sculpture; Wheel of Fortune |  |
| Baibars | Epic | Yes | Cavalry / Conquering, Skill | – | Tavern; Expedition; Universal Sculpture |  |
| Belisarius | Epic | Yes | Cavalry / Peacekeeping, Mobility | – | Tavern; Expedition; Universal Sculpture |  |
| Belisarius Prime | Legendary | No | Cavalry / Versatility, Mobility | 2024-05-13 | Universal Sculpture; Wheel of Fortune | Prime variant (Legendary). Our guides use the EPIC base in F2P/barbarian pairs. |
| Bjorn Ironside | Epic | Yes | Infantry / Conquering, Skill | – | Tavern; Expedition; Universal Sculpture; Event |  |
| Boudica | Epic | Yes | Integration / Peacekeeping, Skill | – | Tavern; Expedition; Universal Sculpture |  |
| Boudica Prime | Legendary | No | Archer / Versatility, Skill | 2022-06-13 | Universal Sculpture; Wheel of Fortune | Prime variant (Legendary). Our guides use the EPIC base in F2P/barbarian pairs. |
| Cao Cao | Legendary | Yes | Cavalry / Peacekeeping, Mobility | – | Daily Special Offer; Tavern; Expedition; Universal Sculpture |  |
| Casimir III | Legendary | Yes | Integration / Gathering, Defense | – | Tavern; Universal Sculpture; Event | Client: Tavern. riseofkingdomsguides (2 Jan 2026) still "hopefully will be added to gold chests" -> added during 2026 (medium confidence). Announced on official X 5 Sep 2025. |
| Charles Martel | Legendary | Yes | Infantry / Garrison, Defense | – | Tavern; Expedition; Universal Sculpture; The Mightiest Governor |  |
| Constance | Elite | No | Integration / Gathering, Skill | – | Expedition; Universal Sculpture | Client lists Expedition only -> golden key UNKNOWN (OneChilledGamer 2024 says all Elite are in Silver/Gold chests). Treat as UNKNOWN. |
| David IV | Legendary | No | Cavalry / Garrison, Combo | 2025-11-14 | Universal Sculpture; The Mightiest Governor |  |
| Edward of Woodstock | Legendary | No | Archer / Versatility, Skill | – | Universal Sculpture; Wheel of Fortune; Legendary Chests |  |
| El Cid | Legendary | Yes | Archer / Versatility, Skill | – | Tavern; Expedition; Universal Sculpture; The Mightiest Governor |  |
| Gang Gamchan | Legendary | No | Cavalry / Versatility, Combo | 2025-11-14 | Universal Sculpture; Wheel of Fortune |  |
| Gilgamesh | Legendary | No | Archer / Conquering, Skill | 2021-08-23 | Universal Sculpture; Wheel of Fortune |  |
| Gorgo | Legendary | No | Infantry / Garrison, Defense | 2023-10-16 | Universal Sculpture; The Mightiest Governor |  |
| Hayam Wuruk | Legendary | No | Archer / Garrison, Skill | 2026-05-11 | Universal Sculpture; The Mightiest Governor |  |
| Hector | Legendary | No | Leadership / Versatility, Support | 2025-10-27 | Universal Sculpture; Event |  |
| Hermann Prime | Legendary | No | Archer / Versatility, Support | 2023-12-24 | Universal Sculpture; Wheel of Fortune | Base Hermann = Epic (Tavern, yes); Prime = Legendary, WoF only. |
| Imhotep | Epic | Yes | Archer / Garrison, Support | – | Tavern; Expedition; Universal Sculpture; Event |  |
| Ivan IV | Legendary | No | Cavalry / Versatility, Combo | 2026-08-31 | Universal Sculpture; Wheel of Fortune | Version 1.1.11 (8th anniversary, 27 Aug 2026). |
| Ivar the Boneless | Legendary | No | Infantry / Conquering, Defense | 2026-02-02 | Universal Sculpture; The Mightiest Governor |  |
| Joan of Arc | Epic | Yes | Integration / Gathering, Support | – | Tavern; Expedition; Universal Sculpture |  |
| Joan of Arc Prime | Legendary | No | Cavalry / Versatility, Support | 2022-09-19 | Universal Sculpture; Wheel of Fortune | Prime variant (Legendary). Our guides use the EPIC base in F2P/barbarian pairs. |
| Liu Che | Legendary | No | Infantry / Versatility, Attack | 2023-10-16 | Universal Sculpture; Wheel of Fortune |  |
| Lohar | Epic | No | Integration / Peacekeeping, Support | – | Special Event: Lohar's Trial; Universal Sculpture | Lohar's Trial event only; wiki: epic gold-chest pool excludes Lohar & Keira. |
| Matilda of Flanders | Epic | Yes | Integration / Gathering, Defense | – | Tavern; Expedition; Universal Sculpture |  |
| Minamoto | Legendary | No | Cavalry / Peacekeeping, Skill | – | VIP 0 - VIP 9; First Recharge Gift Package | VIP shop (VIP 0–9) + First Recharge; VIP-exclusive -> excluded from gold chest (wiki rule). |
| Nebuchadnezzar II | Legendary | No | Archer / Conquering, Skill | 2020-11-30 | Universal Sculpture; The Mightiest Governor; Legendary Chests |  |
| Pelagius | Epic | Yes | Cavalry / Garrison, Skill | – | Tavern; Expedition; Universal Sculpture |  |
| Pelagius (Legendary) | Legendary | Yes | Cavalry / Garrison, Support | 2026-06-07 | Tavern; Universal Sculpture; Event | "Legendary upgrade" of epic Pelagius (AllClash: not a Prime, evolves the epic one). Golden key = medium confidence (client only). |
| Pepin III | Legendary | Yes | Integration / Gathering, Support | – | Tavern; Universal Sculpture; Event | Same as Casimir III (client: Tavern; Jan 2026 guide: not yet in chests). |
| Philip II | Legendary | No | Leadership / Versatility, Support | 2024-12-09 | Universal Sculpture; Wheel of Fortune |  |
| Qin Shi Huang | Legendary | No | Archer / Versatility, Skill | 2025-06-23 | Universal Sculpture; Wheel of Fortune |  |
| Richard | Legendary | No | Infantry / Garrison, Defense | – | Universal Sculpture; Wheel of Fortune |  |
| Saladin | Legendary | No | Cavalry / Conquering, Support | – | Universal Sculpture; Wheel of Fortune; Legendary Chests |  |
| Scipio Africanus Prime | Legendary | No | Infantry / Versatility, Support | 2022-04-18 | Universal Sculpture; Wheel of Fortune | Base Scipio = Epic (Tavern, yes); Prime = Legendary, WoF only. |
| Seondeok | Legendary | Yes | Integration / Gathering, Attack | – | Tavern; Universal Sculpture |  |
| Shajar al-Durr | Legendary | No | Archer / Versatility, Skill | 2024-09-30 | Universal Sculpture; Wheel of Fortune |  |
| Subutai | Legendary | No | Cavalry / Conquering, Combo | 2025-03-03 | Universal Sculpture; The Mightiest Governor |  |
| Sun Tzu | Epic | Yes | Infantry / Garrison, Skill | – | Tavern; Expedition; Universal Sculpture | BASE = Epic (Tavern). Sun Tzu Prime is a separate Legendary (see row below). |
| Sun Tzu Prime | Legendary | No | Infantry / Versatility, Smite | 2026-02-02 | Universal Sculpture; Wheel of Fortune |  |
| Tokugawa Ieyasu | Legendary | No | Infantry / Garrison, Smite | 2025-04-28 | Universal Sculpture; The Mightiest Governor |  |
| William Marshal | Legendary | No | Cavalry / Conquering, Combo | 2026-08-31 | Universal Sculpture; The Mightiest Governor | Version 1.1.11 (8th anniversary, 27 Aug 2026). |
| Yahya ibn Khalid | Legendary | Yes | Integration / Gathering, Mobility | 2026-07-20 | Tavern; Universal Sculpture; Event | Client: Tavern + event. Version 1.1.10 "Starry Rendezvous" (AllClash). |
| Yi Seong-Gye | Legendary | No | Archer / Garrison, Skill | – | Universal Sculpture; Wheel of Fortune |  |
| Zhuge Liang | Legendary | No | Archer / Versatility, Skill | 2023-05-15 | Universal Sculpture; Wheel of Fortune |  |

**Rarity confidence:** high for all rows (game client data). Rarities also match [AC-T] and [LD] where they list the commander.

### Epic among our 50 (base versions)
Baibars, Belisarius, Bjorn Ironside, Boudica, Imhotep, Joan of Arc, Lohar, Matilda of Flanders, Pelagius, Sun Tzu. That is 10, and Boudica/Joan/Belisarius/Pelagius each also have a Legendary Prime or Legendary version. **Elite:** Constance. All others are Legendary (Hermann Prime, Scipio Prime and Sun Tzu Prime are Legendary; their base versions are Epic).

### Golden key among our 50
- **Legendary, yes:** Cao Cao, Charles Martel, El Cid, Seondeok (high confidence: client + [OCG]). Casimir III, Pepin III, Yahya ibn Khalid, Pelagius (Legendary) (medium: client only; [RG] in Jan 2026 still said Casimir and Pepin were not in chests, so they were apparently added in 2026).
- **Epic, yes:** Baibars, Belisarius, Bjorn Ironside, Boudica, Imhotep, Joan of Arc, Matilda of Flanders, Pelagius, Sun Tzu (high: client + [WIKI] rule that every epic except Lohar and Keira is in gold chests). The base Epic Hermann and Scipio Africanus are also in the Tavern.
- **No:** Lohar (event only), Minamoto (VIP shop + first recharge), Aethelflaed (Expedition only), and every Prime and every 2023–2026 legendary on our list (Wheel of Fortune or Mightiest Governor).
- **UNKNOWN:** Constance. The client lists Expedition only; [OCG] says every Elite is in the silver and gold chests.

### Full current legendary golden-key pool (client "Tavern" origin, rokstats 26 Sep 2026) – 17 commanders
| Commander | Troop type | In our 50? | Second source |
|---|---|---|---|
| Cao Cao | Cavalry | yes | OCG |
| Charles Martel | Infantry | yes | OCG |
| El Cid | Archer | yes | OCG |
| Julius Caesar | Leadership | no | OCG |
| Frederick I | Leadership | no | OCG |
| Mehmed II | Leadership | no | OCG |
| Cleopatra VII | Integration (gathering) | no | OCG |
| Seondeok | Integration (gathering) | yes | OCG |
| Mulan | Integration (peacekeeping) | no | OCG |
| Ishida Mitsunari | Integration (gathering) | no | OCG |
| Ragnar Lodbrok (base, not Prime) | Leadership | no | OCG |
| Thutmose III | Archer | no | NAMU |
| Pyrrhus | Infantry | no | NAMU |
| Casimir III | Integration (gathering) | yes | search snippet of an undated patch note: "Golden Chests … updated to include Pepin III, Casimir III" (not verified) |
| Pepin III | Integration (gathering) | yes | same as Casimir III |
| Yahya ibn Khalid | Integration (gathering) | yes | client only |
| Pelagius (Legendary, 2026) | Cavalry / garrison | yes* | client only |

These are **not** golden-key commanders, though some old lists say they are: Minamoto (VIP), Hannibal Barca (VIP 10–14), Charlemagne (Lost Kingdom + Wheel of Fortune), Æthelflæd (Expedition), Constantine I (Mightiest Governor).
Wu Zetian, Eleanor of Aquitaine, Lapulapu, Gajah Mada and Gonzalo de Córdoba appear in fan tier lists but **not** in the rokstats client list. Their availability on the global server is UNKNOWN.

Note: the golden chest pool can change with each update. The definitive check is the in-game Tavern "Probability" screen.

## 3. 2026 meta (Season of Conquest / KvK 3+) and what is MISSING from our 50

Meta according to [AC-T] (tiers), [AC-P] (Aug 2026 open-field marches), [HG] (8 Oct 2026) and [LD] (Apr 2026):

| Role | Infantry | Cavalry | Archer | Leadership / other |
|---|---|---|---|---|
| Open field | Sun Tzu Prime (S+), Bai Qi (S), Liu Che (S), Scipio Prime, Ragnar Prime (A) | Ivan IV (S+), Achilles (S), Gang Gamchan (S), Arthur (A+), Huo Qubing (A), Alexander Nevsky (A) | Alp Arslan (S+), Qin Shi Huang (S+), Zhuge Liang (A+), Hermann Prime (A), YSG (A) | Philip II (A+), Vercingetorix (A), Hector |
| Rally | Ivar (Rally S+), Tariq ibn Ziyad (Rally S+), Sargon (Rally S), Scipio Aemilianus | William Marshal (Rally S+), Subutai (Rally S+), Justinian I (Rally S+), Xiang Yu | Shapur I (Rally S+), Siyaj K'ak' (Rally S), Nebuchadnezzar II (Rally S), Ashurbanipal | Elizabeth I (engineering, Rally A+) |
| Garrison | Tokugawa Ieyasu (Def S+), Gorgo, Ivar (Def S) | David IV, Pelagius (Legendary) | Hayam Wuruk (Def S+), Choe Yeong (Def S+), Dido (Def S+) | Matthias I (Def S+), Heraclius |

AC-P open-field marches (Aug 2026): Qin Shi Huang+Zhuge Liang, Sun Tzu Prime+Liu Che, Arthur+Achilles (3 marches); adding Qin+YSG, Sun Tzu Prime+Bai Qi, Hermann Prime+Alp Arslan, Liu Che+Philip II (5 marches); adding Achilles+Gang Gamchan, Philip II+Bai Qi, Arthur+Hector, Scipio Prime+Ragnar Prime (7 marches).
HG (Oct 2026) agrees: Sun Tzu Prime, Bai Qi, Liu Che / Arthur, Achilles, Gang Gamchan / Qin, Alp Arslan, Zhuge, Hermann Prime. Specialists: Vercingetorix, Ivar (rally), Hayam Wuruk (garrison), David IV (garrison).

### MISSING meta commanders (not among our 50)
Troop type, tags and release date come from the client ([RS]). Ratings are from [AC-T] unless noted.

| Commander | Troop / role | Released (client) | Evidence | Confidence it is meta |
|---|---|---|---|---|
| **Vercingetorix** | Leadership / Versatility, Support (open field) | 2026-06-22 | AC-T A; HG "specialist" (Oct 2026). Our own commanders.py advises not to invest | medium–high |
| **Alexander Nevsky** | Cavalry / Versatility, Skill (open field + rally) | 2022-01-24 | AC-T A; LD S+ | medium (older, falling) |
| **Huo Qubing** | Cavalry / Versatility, Skill (open field, rally S) | 2023-07-24 | AC-T A; LD S | medium |
| **Ragnar Lodbrok Prime** | Infantry / Versatility, Skill (open field) | 2024-10-20 | AC-T A; AC-P 7-march (with Scipio Prime); LD S | medium |
| **Justinian I** | Cavalry / Conquering, Support (**rally** S+) | 2023-07-24 | AC-T B+ (Rally S+); LD S (cavalry rally) | medium |
| **Shapur I** | Archer / Conquering, Skill (**rally** S+) | 2025-07-07 | AC-T B+ (Rally S+), "breaks the conquering rally meta" | medium (niche) |
| **Siyaj K'ak'** | Archer / Conquering, Skill (rally S) | 2025-01-07 | AC-T B+ (Rally S), Maya civilisation | low–medium |
| **Choe Yeong** | Archer / Garrison, Defense (**garrison** S+) | 2024-09-30 | AC-T B+ (Def S+); LD A (archer garrison) | medium |
| **Matthias I** | Leadership / Garrison, Attack (**garrison** S+) | 2025-09-15 | AC-T B (Def S+) | low–medium |
| **Dido** | Archer / Garrison, Support (garrison S+) | 2023-05-15 | AC-T C+ (Def S+) | low |
| Tariq ibn Ziyad | Infantry / Conquering, Defense (rally S+) | 2022-12-12 | AC-T C+ (Rally S+); LD A | low |
| Ashurbanipal | Archer / Conquering, Skill (rally) | 2023-12-24 | AC-T B+; LD S (archer rally) | low–medium |
| William Wallace | Infantry / Versatility, Smite | 2024-07-22 | AC-T B+; LD S. Our commanders.py says "do not invest anymore" | low |
| Elizabeth I | Engineering / Versatility, Skill (siege rally A+) | 2026-06-22 | AC-T B+ (niche siege) | low (niche) |
| Joan of Arc Prime / Boudica Prime / Belisarius Prime | Cavalry / Archer / Cavalry | 2022–2024 | AC-T B / B+ / B+; LD S | low (past meta) |

Already on our list and meta (no action needed): Sun Tzu Prime, Bai Qi, Liu Che, Scipio Prime, Ivar, Tokugawa, Gorgo, Ivan IV, William Marshal, Achilles, Gang Gamchan, Arthur, Subutai, David IV, Alp Arslan, Qin Shi Huang, Zhuge Liang, Hermann Prime, YSG, Hayam Wuruk, Nebuchadnezzar II, Philip II, Hector, Pelagius (Legendary).

## 4. Legendary commanders released 2025–2026 (client `releasedAt`; cross-checked with official X posts and update news where possible)

| Released | Commander | Troop / role | In our 50? |
|---|---|---|---|
| 2025-01-07 | Arthur Pendragon | Cavalry, combo | yes |
| 2025-01-07 | Siyaj K'ak' | Archer, conquering (rally) | **no** |
| 2025-01-07 | (Epic) Wak Chanil Ajaw | Integration / gathering | no (epic) |
| 2025-03-03 | Subutai | Cavalry, conquering combo (rally) | yes |
| 2025-04-28 | Bai Qi | Infantry, smite | yes |
| 2025-04-28 | Tokugawa Ieyasu | Infantry, garrison smite | yes |
| 2025-06-23 | Qin Shi Huang | Archer, skill | yes |
| 2025-07-07 | Shapur I | Archer, conquering (rally) | **no** |
| 2025-09-15 | Afonso de Albuquerque | Engineering | **no** |
| 2025-09-15 | Matthias I | Leadership, garrison | **no** |
| ~Sep 2025 (client date empty; Casimir announced on X 5 Sep 2025) | Casimir III, Pepin III | Integration / gathering | yes |
| 2025-10-27 | Achilles | Cavalry, combo | yes |
| 2025-10-27 | Hector | Leadership, support | yes |
| 2025-11-14 | David IV | Cavalry, garrison combo | yes |
| 2025-11-14 | Gang Gamchan | Cavalry, combo | yes |
| 2026-02-02 | Ivar (the Boneless) | Infantry, conquering defense | yes |
| 2026-02-02 | Sun Tzu Prime | Infantry, smite | yes |
| 2026-05-11 | Alp Arslan | Archer, skill | yes |
| 2026-05-11 | Hayam Wuruk | Archer, garrison | yes |
| 2026-06-07 | Pelagius (Legendary) | Cavalry, garrison | yes* (our "Pelagius" is used as the epic one) |
| 2026-06-22 | Vercingetorix | Leadership, support | **no** |
| 2026-06-22 | Elizabeth I | Engineering | **no** |
| 2026-07-20 | Yahya ibn Khalid | Integration / gathering (1.1.10 "Starry Rendezvous") | yes |
| 2026-08-31 (update 1.1.11 on 27 Aug 2026) | Ivan IV, William Marshal | Cavalry, combo / conquering combo | yes |
| UNKNOWN (client date empty) | Archimedes, Mary I | Engineering (Wheel of Fortune) | **no** |

Cross-checks: the official X post of 26 Oct 2025 (next-gen cavalry late Nov 2025, next-gen infantry Jan 2026) matches David IV/Gang Gamchan (2025-11-14) and Ivar/Sun Tzu Prime (2026-02-02). The 1.1.11 news (27 Aug 2026) matches Ivan IV/William Marshal (2026-08-31). The client also has unreleased placeholders (Torgny, Wafura with a 2080 date), which are ignored here.

**Newest legendaries missing from our 50:** Vercingetorix, Elizabeth I (2026); Siyaj K'ak', Shapur I, Afonso de Albuquerque, Matthias I (2025); Archimedes, Mary I (date UNKNOWN).
