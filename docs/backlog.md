# Backlog webu KD 1035

Udržiava ho workflow `kd-improve` (fáza Backlog). Stav k 9. 10. 2026 – kolo 4 hotové. Podrobné zadania a verdikty kritika: [`.claude/kd-agents/next-round.json`](../.claude/kd-agents/next-round.json).

## Hotové

- **9. 10. 2026 – v1.1.1:** odkazy Aliancia/Návody/Komunita v hlavičke dosadnú na svoju sekciu aj keď sa nad ňou neskôr načítajú Najbližšie eventy; späť/dopredu v prehliadači vráti na pôvodné miesto (vetva TTakedaSVK).
- **9. 10. 2026 – v1.1.0, kolo 4:** skúšobná správa od bota na `/pripomienky` a varovanie pri nedoručenej pripomienke; prehľad na úvode adminu (worker, zálohy, najbližšie a zlyhané notifikácie); najbližšie eventy na úvodnej stránke; najbližší termín eventu priamo v jeho návode.
- **9. 10. 2026 – v1.0.2:** blok Nepravidelné eventy v kalendári ukazuje všetky nepravidelné eventy aj s termínom (napr. Alliance Mobilization).
- **9. 10. 2026 – Páry commanderov podľa WarDaddyChadského** (mimo kola, Gether): prepisy jeho videí cez `tools/youtube`, mesačná aktualizácia ho berie ako hlavný zdroj, leadership návod zrušený.
- **9. 10. 2026 – v1.0.1:** pri pravidelných eventoch a Alliance Mobilization sa na `/pripomienky` ukazuje iba deň, čas len pri krátkych nepravidelných eventoch (ako v kalendári).
- **9. 10. 2026 – v1.0.0: verzia webu v pätičke** (pravidlá v CLAUDE.md → Verzia webu). Prvá očíslovaná verzia = stav webu k tomuto dňu.
- **9. 10. 2026 – Pripomienky iba cez Discord, vlastná stránka a zvonček** (mimo kola, Gether): web push úplne zrušený (jediný prepínač „Správy od bota“), stránka `/pripomienky` (vľavo prepínač a Moje pripomienky, vpravo Všetky eventy), zvonček v hlavičke, `/ucet` už len profil, sekcia „Nezmeškaj event“ s ukážkou správy na úvode. Holy Knight's Treasure (vajce) oddelený od Hunt for History (kladivo), tri sady výbavy; Alliance Mobilization bez času začiatku.
- **8. 10. 2026 – Kalendár eventov a nepravidelné eventy** (mimo kola): stránka `/kalendar` so záložkou v hlavičke (lokálny čas aj UTC, pripomienky sa dajú nastaviť priamo z kalendára), nepravidelné eventy Silk Road, Shadow Legion a Karuak Boss (hráči si ich vyberú vopred, pripomienka príde, keď Gether nastaví termín), 20 GH každé 2 týždne, neaktívne šablóny bežnej rotácie (`seed_event_templates`), vlastné časy pripomienok v dňoch, hodinách a minútach, na `/ucet` prehľad „Moje pripomienky“ a zoznam všetkých eventov s vyhľadávaním a filtrom.
- **8. 10. 2026 – kolo 3:** stránka 404 v SK/CZ (bez canonical a hreflang na noindex stránkach), vylepšený admin eventov (bezpečné akcie, uloženie ako nový, stĺpec hráčov, poistka proti duplicitám), náhľady odkazov na návody pre Discord a Facebook (Open Graph, nginx podľa user-agenta).
- **8. 10. 2026 – Stránka Ochrana údajov, logy servera bez IP a rotácia logov** (kd-improve, builder): `/ochrana-udajov` + `/cz/ochrana-udajov` (presne čo ukladáme, tretie strany, ako dlho, zmazanie účtu), odkaz v pätičke a na `/ucet`; nginx loguje bez IP, logy kontajnerov max. 3 × 10 MB, YouTube embedy cez youtube-nocookie, zmazanie účtu zmaže aj admin históriu o hráčovi. Discord prihlásenie sa po nasadení môže zapnúť aj na serveri.
- **8. 10. 2026 – Pripomienky eventov pre hráčov** (builder + kritik, mimo kola): superadmin pri evente nastaví „Časy pre hráčov“, hráč si na `/ucet` vyberie eventy a časy (aj vlastné) a dostane súkromnú správu od bota na Discorde a/alebo notifikáciu v prehliadači. Admin → Pripomienky hráčov a Odoslané pripomienky.
- **8. 10. 2026 – mimo kôl:** stĺpec „meno v hre“ v admine Používatelia, vždy len jedna aliancia, banner a avatar pre Discord bota (`generate.py --discord`).
- **8. 10. 2026 – Prihlásenie cez Discord (hráčske účty)** (kolo 2, schválené kritikom). Tlačidlo v hlavičke, stránka `/ucet`.
- **8. 10. 2026 – Meno v hre a superadmin cez Discord** (mimo kola). Registráciu Governor ID (kolo 2) Gether zrušil – hráč si na `/ucet` vyplní len meno v hre; Discord ID v `DISCORD_ADMIN_IDS` sú superadmini.
- **8. 10. 2026 – mimo kôl:** doména kd1035.eu (README → Doména kd1035.eu), trvalá Discord pozvánka, vedenie (Methiu – Vodca, Gether a Hefarion – R4, všetci s Discord ID), ikony predmetov a portréty commanderov v návodoch, top jazda Arthur + Ivan IV a Attila + Achilles, zberači s bonusom surovín po zbere, MTG raz za mesiac, „garrison“ bez prekladu, odkazy v krokoch migrácie, stránka Podmienky používania a rozšírená pätička, oprava `/uploads/` v produkčnom nginx.
- **7. 10. 2026 – Opakované eventy kráľovstva s automatickými Discord pripomienkami** (kolo 1, schválené kritikom). Admin → Eventy kráľovstva, pripomienky posiela worker.
- **7. 10. 2026 – mimo kôl:** návody commanderi (10), výbava (7) a eventy (13) v SK/CZ so zdrojmi, ich mesačná automatická aktualizácia, dátum poslednej aktualizácie v pätičke, nočná krajina na pozadí webu, synchronizácia dev databázy cez git.

