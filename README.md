# Kingdom 1035 · CZ/SK Rise of Kingdoms

Promo web pre KD 1035 – jediné čisto slovensko-české kráľovstvo v Rise of Kingdoms.
Angular (prerendrované stránky, SK `/` + CZ `/cz`) + Django/DRF + SQLite, všetko v Dockeri.

Projektové pravidlá: [CLAUDE.md](CLAUDE.md).

## Lokálny vývoj

```bash
docker compose -f docker-compose.dev.yml up --build
```

- web: http://localhost:4200 (hot reload)
- admin: http://localhost:8000/admin/ (meno a heslo z `.env`)

### Databáza medzi PC (cez git)

Celá dev databáza (`backend/snapshot/db.sqlite3`) aj nahrané obrázky (`backend/media/`) sú v gite. Raz na každom PC zapni hooky:

```bash
git config core.hooksPath .githooks
```

- **commit** – databáza a obrázky sa pridajú do commitu samé (musí bežať Docker)
- **zmenil si len obsah** (v admine, bez zmeny kódu) – `sh .githooks/dbsync.sh push "Add guide"` (export + commit + push; obyčajný `git commit` bez inej zmeny skončí „nothing to commit“)
- **pull** – ak prišla nová databáza, načíta sa sama (stará sa predtým zálohuje do `./backups`)
- ručne: `sh .githooks/dbsync.sh export` / `sh .githooks/dbsync.sh import`

Obsah meň vždy len na jednom PC naraz a pred prácou daj `git pull`. Binárnu databázu git nevie zlúčiť.

## Nasadenie na server

1. `git clone https://github.com/Gether1996/kd_1035.git && cd kd_1035`
2. Vytvor `.env` podľa [.env.example](.env.example) (`DJANGO_DEBUG=0`, vlastný `DJANGO_SECRET_KEY`, doména v `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` a `SITE_URL`; `DJANGO_NUM_PROXIES=2`, ak je pred webom HTTPS proxy, inak `1`).
3. `docker compose up -d --build`
4. Web beží na porte `WEB_PORT` (predvolene 8080). HTTPS rieši reverse proxy pred ním (napr. Caddy, Nginx Proxy Manager, Traefik).

Aktualizácia: `git pull && docker compose up -d --build`. Dáta zostanú.

### Doména kd1035.eu

