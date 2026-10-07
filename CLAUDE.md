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
- **Žiadny balast textu.** Krátke nadpisy, max. 1–2 vety na blok. Radšej vynechať ako nafúknuť. Výnimka: stránka **O nás** je SEO stránka s dlhším, ale štruktúrovaným textom (nadpisy, zoznamy, FAQ).
- **Nesmie to vyzerať ako AI slop:** žiadne generické gradientové fľaky, emoji namiesto ikon, prázdne marketingové frázy ani glow efekty všade. Grafika je ručne navrhnutá (SVG) a drží jednu paletu a jeden štýl.
- **Plynulé pohyby:** parallax pozadia (`appScrollFx` → CSS `--progress`), posúvaný text pri scrollovaní, scroll reveal (`appReveal`), jemné hover stavy. Animuj len `transform`/`translate` a `opacity`. Vždy rešpektuj `prefers-reduced-motion`.
- **100 % responzívne** – mobil od 320 px, landscape mobil, tablet, notebook, desktop, ultrawide. Každú vizuálnu zmenu over screenshotmi (`tools/screenshots/shoot.mjs`) minimálne na 360, 768, 1280, 1920 a 2560.
- Prístupnosť: dostatočný kontrast, viditeľný focus, `alt`/`aria-label`, ovládanie klávesnicou.

## Jazyky SK / CZ a SEO
- Každý jazyk má vlastné URL: SK v koreni (`/`, `/o-nas`), CZ pod `/cz` (`/cz`, `/cz/o-nas`). Jazyk sa určuje z URL (`I18n.path(page, lang)`), prepínač SK/CZ sú odkazy na tú istú stránku v druhom jazyku. Nové stránky pridávaj do `app.routes.ts` (funkcia `pages()`), typu `Page` v `i18n.ts`, do `seo` v slovníkoch a do `public/sitemap.xml`.
- Každý text v oboch jazykoch: `frontend/src/app/core/i18n/sk.ts` a `cs.ts` (typ `Dict` + test stráži rovnakú štruktúru). Žiadne natvrdo písané texty v šablónach (okrem vlastných mien: Kingdom 1035, Rise of Kingdoms, Discord…).
- Stránky sú **prerendrované** (Angular SSG, `outputMode: static`) → statické HTML pre Google. Kód musí byť SSR-safe: `window`, `localStorage`, `matchMedia` len v prehliadači (`isPlatformBrowser`, `afterNextRender`). API sa volá iba v prehliadači.
- `Seo` služba nastavuje title, description, canonical, hreflang (sk, cs, x-default), Open Graph a JSON-LD (WebSite, Organization, FAQPage). Prerendrované HTML má placeholder `__SITE_ORIGIN__`, ktorý nginx nahradí `SITE_URL` z `.env`.
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

## Notifikácie
- **Discord** (nie e-mail, nie WhatsApp – WhatsApp Cloud API vyžaduje Meta Business účet a platí sa za správy). Webhook do kanála, voliteľne ping roly. Premenné `DISCORD_WEBHOOK_URL`, `DISCORD_EVENT_ROLE_ID`.
- Model `EventNotification` – plánovať (dátum a čas) smie **iba superuser** v admine. Posiela ich kontajner `worker` (`manage.py run_worker`, kontrola každých 30 s). Notifikácia zmeškaná o viac ako 6 h sa už neposiela.

## Dáta a zálohy
- SQLite súbor a nahrané súbory sú v Docker named volumes `db_data` a `uploads`. Prežijú `docker compose up --build`, rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v` ani nemaž volumes** (zmaže databázu).
- `worker` robí zálohu každých `BACKUP_INTERVAL_DAYS` (7) dní do `BACKUP_PATH` (`./backups` na hoste), necháva `BACKUP_KEEP` (8) posledných. Používa SQLite backup API (bezpečné za behu).
- Ručne: `docker compose exec -u app worker python manage.py backup_db` / `restore_db <súbor>`. **Vždy s `-u app`** – ako root by vznikli súbory DB s iným vlastníkom a backend by nemohol zapisovať.
- Migrácie nikdy needituj spätne po nasadení na server. Zatiaľ nič nie je nasadené.

## Technológie
- **Frontend:** Angular 22 (standalone, signals, zoneless, `@if/@for`, `httpResource`), SCSS, `frontend/`.
- **Backend:** Django 6 + Django REST Framework, SQLite súbor, Django admin na správu obsahu, `backend/` (app `kingdom`).
- **Docker všade** – server aj lokálny vývoj. Nepredpokladaj lokálny Python ani Node, príkazy spúšťaj cez `docker compose`.
  - `docker-compose.yml` (produkcia): `backend` (gunicorn), `worker` (notifikácie + zálohy), `web` (nginx: prerendrované stránky + proxy `/api/`, `/admin/`, `/static/` na backend).
  - `docker-compose.dev.yml` (vývoj): `ng serve` s hot reloadom (port 4200, proxy `/api` → backend), Django `runserver` (port 8000), `worker`.
- Dynamické dáta idú z API `/api/alliances/` a `/api/links/`. Frontend musí fungovať aj keď API zlyhá (sekcia sa skryje, nič sa nerozbije).
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