## Odložené

- Odber kalendára eventov (iCal) do mobilu – schválené, nepostavené.
- Testovacie odoslanie Discord notifikácie do súkromného kanála – schválené, čaká na `DISCORD_TEST_WEBHOOK_URL`.
- Rozcestník `/navody` s vyhľadávaním – upraviť (dva commity: rozcestník, potom vyhľadávanie).
- Audit prístupnosti (axe) – upraviť (skip link už existuje, len critical/serious).
- Týždenný prehľad eventov na Discorde – až po zapnutí rotácie a súhlase Gethera.
- Stav migrácie v admine – iba ak vedenie chce stav udržiavať.
- Eventy ako Discord Scheduled Events – až po rozhodnutí Gethera; nie spolu s týždenným prehľadom.
- Drobnosti z kola 4: spoločný štýl `.tag--live`, odkaz zlyhaných notifikácií len za 7 dní, naivný čas v `worker_status.json`, CZ „Kalendář“ na `/pripomienky` pretečie?, `#alliance` pri 360 px, nové screenshoty.

## Zamietnuté

- Bezpečnostné hlavičky v nginx – už existujú (`security-headers.conf`); plná CSP by mala malý prínos a riziko.
- Registrácia Governor ID so schválením R4, prístup R4 do adminu s exportom governorov, upozornenia vedenia na nové registrácie – Gether registráciu governorov zrušil (8. 10. 2026).

## Čaká na Gethera

- **Discord aplikácia:** lokálne zapnutá (Client ID a Secret v dev `.env`, redirect URI pre localhost aj kd1035.eu sú zaregistrované). Pred serverom **Reset Secret** a **Reset Token** bota (staré sú v histórii chatu), nové do `.env` na serveri aj lokálne; na serveri aj `DISCORD_ADMIN_IDS`.
- **Webhook** `DISCORD_WEBHOOK_URL` (voliteľne `DISCORD_EVENT_ROLE_ID`) – na dev PC testovací kanál, ostrý iba na serveri (dev databáza sa cez git dostane na každé PC).
- **Eventy:** šablóny bežnej rotácie (MGE, Ark, Wheel…) sú v admine neaktívne – skontrolovať dátumy, zapnúť a nastaviť „Časy pre hráčov“. Pred každým nepravidelným eventom (Silk Road, Shadow Legion, Karuak Boss) nastaviť nový termín.
- **Verejné repo:** snapshot databázy obsahuje hash hesla dev admina – na serveri iné silné `DJANGO_SUPERUSER_PASSWORD`; zvážiť vrátenie repa na privátne.
- **Ochrana údajov:** potvrdiť text prevádzkovateľa („Gether, R4 kráľovstva 1035, kontakt cez Discord“ – použité, kým nepovie inak). Na serveri v HTTPS proxy (Caddy) **nezapínať prístupový log** a kópie záloh mimo servera mazať po 8 týždňoch (stránka to sľubuje).
- **Server:** DNS pre kd1035.eu a www, HTTPS proxy (Caddy), `.env` – postup v README → Doména kd1035.eu.
- **Bot na Discord serveri:** pridaný (8. 10. 2026); DM príde len hráčom, ktorí majú povolené súkromné správy od členov servera.
- Pre odložené funkcie: webhook testovacieho kanála (`DISCORD_TEST_WEBHOOK_URL`) a súkromného kanála vedenia (`DISCORD_STAFF_WEBHOOK_URL`).
- **Skúšobná správa:** raz kliknúť „Poslať skúšobnú správu“ na `/pripomienky` (SK aj `/cz`) so skutočným Discord účtom.
- **Úvod a návody:** na serveri zapnúť eventy rotácie so „zobraziť na webe“ (inak sekcia Najbližšie eventy ostane skrytá) a v admine prepojiť eventy s návodmi (pole „návod“).
- **Rozhodnúť:** týždenný prehľad na Discorde (`DISCORD_WEEKLY_DIGEST`, pondelok 9:00?), stav migrácie na webe, Discord Scheduled Events (`DISCORD_GUILD_ID` + právo Manage Events).