1. **DNS** u registrátora: záznam `A` (a `AAAA`, ak má server IPv6) pre `kd1035.eu` aj `www.kd1035.eu` → IP servera.
2. **`.env`**: doména je v [.env.example](.env.example) už vyplnená (`DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `SITE_URL=https://kd1035.eu`).
3. **HTTPS** – reverse proxy pred portom `WEB_PORT`. Najjednoduchšie [Caddy](https://caddyserver.com/), certifikát Let's Encrypt si vybaví sám (`/etc/caddy/Caddyfile`):
   ```
   kd1035.eu, www.kd1035.eu {
       reverse_proxy 127.0.0.1:8080
   }
   ```
   `www` presmeruje na `kd1035.eu` už nginx v kontajneri `web`. Proxy musí posielať hlavičku `X-Forwarded-Proto` (Caddy, Nginx Proxy Manager aj Traefik to robia samé).

   **Prístupové logy v proxy nezapínaj** (v Caddy žiadna direktíva `log`, v Nginx Proxy Manager / Traefik vypnutý access log). Stránka Ochrana údajov sľubuje, že IP adresy návštevníkov neukladáme – logy kontajnerov sú bez IP a majú najviac 3 × 10 MB na službu.
4. **Kontrola:** https://kd1035.eu, https://www.kd1035.eu (presmeruje), https://kd1035.eu/sitemap.xml (adresy začínajú `https://kd1035.eu`), https://kd1035.eu/admin/. Náhľad odkazu na návod (tak ho vidí Discord):
   ```bash
   curl -s -A 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' https://kd1035.eu/navody/commanderi/pary-pre-jazdu | grep og:
   ```
5. **Google:** [Search Console](https://search.google.com/search-console) → pridaj doménu `kd1035.eu` (overenie TXT záznamom v DNS) → Sitemaps → `https://kd1035.eu/sitemap.xml`.

## Dáta a zálohy

- Databáza (`db_data`) a nahrané súbory (`uploads`) sú v Docker volumes. Prežijú rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v`.** Zmaže volumes aj s databázou.
- Kontajner `worker` robí každých `BACKUP_INTERVAL_DAYS` (7) dní zálohu do `BACKUP_PATH` (`./backups`) a nechá posledných `BACKUP_KEEP` (8). Raz denne zmaže expirované prihlásenia (session).

```bash
# záloha hneď
docker compose exec -u app worker python manage.py backup_db
# obnova (názov súboru z ./backups)
docker compose exec -u app worker python manage.py restore_db kd1035_2026-10-07_120000.sqlite3.gz
```

Zálohy z `./backups` si občas skopíruj aj mimo servera. Kópie staršie ako 8 týždňov maž (aj mimo servera) – stránka Ochrana údajov hovorí, že zmazané údaje zmiznú zo záloh do 8 týždňov. Ak zmeníš `BACKUP_INTERVAL_DAYS` alebo `BACKUP_KEEP`, uprav aj túto stránku.

## Návody (commanderi, výbava, eventy)

Iba superuser, v admine → **Návody → Pridať návod**:

1. Vyber kategóriu, napíš nadpis (SK, voliteľne CZ). Adresa sa vyplní sama.
2. Do **obsah HTML (SK)** vlož HTML. CZ je nepovinné, bez neho sa zobrazí slovenský obsah.
3. Obrázky: dole v časti **Obrázky** nahraj súbor a ulož. Pri obrázku sa zobrazí kód `<img src="...">`, skopíruj ho do HTML na miesto, kde má byť.
4. Ulož. Hore je náhľad a tlačidlo „Zobraziť na stránke“.

Skripty, `<style>` bloky a nebezpečné atribúty sa pri uložení odstránia. Vzhľad (nadpisy, tabuľky, zoznamy) dodá web sám.

Odkaz na návod zdieľaný na Discorde alebo Facebooku ukáže nadpis, úvod (prvý odsek) a obrázok kráľovstva. Discord si náhľad nejaký čas pamätá – zmena nadpisu sa v už poslaných odkazoch prejaví až neskôr.

### Automaticky aktualizované návody

Návody o pároch commanderov, výbave a eventoch (políčko **aktualizovať automaticky**) sa raz za mesiac aktualizujú podľa aktuálnej mety. Robí to naplánovaná úloha `kd1035-meta-update` v Claude desktop appke (7. v mesiaci o 18:00, prvýkrát 7. 11. 2026; ak je appka zavretá, spustí sa pri ďalšom otvorení). Dátum poslednej aktualizácie je vždy dole v pätičke webu. Obsah je v `backend/guides/meta/`, do databázy ho pri štarte zapíše `manage.py sync_meta_guides`. Na server sa dostane bežným nasadením (`git pull && docker compose up -d --build`).

Keď takýto návod upravíš ručne v admine, automatika ho prestane prepisovať. Ak ju chceš späť, zaškrtni políčko.

## Discord notifikácie o eventoch

1. Discord: **Server Settings → Integrations → Webhooks → New Webhook** → vyber kanál → **Copy Webhook URL** → `DISCORD_WEBHOOK_URL` v `.env`.
2. Voliteľne vytvor rolu (napr. „Eventy“), ktorú si hráči sami pridajú. Jej ID (Developer Mode → pravý klik na rolu → Copy Role ID) daj do `DISCORD_EVENT_ROLE_ID`. Ak ping nefunguje, zapni pri role „Allow anyone to @mention this role“.
3. `docker compose up -d` (načíta nový `.env`).
4. Admin (iba superuser) → **Discord notifikácie** → nadpis, text, čas. Worker správu pošle v zadanom čase. Akcia „Odoslať na Discord hneď“ slúži na test.

Produkčný webhook patrí **iba do `.env` na serveri**. Do vývojového `.env` ho nedávaj (databáza putuje cez git na každé PC a jeho worker by posielal tiež) – na skúšanie si sprav webhook do testovacieho kanála.

### Opakovaný event (napr. každý týždeň)

**Šablóna:** `docker compose exec -u app backend python manage.py seed_event_templates` založí neaktívne koncepty bežnej rotácie (MGE, Ark of Osiris, Wheel, Esmeralda, Hunt for History, More Than Gems, Alliance Mobilization). Dátumy sú odhad podľa rokcentral.com – v admine ich over (najmä Alliance Mobilization nemá zdroj), uprav časy pripomienok a zaškrtni **aktívny**.

**Nepravidelný event** (Silk Road, Shadow Legion…): zaškrtni **nepravidelný** a opakovanie nechaj 0. Hráči ho na webe vidia aj bez termínu („Ďalší termín oznámime“) a môžu si nastaviť pripomienky vopred. Keď ho naplánujete, v admine zmeň **prvý začiatok** na nový dátum a čas a ulož – pripomienky prídu všetkým, ktorí si ho vybrali. Šablóna zakladá Silk Road, Shadow Legion a Karuak Boss; ďalšie pridáš rovnako.

Admin → **Eventy kráľovstva → Pridať** (zakladaj ich priamo v produkčnom admine):

1. **Názov** (SK, voliteľne CZ) a **text na Discord**. V texte môžeš použiť `{name}`, `{start}` (dátum a čas), `{relative}` („o 2 hodiny“), `{end}` (koniec). Discord ukáže časy každému v jeho časovom pásme.
2. **Prvý začiatok** (čas v Bratislave), **trvanie**, **opakovať každých** N dní (0 = raz, 1 = denne, 7 = týždenne, 14 = každé 2 týždne), voliteľne **do** (vrátane).
3. **Čas sa drží v:** *UTC* pre herné eventy (u nás sa po zmene letného/zimného času posunú o hodinu), *Europe/Bratislava* pre veci podľa nášho času.
4. **Pripomienky:** zaškrtni, kedy pred začiatkom poslať správu (1 deň … pri začiatku). Voliteľne vlastné **ID roly** na ping.
5. Ulož. Tabuľka **Najbližšie termíny** ukáže 5 ďalších termínov a časy pripomienok (Bratislava aj UTC).

Worker vytvára pripomienky 48 h vopred, nájdeš ich v **Discord notifikácie** (filter podľa eventu). Jednu pripomienku zrušíš akciou **Zrušiť (neposielať)**, späť ju vrátiš akciou **Znova naplánovať** (funguje pre zrušené a chybné, odoslané nikdy nepošle znova). Po úprave eventu sa jeho budúce naplánované pripomienky vytvoria nanovo (ručné úpravy v nich sa stratia, odoslané a zrušené ostanú). Bez `DISCORD_WEBHOOK_URL` sa pripomienky neplánujú.

Podobný event (napr. ďalšie MGE): otvor existujúci, zmeň názov alebo prvý začiatok a klikni **Uložiť ako nový** – kópia si naplánuje vlastné pripomienky. Druhý aktívny event s rovnakým názvom aj začiatkom admin neuloží ani nezapne zaškrtnutím **aktívny** v zozname (každá pripomienka by prišla dvakrát). Rovnako odmietne druhú naplánovanú notifikáciu s rovnakým nadpisom a časom a **Znova naplánovať** takú preskočí. Stĺpec **hráči** v zozname ukazuje, koľko hráčov si na webe zaplo pripomienky tohto eventu; klik otvorí ich zoznam.

## Prihlásenie cez Discord (hráčske účty)

Hráči sa prihlásia svojím Discord účtom (web dostane iba Discord ID, meno a avatar, žiadny e-mail). Bez nastavenia je prihlásenie vypnuté a na webe sa neukáže.

> **Na produkčnom serveri ho zapni až po nasadení stránky [Ochrana údajov](https://kd1035.eu/ochrana-udajov)** (`/ochrana-udajov`, odkaz je v pätičke). Ukladáme osobné údaje a stránka presne popisuje, ktoré.

Pred zapnutím na serveri skontroluj:
- stránka Ochrana údajov je nasadená (https://kd1035.eu/ochrana-udajov sa otvorí),
- HTTPS proxy nemá zapnutý prístupový log (pozri Doména kd1035.eu, krok 3),
- `DJANGO_NUM_PROXIES=2`, ak je pred webom HTTPS proxy (inak by všetci hráči zdieľali jeden limit 20 prihlásení za hodinu),
- `SITE_URL` je presne doména zaregistrovaná v Discord aplikácii (krok 3).

1. https://discord.com/developers/applications → **New Application** (napr. „KD 1035“).
2. **OAuth2** → skopíruj **Client ID** do `DISCORD_CLIENT_ID`, **Reset Secret** → skopíruj do `DISCORD_CLIENT_SECRET` (iba do `.env`, nikdy do gitu).
3. **OAuth2 → Redirects** → pridaj presne (aj s lomkou na konci):
   - `http://localhost:4200/api/auth/discord/callback/` (vývoj)
   - `https://kd1035.eu/api/auth/discord/callback/` (server)

   Web posiela `SITE_URL` + `/api/auth/discord/callback/`, takže `SITE_URL` v `.env` musí sedieť s jednou z nich. Lokálne môže `SITE_URL` ostať prázdne – použije sa adresa z prehliadača (`http://localhost:4200`).
4. Pre prihlásenie nič iné nezaškrtávaj. Bot pre pripomienky eventov je samostatný, nepovinný krok (nižšie). `docker compose up -d` (načíta nový `.env`).

Hráč sa prihlási tlačidlom **Prihlásiť** v hlavičke, svoj účet vidí na `/ucet` (meno v hre, odhlásenie, zmazanie účtu). Admin (iba superuser) → **Hráči**: zoznam prihlásených, zmazanie hráča zmaže aj jeho účet. Zablokovanie: **Používatelia** → `discord_<id>` → vypni „Aktívny“. Hráči sa neprenášajú cez git (snapshot ich vynechá).

## Meno v hre a superadmin

Prihlásený hráč si na `/ucet` vyplní **meno v hre**, aby ho vedenie spoznalo. Superadmin ho vidí v admine → **Hráči** (dá sa podľa neho aj hľadať a opraviť).

Superadmin sa do adminu prihlasuje cez Discord: jeho Discord ID patrí do `DISCORD_ADMIN_IDS` v `.env` (Gether: `245662824171438090`). Po prihlásení na webe má na `/ucet` odkaz **Administrácia**. Ďalšie práva (napr. pre R4) sa dávajú ručne v admine → **Používatelia** → `discord_<id>` → správcovský prístup.

## Pripomienky eventov pre hráčov (Discord správa, notifikácie)

Prihlásený hráč si na `/ucet` → **Pripomienky eventov** vyberie eventy a kedy mu ich pripomenúť. Príde mu **súkromná správa od Discord bota**, **notifikácia v prehliadači / na mobile**, alebo oboje. Bez nastavenia je daný spôsob vypnutý (na webe „Zatiaľ nie je zapnuté“), nič sa nepokazí.

**Discord bot** (tá istá aplikácia ako prihlásenie):

1. https://discord.com/developers/applications → aplikácia KD 1035 → **Bot** → **Reset Token** → skopíruj do `DISCORD_BOT_TOKEN` v `.env` (iba tam, nikdy do gitu). Žiadne „Privileged Gateway Intents“ netreba.
2. Pozvi bota na Discord server kráľovstva (nepotrebuje žiadne práva):
   `https://discord.com/oauth2/authorize?client_id=1557662862179311636&scope=bot&permissions=0`
   (číslo za `client_id=` je `DISCORD_CLIENT_ID`).
3. Správu dostane iba hráč, ktorý je na tom serveri a má povolené súkromné správy od jeho členov (v Discorde: názov servera → Nastavenia súkromia → Priame správy). Inak sa doručenie nepodarí – web mu to vysvetľuje.

**Notifikácie v prehliadači** (web push, na serveri potrebuje HTTPS):

1. Raz vygeneruj kľúče: `docker compose exec -u app backend python manage.py generate_vapid_keys` a tri riadky (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) vlož do `.env`.
2. Kľúče už nemeň – s novými by si hráči museli notifikácie zapnúť znova.
3. iPhone/iPad: notifikácie fungujú len po pridaní webu na plochu (Safari → Zdieľať → Pridať na plochu) a otvorení odtiaľ.

Po úprave `.env`: `docker compose up -d` (backend aj worker načítajú nové hodnoty).

**Admin (iba superuser):**

- **Eventy kráľovstva** → event → **Časy pre hráčov**: minúty pred začiatkom oddelené čiarkou, napr. `10, 60, 1440` (1440 = 1 deň), najviac 6. Hráč si môže zadať aj vlastný čas v dňoch, hodinách a minútach (napr. 1 deň 6 h; max. 5 pripomienok na event, najviac 7 dní vopred).
- Hráči vidia iba eventy, ktoré sú **aktívne** a majú **zobraziť na webe**, a len ak majú ďalší termín.
- **Hráči → Pripomienky hráčov**: kto si čo zapol (len na čítanie).
- Worker pripomienku pošle v správnu minútu; ak nebežal viac ako 10 minút, zmeškanú už nepošle. Chyby doručenia sú v logu: `docker compose logs worker`.

Kanálové pripomienky cez webhook (vyššie) fungujú ďalej nezávisle od týchto osobných.

## Kalendár eventov (/kalendar)

Záložka **Kalendár** v hornej lište ukazuje mesiac s eventmi – časy v pásme návštevníka aj v UTC. Zobrazí sa každý event, ktorý je v admine **aktívny** a má **zobraziť na webe**; nepravidelné bez termínu sú v bloku „Ďalší termín oznámime“. Klik na event otvorí detail s návodom a prihlásený hráč si tam rovno zapne pripomienky (rovnako ako v Môj účet). Nič ďalšie sa nenastavuje – stačí mať eventy v admine (napr. zapnúť koncepty zo šablóny).

## Testy

```bash
docker compose -f docker-compose.dev.yml run --rm backend python manage.py test
docker compose -f docker-compose.dev.yml run --rm frontend npx ng test --watch=false
```
