# Odporúčania pre Gethera

Stav k **10. 10. 2026** (v1.6.3, po 6. kole agentov). Kritik v 5. aj 6. kole uviedol, že web je funkčne viac-menej hotový. Toto je zoznam vecí, ktoré už nevyrieši kód, ale ty – zoradené podľa dôležitosti. Podrobnosti a technické poznámky sú v [`backlog.md`](backlog.md) (časť „Čaká na Gethera“).

## 1. Nasadenie na kd1035.eu (bez toho hráči nič neuvidia)

1. **Server, DNS a HTTPS:** DNS pre `kd1035.eu` aj `www`, Caddy s `X-Forwarded-Proto`, **bez prístupového logu** (stránka Ochrana údajov sľubuje, že IP neukladáme). Postup: README → Doména kd1035.eu.
2. **Produkčný `.env`** (`.env.production` na tvojom PC): pred spustením v Discord Developer Portáli **Reset Secret** a **Reset Token** bota – staré sa objavili v histórii chatu. Nové hodnoty daj do `.env` na serveri aj lokálne, na serveri aj `DISCORD_ADMIN_IDS` a silné `DJANGO_SUPERUSER_PASSWORD` (hash dev hesla je v snapshote v gite).
3. **Nasadenie:** `git pull && docker compose up -d --build`. Migrácie (18:00 pripomienky, Karuak Ceremony, Tipy a triky, vedenie) prebehnú samy.

## 2. Nastavenia v produkčnom admine

- **Eventy rotácie** (MGE, Ark of Osiris, Wheel, Hunt for History, Holy Knight's Treasure, More Than Gems, 20 GH…): skontrolovať dátumy, zapnúť, nechať „zobraziť na webe“. Bez nich sú kalendár, Najbližšie eventy na úvode, odber kalendára aj pripomienky prázdne.
- **Nepravidelné eventy** (Silk Road, Shadow Legion, Karuak Boss, Karuak Ceremony, Alliance Mobilization): pred každým konaním nastaviť termín – v admine alebo priamo v `/kalendar`.
- **Discord webhook** `DISCORD_WEBHOOK_URL` (+ voliteľne `DISCORD_EVENT_ROLE_ID`) iba na serveri, nikdy v dev `.env`.
- **Vedenie – „na čo sa obrátiť“:** krátky text pre Methiu, seba a Hefariona v SK aj CZ (Aliancia → vedenie). Kým chýba, riadok sa neukazuje.
- **Prepojiť eventy s návodmi** (pole „návod“ pri evente) – potom má návod kartu „V kalendári“ a správy odkaz na návod.

## 3. Raz vyskúšať po nasadení

- **Pripomienky:** na `/pripomienky` kliknúť „Poslať skúšobnú správu“ (SK aj CZ).
- **Kalendár v mobile:** odber `https://kd1035.eu/api/calendar.ics` v Google Kalendári (Iné kalendáre → Z URL) a na iPhone; stiahnuť `.ics` jedného eventu a overiť čas (00:00 UTC = 02:00 v lete, 01:00 v zime).
- **Náhľady na Discorde:** vložiť do kanála odkaz na návod a na event z kalendára (vždy čerstvý odkaz – Discord náhľady cachuje).

## 4. Obsah, ktorý môžeš dodať len ty

- **Fotky a texty o kráľovstve** na promo stránky (úvod, O nás) – web podľa pravidiel nevymýšľa fakty, preto sú tam zatiaľ krátke placeholdery.
- **Ďalšie tipy a triky** z hry (ako trik s fortmi) – stačí mi ich napísať, alebo ich pridaj ako ručný návod v admine.

## 5. Rozhodnutia, ktoré čakajú na teba

- **Týždenný prehľad eventov na Discorde** (napr. pondelok 9:00) – áno/nie.
- **Discord Scheduled Events** (eventy priamo v Discord serveri) – áno/nie; treba `DISCORD_GUILD_ID` a právo Manage Events.
- **Príkaz /eventy pre bota** – áno/nie; dá sa až po nasadení na HTTPS.
- **Stav migrácie na webe** (otvorená / po dohode / zatvorená) – iba ak ho vedenie bude udržiavať aktuálny.
- **Text prevádzkovateľa** na stránke Ochrana údajov („Gether, R4 kráľovstva 1035, kontakt cez Discord“) – potvrdiť alebo upraviť.
- **Repo:** zvážiť vrátenie GitHub repa na privátne (snapshot databázy je v gite).

## 6. Riziká a údržba

- **Zálohy:** worker zálohuje každých 7 dní a necháva 8 posledných. Kópie mimo servera maž po 8 týždňoch – sľubuje to stránka Ochrana údajov.
- **Mesačná aktualizácia návodov** beží ako naplánovaná úloha na tomto PC (7. deň v mesiaci 18:00) – len keď je Claude appka otvorená. Na druhom PC ju nezakladaj.
- **Pravidlá hry sa menia:** termíny eventov (rokcentral/codexhelper sú len odhad) a triky over v hre, keď si nie si istý.
- **Ďalšie kolo agentov** (ak budeš chcieť): schválené, ale nepostavené sú vyhľadávanie v návodoch a herné hodiny UTC s odpočtom do resetu v kalendári. Väčší prínos však teraz prinesie nasadenie a zapnutie eventov než nové funkcie.
