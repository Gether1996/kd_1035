# Backlog webu KD 1035

Udržiava ho workflow `kd-improve` (fáza Backlog). Stav k 10. 10. 2026 – kolo 6 hotové, v1.6.3. Podrobné zadania a verdikty kritika: [`.claude/kd-agents/next-round.json`](../.claude/kd-agents/next-round.json). UX analýza (prečo web používať, čo chýba, čo zámerne nie): [`ux-analyza.md`](ux-analyza.md).

## Hotové

- **10. 10. 2026 – v1.6.3:** lepšie čitateľné tlmené texty (min. kontrast 4,5 : 1) – „termín oznámime“ pri nepravidelných eventoch, popisky v dialógu eventu; nový audit prístupnosti `tools/a11y/audit.sh` (axe) bez kritických chýb.
- **10. 10. 2026 – v1.6.2:** odkaz na event z kalendára ukáže na Discorde a Facebooku názov a termín eventu (napr. „Ark of Osiris · 14.–18. 10. 2026“), nie všeobecnú kartu kalendára.
- **10. 10. 2026 – v1.6.1:** v dialógu eventu v kalendári tlačidlo „Kopírovať odkaz na event“ – odkaz otvorí ten istý mesiac s otvoreným dialógom (napr. Ark of Osiris do Discordu).
- **10. 10. 2026 – v1.6.0:** odber kalendára – všetky eventy kráľovstva v kalendári v mobile (Google, iPhone, Outlook) jedným odkazom, aktualizujú sa samy; na `/kalendar` blok „Odber kalendára“ (Pridať do kalendára, Kopírovať odkaz).
- **10. 10. 2026 – v1.5.2:** na konci návodu „Súvisiace návody“ (napr. Páry pre jazdu → Výbava pre jazdu) a tlačidlo „Kopírovať odkaz“ – odkaz na návod do Discordu jedným ťuknutím aj na mobile.
- **10. 10. 2026 – v1.5.1:** zdieľaný odkaz (`/kalendar?event=…&on=…`, `/navody?commander=…`) si pri presmerovaní na zapamätaný jazyk aj pri prepnutí SK/CZ nechá parametre – český hráč z Discordu uvidí event aj páry commandera.
- **10. 10. 2026 – v1.5.0:** nová kategória návodov **Tipy a triky** (`/navody/tipy`) s prvým návodom Speedupy za nepotrebné siege jednotky; karty návodov na úvode 1 / 2 / 4 v rade.
- **10. 10. 2026 – kolo 5, UX analýza** (`docs/ux-analyza.md`): prečo web používať, čo chýba, poradie nápadov kola 5 (bez zmeny verzie).
- **10. 10. 2026 – v1.4.0:** na `/navody` blok „Nájdi pár pre commandera“ – napíšeš meno commandera a uvidíš, s kým ho párujú naše návody (ako primárny, sekundárny, na koho sa sústrediť), s portrétmi a odkazom na návod.
- **10. 10. 2026 – v1.3.2:** v detaile eventu v kalendári tlačidlá „Google Kalendár“ a „iPhone, Outlook (.ics)“ – jeden termín do vlastného kalendára bez prihlásenia.
- **10. 10. 2026 – v1.3.1:** v sekcii Komunita odkaz „Ako prebieha migrácia“ priamo na kroky migrácie na `/o-nas`; pri členoch vedenia voliteľný riadok „na čo sa obrátiť“ (vypĺňa Gether v admine).
- **10. 10. 2026 – v1.3.0:** rozcestník `/navody` so všetkými návodmi podľa kategórií; „Návody“ v hlavičke naň vedie a svieti na každej stránke návodov, breadcrumbs Domov › Návody › Kategória.
- **10. 10. 2026 – v1.2.1:** tabuľky párov commanderov už nemajú stĺpec F2P (Gether).
- **10. 10. 2026 – v1.2.0:** herné eventy (00:00 UTC) pripomíname deň vopred o 18:00 nášho času namiesto v noci (Discord kanál aj osobné pripomienky, nová voľba „deň vopred o 18:00“); nový nepravidelný event Karuak Ceremony; návody commanderov majú F2P v každej tabuľke párov, zostavy armád ako portréty a zdroj (WarDaddyChadski) len dole.
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

