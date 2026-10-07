# KD 1035 – projektové pravidlá

Promo web pre kráľovstvo **1035** v hre Rise of Kingdoms (https://rok.lilith.com/) – jediné kráľovstvo v hre zložené výhradne zo slovenských a českých hráčov.

Tieto pravidlá platia pri **každej** úlohe v tomto repozitári. Každé nové dôležité rozhodnutie (konfigurácia, dizajn, architektúra, workflow) hneď zapíš sem.

## Komunikácia
- S používateľom (Gether) komunikuj po slovensky.
- Kód, názvy v kóde a komentáre píš po anglicky. Texty na webe idú výhradne cez i18n (SK/CZ).

## Dizajn a UX
- **User friendly, ľahko čitateľné, čisté moderné UI.** Herný vzhľad v duchu Rise of Kingdoms: tmavá navy, zlatá, červený akcent, fonty Cinzel (nadpisy) + Barlow (text).
- **Iba tmavý štýl.** Žiadny light/dark prepínač, žiadne `prefers-color-scheme` varianty.
- Farby, fonty, rozostupy a easing sú CSS premenné v `frontend/src/styles.scss` (`:root`). Nové farby nepridávaj natvrdo do komponentov (výnimka: farby značiek Discord/Facebook).
- Hero pozadie = vrstvené SVG (`frontend/public/img/hero/*.svg`) generované skriptom `tools/background/generate.py`. Pri úprave grafiky meň skript, nie SVG ručne (príkaz nižšie). Kompozícia: nadpis hore na oblohe, hrad v strede, CTA dole.
- **Žiadny balast textu.** Krátke nadpisy, max. 1–2 vety na blok. Radšej vynechať ako nafúknuť. Výnimka: stránka **O nás** je SEO stránka s dlhším, ale štruktúrovaným textom (nadpisy, zoznamy). FAQ sekciu používateľ nechce.
- **Nesmie to vyzerať ako AI slop:** žiadne generické gradientové fľaky, emoji namiesto ikon, prázdne marketingové frázy ani glow efekty všade. Grafika je ručne navrhnutá (SVG) a drží jednu paletu a jeden štýl.
- **Plynulé pohyby:** parallax pozadia (`appScrollFx` → CSS `--progress`), posúvaný text pri scrollovaní, scroll reveal (`appReveal`), jemné hover stavy. Animuj len `transform`/`translate` a `opacity`. Vždy rešpektuj `prefers-reduced-motion`.
- **100 % responzívne** – mobil od 320 px, landscape mobil, tablet, notebook, desktop, ultrawide. Každú vizuálnu zmenu over screenshotmi (`tools/screenshots/shoot.mjs`) minimálne na 360, 768, 1280, 1920 a 2560.
- Prístupnosť: dostatočný kontrast, viditeľný focus, `alt`/`aria-label`, ovládanie klávesnicou.

## Jazyky SK / CZ a SEO
- Každý jazyk má vlastné URL s rovnakými slugmi: SK v koreni (`/`, `/o-nas`, `/navody/vybava`, `/navody/vybava/<slug>`), CZ pod `/cz` (`/cz/...`). Jazyk sa určuje z URL; odkazy skladaj cez `I18n.path()`, `I18n.guidePath()`, prepínač jazyka cez `I18n.switchPath()`. Nové stránky pridávaj do `app.routes.ts` (funkcia `pages()`), `parseUrl`/`Page` v `i18n.ts`, `app.routes.server.ts` a do `STATIC_PAGES` v `backend/guides/views.py` (sitemap).
- Každý text v oboch jazykoch: `frontend/src/app/core/i18n/sk.ts` a `cs.ts` (typ `Dict` + test stráži rovnakú štruktúru). Žiadne natvrdo písané texty v šablónach (okrem vlastných mien: Kingdom 1035, Rise of Kingdoms, Discord…).
- Stránky sú **prerendrované** (Angular SSG, `outputMode: static`) → statické HTML pre Google. Výnimka: detail návodu (`navody/:category/:slug`) sa renderuje v prehliadači (`RenderMode.Client`, nginx vráti `index.csr.html`). Kód musí byť SSR-safe: `window`, `localStorage`, `matchMedia` len v prehliadači (`isPlatformBrowser`, `afterNextRender`). API sa volá iba v prehliadači.
- `Seo` služba nastavuje title, description, canonical, hreflang (sk, cs, x-default), Open Graph a JSON-LD (WebSite, Organization, BreadcrumbList). Stránky s obsahom z DB volajú `seo.set({title, description, breadcrumbs})`. `sitemap.xml` generuje Django (`/sitemap.xml`) vrátane všetkých zverejnených návodov. Prerendrované HTML má placeholder `__SITE_ORIGIN__`, ktorý nginx nahradí `SITE_URL` z `.env`.
- Kľúčové slová prirodzene v texte (bez spamovania): ROK KD CZ SK, slovenské KD, české KD, slovenské/české kráľovstvo v Rise of Kingdoms, KD 1035.
- Obsah z databázy (návody a pod.) bude mať polia pre SK aj CZ.
- Dbaj na pravopis a diakritiku (SK: ä, ô, ľ, ĺ, ŕ; CZ: ř, ů, ě).

## Obsah
- Plánované: návody (kombinácie commanderov, najlepšia výbava, eventy), ďalšie kontakty na R4, prihlasovanie hráčov cez Governor ID.
- **Rise of Kingdoms / Lilith nemá verejné API** (ani na hráčov, ani na kráľovstvá). Na webe preto **nezobrazujeme meniace sa čísla** (sila, počet členov, územie…), lebo by zastarali. Len stabilné údaje zadané v admine.
- Kráľovstvo má **jednu hlavnú alianciu**: [CS35] CZ/SK Legends. Vedenie (model `Officer`): Methiu von CzF – Vodca, Gether – Kancelár (Discord ID v seed migrácii). Tlačidlo „Kontaktovať“ otvorí `discord.com/users/<ID>`, bez ID skopíruje Discord meno.
- Odkazy (admin → Odkazy): Facebook skupina https://www.facebook.com/groups/550189483954751, Discord zatiaľ chýba → web ukáže „Čoskoro“.
- Prihlásenie cez Governor ID sa nedá overiť automaticky → registráciu bude schvaľovať R4/admin.
- Fotky a texty dodá používateľ. Dovtedy len krátke placeholdery – **žiadne vymyslené fakty** o kráľovstve.
- Nepoužívaj oficiálne assety Lilith Games (logá, artworky) bez súhlasu používateľa.
- Pätička: malý watermark „Vytvoril Gether · 2026“ + krátka poznámka, že ide o neoficiálnu fanúšikovskú stránku.

## Návody (CMS)
- Spravuje ich **iba superuser** v Django admine (Návody): kategória (Commanderi / Výbava / Eventy), nadpis SK + CZ (CZ nepovinný → použije sa SK), slug, HTML obsah SK + CZ, poradie, zverejnený.
- HTML sa pri uložení čistí knižnicou **nh3** (`backend/guides/sanitize.py`): odstráni `<script>`, `<style>`, on* atribúty a `javascript:` odkazy; povolené sú bežné tagy, tabuľky, obrázky a video embedy (YouTube, Twitch). Frontend preto obsah vkladá cez `bypassSecurityTrustHtml`. Vzhľad obsahu určuje globálna trieda `.prose` v `frontend/src/styles.scss`.
- Obrázky: inline „Obrázky“ pri návode → po uložení admin ukáže kód `<img src="/uploads/guides/...">` na skopírovanie do HTML. Súbor sa zmaže spolu s obrázkom/návodom.
- Web: `/navody/<kategória>` = zoznam (záložky kategórií), `/navody/<kategória>/<slug>` = článok. Všade **breadcrumbs** (Domov › Kategória › Článok), aj ako JSON-LD.
- Úvod (excerpt) pre zoznam a meta description = prvý odsek `<p>` obsahu.
- Obsah (návody, obrázky) žije v databáze. Medzi vývojovými PC sa prenáša cez git (sekcia **Synchronizácia databázy cez git**), na serveri je vo volumes `db_data` a `uploads`.

### Automaticky aktualizované návody (meta)
- Návody o commanderoch, výbave a eventoch sú **dáta v kóde**: `backend/guides/meta/commanders.py`, `equipment.py`, `events.py` (bloky → HTML cez `meta/render.py`). `manage.py sync_meta_guides` (beží v `entrypoint.sh` pri každom štarte, po `import_snapshot` a po pulle, ktorý zmení `guides/meta`) ich zapíše do DB.
- Sync mení **len návody s `auto_update=True`** a ukladá len skutočné zmeny (dátum „Aktualizované“ = reálna zmena). Ručne písané návody ani návod s rovnakým slugom, ktorý nie je auto, nikdy neprepíše. Auto návod vypadnutý z dát sa skryje, nezmaže.
- Ručná úprava nadpisu/obsahu auto návodu v admine vypne `auto_update` (inak by ho ďalšia aktualizácia prepísala). Zapnúť späť = zaškrtnúť políčko.
- Každý modul má `VERIFIED = 'RRRR-MM'` → v návodoch „Stav k októbru 2026“. Texty píšeme vlastnými slovami (SK aj CZ), fakty len z datovaných zdrojov uvedených pod návodom. LootBar blog je nespoľahlivý (vymýšľa predmety), rokboom.com neexistuje.
- **Mesačná aktualizácia:** workflow `.claude/workflows/kd-meta-update.js` (research agent na každý modul → kd-builder upraví moduly a zvýši `VERIFIED` → kd-critic overí každé tvrdenie oproti zdroju → push). Spúšťa ho naplánovaná úloha Claude desktop appky `kd1035-meta-update` (1. deň v mesiaci 18:00, beží len keď je appka otvorená, inak pri ďalšom spustení). Ručne: „spusti kd-meta-update“.
- Nový obsah generovaný Claudom patrí do `guides/meta`, nie do migrácií ani len do DB.

## Notifikácie
- **Discord** (nie e-mail, nie WhatsApp – WhatsApp Cloud API vyžaduje Meta Business účet a platí sa za správy). Webhook do kanála, voliteľne ping roly. Premenné `DISCORD_WEBHOOK_URL`, `DISCORD_EVENT_ROLE_ID`.
- Model `EventNotification` – plánovať (dátum a čas) smie **iba superuser** v admine. Posiela ich kontajner `worker` (`manage.py run_worker`, kontrola každých 30 s). Notifikácia zmeškaná o viac ako 6 h sa už neposiela.
- Opakované eventy = model **`KingdomEvent`** (admin „Eventy kráľovstva“, iba superuser): prvý začiatok, opakovanie každých N dní (0 = jednorazovo), voliteľne „do“ (vrátane celého dňa), pripomienky X minút pred začiatkom (1 deň, 3 h, 1 h, 30 min, 15 min, pri začiatku). Logika v `backend/kingdom/events.py`.
  - **UTC vs. lokálny čas:** `time_basis='utc'` = herný čas, termín sa drží v rovnakej UTC hodine (u nás sa pri zmene letného času posunie o hodinu); `'local'` = rovnaká hodina v Europe/Bratislava celý rok. Testy pokrývajú poslednú októbrovú nedeľu.
  - Worker každých 5 min volá `plan_reminders()`: vytvorí PENDING `EventNotification` pre každú pripomienku, ktorej čas odoslania je v najbližších **48 h**. Unikátny index (event, termín, offset) → žiadne duplikáty; existujúci riadok (aj zrušený či odoslaný) sa už nevytvorí znova.
  - Uloženie eventu v admine volá `replan()`: zmaže jeho budúce PENDING riadky a naplánuje nové. Ručné úpravy takých riadkov sa tým stratia; odoslané, chybné a zrušené ostanú. Jednu pripomienku zrušíš akciou „Zrušiť (neposielať)“ (stav Zrušená).
  - Bez `DISCORD_WEBHOOK_URL` sa nič neplánuje (admin ukáže varovanie). Správa má Discord časové značky `<t:UNIX:F>` / `<t:UNIX:R>` – každý vidí čas vo svojom pásme. Rola na ping: ID na notifikácii → ID na evente → `DISCORD_EVENT_ROLE_ID`.
  - **Produkčný webhook nikdy nedávaj do dev `.env`** – eventy putujú v snapshote na každé dev PC a ich worker by posielal tiež. Na skúšanie testovací kanál. Skutočné eventy zakladaj priamo v produkčnom admine (snapshot sa na server nedostane).
  - `show_on_web` a `guide` sú pripravené pre budúci kalendár eventov na webe. Nepravidelné eventy (fázy KvK a pod.) ostávajú ako jednorazové záznamy – nevymýšľame hernú rotáciu.

## Dáta a zálohy
- SQLite súbor a nahrané súbory sú v Docker named volumes `db_data` a `uploads`. Prežijú `docker compose up --build`, rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v` ani nemaž volumes** (zmaže databázu).
- `worker` robí zálohu každých `BACKUP_INTERVAL_DAYS` (7) dní do `BACKUP_PATH` (`./backups` na hoste), necháva `BACKUP_KEEP` (8) posledných. Používa SQLite backup API (bezpečné za behu).
- Ručne: `docker compose exec -u app worker python manage.py backup_db` / `restore_db <súbor>`. **Vždy s `-u app`** – ako root by vznikli súbory DB s iným vlastníkom a backend by nemohol zapisovať.
- Migrácie nikdy needituj spätne po nasadení na server. Zatiaľ nič nie je nasadené.

## Synchronizácia databázy cez git (vývoj)
- Celá dev databáza ide do gitu ako `backend/snapshot/db.sqlite3` (bez prihlasovacích session) a nahrané súbory ako `backend/media/` (v dev je to bind mount = živý MEDIA_ROOT). Repo je privátne, snapshot obsahuje aj hash hesla admina.
- Hooky v `.githooks/` (zapnúť raz na každom PC: `git config core.hooksPath .githooks`):
  - `pre-commit` → `export_snapshot` + `git add` snapshotu a `backend/media`. Ak sa dáta nezmenili, súbor ostane bajtovo rovnaký (žiadny šum v commitoch). Bez Dockera commit zlyhá; obísť: `git commit --no-verify`.
  - `post-merge` / `post-rewrite` (pull) → ak pull priniesol nový snapshot, `import_snapshot`: záloha starej DB do `./backups`, import, `migrate`, `ensure_superuser`.
  - Zmenil sa len obsah (žiadny súbor v gite): `sh .githooks/dbsync.sh push "správa"` = export + commit + push. Obyčajný `git commit` vtedy skončí „nothing to commit“ ešte pred hookom.
  - Ručne: `sh .githooks/dbsync.sh export [--force]` / `sh .githooks/dbsync.sh import`.
- Poistka: každé PC si pamätá, s ktorým snapshotom je jeho DB zosynchronizovaná (`/app/data/snapshot_base`). Export z DB, ktorá nenačítala novší snapshot z pullu, sa odmietne (inak by prepísal cudzie zmeny).
- Konflikt (obsah menený na dvoch PC naraz) sa nedá zlúčiť – binárny súbor. Vyber jednu verziu (`git checkout --theirs|--ours backend/snapshot/db.sqlite3`), načítaj ju (`dbsync.sh import`) a zmeny z druhej doplň ručne.
- Čerstvý clone: `entrypoint.sh` pri prázdnej DB načíta snapshot sám (`import_snapshot --if-empty`).
- Nový obsah, ktorý má ísť aj na server (napr. návody pripravené Claudom), patrí do **dátovej migrácie** (upsert podľa slugu), nie iba do snapshotu – snapshot sa na server nedostane (`backend/.dockerignore`) a server si drží vlastné dáta.

## Technológie
- **Frontend:** Angular 22 (standalone, signals, zoneless, `@if/@for`, `httpResource`), SCSS, `frontend/`.
- **Backend:** Django 6 + Django REST Framework, SQLite súbor, Django admin na správu obsahu, `backend/` (apps `kingdom`, `guides`).
- **Docker všade** – server aj lokálny vývoj. Nepredpokladaj lokálny Python ani Node, príkazy spúšťaj cez `docker compose`.
  - `docker-compose.yml` (produkcia): `backend` (gunicorn), `worker` (notifikácie + zálohy), `web` (nginx: prerendrované stránky + proxy `/api/`, `/admin/`, `/static/` na backend).
  - `docker-compose.dev.yml` (vývoj): `ng serve` s hot reloadom (port 4200, proxy `/api` → backend), Django `runserver` (port 8000), `worker`.
- Dynamické dáta idú z API `/api/alliances/`, `/api/links/`, `/api/guides/` (+ `/api/guides/<slug>/`). Frontend musí fungovať aj keď API zlyhá (sekcia sa skryje, nič sa nerozbije).
- URL: `/static/` = Django statika (admin), `/uploads/` = nahraté súbory (MEDIA_URL), `/media/` patrí Angular buildu (fonty).
- Ikony: SVG sprite `frontend/public/icons.svg` (Lucide + Simple Icons), použitie `<svg appIcon="swords" />`. Novú ikonu pridaj do `frontend/scripts/build-icons.mjs` a spusti `npm run icons`.
- Angular konvencie: súbory bez prípony `.component` (`hero.ts`, trieda `Hero`), `inject()`, `input()`, signals, `OnPush`.

## Bezpečnosť a konfigurácia
- Citlivé údaje (kľúče, heslá, tokeny, webhooky) **iba v `.env`**. Ten je v `.gitignore` a nikdy sa necommituje. Kontajner `web` dostane z `.env` len `SITE_URL`.
- Každú novú premennú pridaj aj do `.env.example` (s popisom, bez skutočnej hodnoty).
- `.env` na server nahráva používateľ ručne. Lokálny `.env` je len pre vývoj (`DJANGO_DEBUG=1`).

## Git
- Po každej dokončenej a overenej zmene rovno **commit + push** do `main` (github.com/Gether1996/kd_1035).
- Malé, zrozumiteľné commity s anglickou správou.
- Pred commitom musí bežať Docker (pre-commit hook exportuje databázu). Pred prácou s obsahom vždy najprv `git pull`.

## Príkazy
```bash
# vývoj (frontend http://localhost:4200, backend/admin http://localhost:8000/admin/)
docker compose -f docker-compose.dev.yml up --build

# produkcia (web na http://localhost:${WEB_PORT:-8080})
docker compose up -d --build

# npm / manage.py vo vývojovom kontajneri
docker compose -f docker-compose.dev.yml run --rm frontend npm <príkaz>
docker compose -f docker-compose.dev.yml run --rm backend python manage.py <príkaz>

# testy
docker compose -f docker-compose.dev.yml run --rm backend python manage.py test
docker compose -f docker-compose.dev.yml run --rm frontend npx ng test --watch=false

# screenshoty na viacerých rozlíšeniach (beží dev server) → tools/screenshots/out/
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble sh -c \
  "cd tools/screenshots && npm i --no-save playwright@1.63.0 >/dev/null && node shoot.mjs"

# pregenerovanie hero grafiky + og-image + ikon aplikácie
docker build -t kd1035-artgen tools/background
docker run --rm -v "$PWD:/work" kd1035-artgen --raster
```
