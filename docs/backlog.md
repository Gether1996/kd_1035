# Backlog webu KD 1035

Udržiava ho workflow `kd-improve` (fáza Backlog). Stav k 8. 10. 2026 – kolo 2 zastavené na pokyn Gethera. Podrobné zadania a verdikty kritika: [`.claude/kd-agents/next-round.json`](../.claude/kd-agents/next-round.json).

## Hotové

- **8. 10. 2026 – Pripomienky eventov pre hráčov** (builder + kritik, mimo kola): superadmin pri evente nastaví „Časy pre hráčov“, hráč si na `/ucet` vyberie eventy a časy (aj vlastné X minút) a dostane súkromnú správu od bota na Discorde a/alebo notifikáciu v prehliadači. Admin → Pripomienky hráčov a Odoslané pripomienky.
- **8. 10. 2026 – mimo kôl:** stĺpec „meno v hre“ v admine Používatelia, vždy len jedna aliancia, banner a avatar pre Discord bota (`generate.py --discord`).
- **8. 10. 2026 – Prihlásenie cez Discord (hráčske účty)** (kolo 2, schválené kritikom). Tlačidlo v hlavičke, stránka `/ucet`. Na serveri ho nezapínaj pred stránkou Ochrana údajov.
- **8. 10. 2026 – Meno v hre a superadmin cez Discord** (mimo kola). Registráciu Governor ID (kolo 2) Gether zrušil – hráč si na `/ucet` vyplní len meno v hre; Discord ID v `DISCORD_ADMIN_IDS` sú superadmini.
- **8. 10. 2026 – mimo kôl:** doména kd1035.eu (README → Doména kd1035.eu), trvalá Discord pozvánka, vedenie (Methiu – Vodca, Gether a Hefarion – R4, všetci s Discord ID), ikony predmetov a portréty commanderov v návodoch, top jazda Arthur + Ivan IV a Attila + Achilles, zberači s bonusom surovín po zbere, MTG raz za mesiac, „garrison“ bez prekladu, odkazy v krokoch migrácie, stránka Podmienky používania a rozšírená pätička, oprava `/uploads/` v produkčnom nginx.
- **7. 10. 2026 – Opakované eventy kráľovstva s automatickými Discord pripomienkami** (kolo 1, schválené kritikom). Admin → Eventy kráľovstva, pripomienky posiela worker.
- **7. 10. 2026 – mimo kôl:** návody commanderi (10), výbava (7) a eventy (13) v SK/CZ so zdrojmi, ich mesačná automatická aktualizácia, dátum poslednej aktualizácie v pätičke, nočná krajina na pozadí webu, synchronizácia dev databázy cez git.

## Ďalšie v poradí

1. Stránka Ochrana údajov a minimalizácia uložených dát – **musí byť nasadená skôr, ako sa na serveri zapne Discord prihlásenie**
2. Skutočná stránka 404 (SK/CZ) namiesto tichého presmerovania domov – kritik schválil

## Odložené (kritik: upraviť podľa poznámok v next-round.json)

- Verejný kalendár eventov (SK/CZ)
- Náhľad Discord správy a testovacie odoslanie v admine
- Prehľad v admine: stav workera, najbližšie a zlyhané notifikácie
- Najbližšie eventy na úvodnej stránke (spolu s kalendárom, keď budú skutočné eventy)
- Odber kalendára eventov (iCal) do mobilu

## Zamietnuté

- Registrácia Governor ID so schválením R4, prístup R4 do adminu s exportom governorov, upozornenia vedenia na nové registrácie – Gether registráciu governorov zrušil (8. 10. 2026).

## Čaká na Gethera

- **Discord aplikácia:** lokálne zapnutá (Client ID a Secret v dev `.env`, redirect URI pre localhost aj kd1035.eu sú zaregistrované). Pred serverom **Reset Secret** (starý je v histórii chatu) a nový do `.env` na serveri aj lokálne; na serveri aj `DISCORD_ADMIN_IDS`.
- **Webhook** `DISCORD_WEBHOOK_URL` (voliteľne `DISCORD_EVENT_ROLE_ID`) – na dev PC testovací kanál, ostrý iba na serveri (dev databáza sa cez git dostane na každé PC).
- **Zoznam opakovaných eventov kráľovstva** (SK/CZ názov, prvý začiatok, opakovanie, čas) a predstih pripomienok – nič nie je vymyslené ani naseedované.
- **Ochrana údajov:** kto je prevádzkovateľ a kontakt (návrh: Gether, kontakt cez Discord), čo presne ukladáme (Discord ID, meno, avatar, meno v hre).
- **Server:** DNS pre kd1035.eu a www, HTTPS proxy (Caddy), `.env` – postup v README → Doména kd1035.eu. Na serveri vlastné VAPID kľúče (`manage.py generate_vapid_keys`), nový bot token (Reset Token) a `DISCORD_ADMIN_IDS`.
- **Bot na Discord serveri:** pozvať ho odkazom z README (inak hráčom nepríde súkromná správa).
- **Eventy:** založiť ich v admine a pri každom nastaviť „Časy pre hráčov“.
- Pre odložené funkcie: webhook testovacieho kanála (`DISCORD_TEST_WEBHOOK_URL`) a súkromného kanála vedenia (`DISCORD_STAFF_WEBHOOK_URL`).

## Drobnosti z review (neblokujúce)

- Admin akcie „Odoslať na Discord hneď“ a „Znova naplánovať“ nekontrolujú stav – pri hromadnom výbere môžu poslať zrušené pripomienky.
- Pripomienka zrušená v okne kratšom ako jeden takt workera (30 s) sa ešte odošle.
- „každých N dní“ pre N = 2–4 má byť „každé 2 dni“.
- Pri šírke 1280 px sa v admine láme „Bratislava · UTC“ a stĺpec „aktívny“ odíde do horizontálneho scrollu.