- `guides-search` Vyhľadávanie a filter v návodoch – schválené, nezmestilo sa do kola 6. Čipy až po `guides.ready()` (skryť pri `failed()`), Esc len vymaže hľadanie, počet cez existujúce `guides.count`.
- `game-clock-reset` Herný čas UTC a odpočet do resetu – schválené, odložené na ďalšie kolo. Iba na `/kalendar`; oba časovače rušiť v DestroyRef (test s fake timers), jeden helper „{h} h {m} min“ s testami 0:00, 23:59:30, 23:00.
- Zvyšok auditu prístupnosti (`tools/a11y/audit.sh`, 10. 10. 2026): moderate/minor nález žiadny. Ostáva: ~1 600 kontrastov, ktoré axe nevie posúdiť (text na prechodoch a SVG krajine – „incomplete“ v `tools/a11y/out`), ručne prejsť; dialógy superusera v kalendári (editor eventu, dátumy) zatiaľ nie sú v `STATE_LIST`; ručný test klávesnicou (poradie fokusu, pasca fokusu v dialógoch).
- `migration-status` Stav migrácie v admine – blokované, kým Gether nepotvrdí, že ho vedenie bude udržiavať; skryť po 90 dňoch bez úpravy.
- Drobnosti z kola 5: tagy `v1.3.1`, `v1.3.2`, `v1.5.1`, `v1.5.2`, `v1.6.0`, `v1.6.1`, `v1.6.2` chýbajú na origin (reviewer smie len `git push origin main`; pri release pushovať `main v<verzia>`); portrét pri „ktokoľvek“ v sekundárnej role; spoločná trieda pre odkaz „viac“ (intro/komunita); CZ label `focus_cs` v admine; rgba farby v `commander-finder.scss`; iOS Safari a atribút `download` pri .ics; zarovnanie titulkov v kompaktných riadkoch na 360 px; pevné počty návodov v `ux-analyza.md`.
- Testovacie odoslanie Discord notifikácie do súkromného kanála – schválené, čaká na `DISCORD_TEST_WEBHOOK_URL`.
- Týždenný prehľad eventov na Discorde – až po zapnutí rotácie a súhlase Gethera.
- Eventy ako Discord Scheduled Events – až po rozhodnutí Gethera; nie spolu s týždenným prehľadom.
- `ui-polish-leftovers` Drobnosti z kola 4 (kritik: upraviť, až po funkciách; rgba v commander-finder vynechať – len ako rozhodnutie pre celý repo): spoločný štýl `.tag--live` (screenshoty pred/po na 5 šírkach), odkaz zlyhaných notifikácií len za 7 dní, naivný čas v `worker_status.json` (test spätne kompatibilného čítania), CZ „Kalendář“ na `/pripomienky` pretečie?, `#alliance` pri 360 px, nové screenshoty.
- Drobnosti z kola 6: `/api/calendar.ics` a `.ics` eventu odpovedajú na HEAD 405 → `require_safe` + test; dialóg eventu sa pri prepnutí jazyka zatvorí (kalendár maže `?event=` z URL); konzolová chyba „Transition was skipped“ pri deep linku v kalendári; opakované „Kopírovať odkaz“ do 2,5 s čítačka neoznámi znova (návod aj dialóg); na desktop Chrome/Edge pri odmietnutí clipboardu otvorí systémové zdieľanie; náhľad skončeného jednorazového eventu bez `on` hovorí „ďalší termín oznámime“; „termín oznámime“ odlíšiť aj inak než kurzívou; release commit má byť posledný v úlohe.

## Zamietnuté

- Bezpečnostné hlavičky v nginx – už existujú (`security-headers.conf`); plná CSP by mala malý prínos a riziko.
- Registrácia Governor ID so schválením R4, prístup R4 do adminu s exportom governorov, upozornenia vedenia na nové registrácie – Gether registráciu governorov zrušil (8. 10. 2026).
- `discord-slash-events` Príkaz /eventy na Discorde – blokované: chýba rozhodnutie Gethera a nasadenie na verejné HTTPS (Interactions endpoint); nová závislosť, env a zmena Ochrany údajov. Navrhnúť znova po nasadení, ak o to Gether požiada.

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
- **Vedenie – „na čo sa obrátiť“:** krátky text pre Methiu, Gethera a Hefariona v SK aj CZ (admin → Aliancia → vedenie); dovtedy riadok skrytý.
- **Export eventu do kalendára:** na skutočnom zariadení stiahnuť .ics (napr. Ark of Osiris) a importovať do Google Kalendára a iPhone/macOS; overiť lokálny čas (00:00 UTC = 02:00 letný čas) a či Safari neuloží súbor do Files.
- **Stav migrácie:** ak áno, aktuálny stav, poznámka a podmienky v SK aj CZ.
- **Rozhodnúť:** týždenný prehľad na Discorde (`DISCORD_WEEKLY_DIGEST`, pondelok 9:00?), stav migrácie na webe, Discord Scheduled Events (`DISCORD_GUILD_ID` + právo Manage Events).
- **Odber kalendára (v1.6.0):** po nasadení sa raz prihlásiť na odber v Google Kalendári (Iné kalendáre → Z URL, skopírovaný https odkaz) a na iPhone („Pridať do kalendára“); Google obnovuje hodiny až deň. Voliteľne `https://kd1035.eu/api/calendar.ics` do validátora (icalendar.org).
- **Náhľad eventu (v1.6.2):** po nasadení vložiť odkaz na event do Discord kanála a skontrolovať kartu (čerstvý odkaz, Discord cachuje).
- **Release tagy:** `git tag v1.5.2 d43dcdc && git tag v1.6.0 e5d78fa && git tag v1.6.1 92b69c0 && git tag v1.6.2 85e0269 && git push origin v1.3.1 v1.3.2 v1.5.1 v1.5.2 v1.6.0 v1.6.1 v1.6.2` (ak ich orchestrátor nedoplní).
- **Rozhodnúť:** chce Gether príkaz /eventy pre bota na Discorde (áno/nie)? Ak áno, `DISCORD_PUBLIC_KEY` (+ voliteľne `DISCORD_GUILD_ID`) do `.env` na serveri.
