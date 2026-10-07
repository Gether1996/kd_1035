# Backlog webu KD 1035

Udržiava ho workflow `kd-improve` (fáza Backlog). Stav k 7. 10. 2026 – kolo 1 zastavené na pokyn Gethera. Podrobné zadania a verdikty kritika: [`.claude/kd-agents/next-round.json`](../.claude/kd-agents/next-round.json).

## Hotové

- **7. 10. 2026 – Opakované eventy kráľovstva s automatickými Discord pripomienkami** (kolo 1, schválené kritikom). Admin → Eventy kráľovstva, pripomienky posiela worker.
- **7. 10. 2026 – mimo kôl:** návody commanderi (10), výbava (7) a eventy (13) v SK/CZ so zdrojmi, ich mesačná automatická aktualizácia, dátum poslednej aktualizácie v pätičke, nočná krajina na pozadí webu, synchronizácia dev databázy cez git.

## Rozpracované

- **Prihlásenie cez Discord (hráčske účty)** – postavené na vetve `wip/discord-login`, ešte neprešlo review kritika. Ďalšie kolo ho dokončí ako prvé.

## Ďalšie v poradí

1. Registrácia Governor ID so schválením R4/adminom
2. Stránka Ochrana údajov a minimalizácia uložených dát
3. Skutočná stránka 404 (SK/CZ) namiesto tichého presmerovania domov – kritik schválil
4. Najbližšie eventy na úvodnej stránke – kritik schválil

## Odložené (kritik: upraviť podľa poznámok v next-round.json)

- Verejný kalendár eventov (SK/CZ)
- Náhľad Discord správy a testovacie odoslanie v admine
- Prehľad v admine: stav workera, najbližšie a zlyhané notifikácie
- Prístup R4 do adminu cez Discord a export zoznamu governorov
- Upozornenia pre vedenie na Discorde (nové registrácie, zlyhané pripomienky)
- Odber kalendára eventov (iCal) do mobilu

## Čaká na Gethera

- **Discord aplikácia** (Developer Portal): Client ID a Client Secret do `.env`, redirect URI `http://localhost:4200/api/auth/discord/callback/` a `https://<doména>/api/auth/discord/callback/`.
- **Webhook** `DISCORD_WEBHOOK_URL` (voliteľne `DISCORD_EVENT_ROLE_ID`) – na dev PC testovací kanál, ostrý iba na serveri (dev databáza sa cez git dostane na každé PC).
- **Zoznam opakovaných eventov kráľovstva** (SK/CZ názov, prvý začiatok, opakovanie, čas) a predstih pripomienok – nič nie je vymyslené ani naseedované.
- **Rozhodnutia k registrácii:** max. počet governorov na hráča (návrh 5), či sa smú registrovať farmy, kto schvaľuje (R4).
- **Ochrana údajov:** kto je prevádzkovateľ a kontakt, potvrdenie 90-dňovej lehoty pre zamietnuté registrácie.
- Pre odložené funkcie: webhook testovacieho kanála (`DISCORD_TEST_WEBHOOK_URL`) a súkromného kanála vedenia (`DISCORD_STAFF_WEBHOOK_URL`).

## Drobnosti z review (neblokujúce)

- Admin akcie „Odoslať na Discord hneď“ a „Znova naplánovať“ nekontrolujú stav – pri hromadnom výbere môžu poslať zrušené pripomienky.
- Pripomienka zrušená v okne kratšom ako jeden takt workera (30 s) sa ešte odošle.
- „každých N dní“ pre N = 2–4 má byť „každé 2 dni“.
- Pri šírke 1280 px sa v admine láme „Bratislava · UTC“ a stĺpec „aktívny“ odíde do horizontálneho scrollu.
