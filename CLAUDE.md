# KD 1035 – projektové pravidlá

Promo web pre kráľovstvo **1035** v hre Rise of Kingdoms (https://rok.lilith.com/) – jediné kráľovstvo v hre zložené výhradne zo slovenských a českých hráčov.

Tieto pravidlá platia pri **každej** úlohe v tomto repozitári. Každé nové dôležité rozhodnutie (konfigurácia, dizajn, architektúra, workflow) hneď zapíš sem. Detaily jednotlivých oblastí sú v `docs/` (`docs/eventy.md`, `docs/navody.md`, `docs/ucty.md`) – čítaj ich len pri práci na danej oblasti a ich detaily zapisuj tam; tu ostáva jadro a pravidlá, ktoré platia vždy (Gether 9. 10. 2026: šetríme tokeny, tento súbor sa načítava do každej konverzácie aj každého agenta).

## Automatizácia agentmi
- Web vylepšujú agenti v kolách (`kd-improve`) a návody sa mesačne aktualizujú (`kd-meta-update`). Plán, pravidlá a postup: `docs/agenti.md`, konfigurácia a stav kôl: `.claude/kd-agents.json`, čo je hotové a čo čaká: `docs/backlog.md`.
- Keď Gether povie „pokračuj“ (aj na inom PC), najprv si prečítaj tieto tri súbory a pokračuj podľa `next` v `.claude/kd-agents.json`.
- Opakované postupy sú skilly v `.claude/skills/` – `kd-verify` (testy + screenshoty), `kd-event-data` (zmena eventov), `kd-release` (nová verzia), `kd-review-branch` (vetva spolupracovníka); použi ich namiesto vymýšľania vlastných skriptov.

## Komunikácia
- S používateľom (Gether) komunikuj po slovensky.
- Kód, názvy v kóde a komentáre píš po anglicky. Texty na webe idú výhradne cez i18n (SK/CZ).

## Dizajn a UX
- **User friendly, ľahko čitateľné, čisté moderné UI.** Herný vzhľad v duchu Rise of Kingdoms: tmavá navy, zlatá, červený akcent, fonty Cinzel (nadpisy) + Barlow (text).
- **Iba tmavý štýl.** Žiadny light/dark prepínač, žiadne `prefers-color-scheme` varianty.
- Farby, fonty, rozostupy a easing sú CSS premenné v `frontend/src/styles.scss` (`:root`). Nové farby nepridávaj natvrdo do komponentov (výnimka: farby značiek Discord/Facebook).
- Hero pozadie = vrstvené SVG (`frontend/public/img/hero/*.svg`) generované skriptom `tools/background/generate.py`. Pri úprave grafiky meň skript, nie SVG ručne (príkaz nižšie). Kompozícia: nadpis hore na oblohe, hrad v strede, CTA dole.
- Zvyšok webu: **nočná krajina** (`frontend/public/img/scenery/{far,near}.svg`, ten istý skript) – hero je súmrak, ostatok noc. Veľmi tmavé siluety s minimálnym kontrastom, vzdialená strážna veža vpravo (mimo textového stĺpca), borovice po krajoch. V `app.ts` je `sticky` pri spodku viewportu za obsahom a na konci stránky dosadne nad pätičku; pri scrollovaní sa jemne dvíha (`appScrollFx="page"`). Má byť nenápadná – nezvyšuj kontrast ani nepridávaj prvky, ktoré by ťahali pozornosť. Sekcie s vlastnou krajinou (Komunita) ju zakryjú.
- **Žiadny balast textu.** Krátke nadpisy, max. 1–2 vety na blok. Radšej vynechať ako nafúknuť. Výnimka: stránka **O nás** je SEO stránka s dlhším, ale štruktúrovaným textom (nadpisy, zoznamy). FAQ sekciu používateľ nechce.
- **Nesmie to vyzerať ako AI slop:** žiadne generické gradientové fľaky, emoji namiesto ikon, prázdne marketingové frázy ani glow efekty všade. Grafika je ručne navrhnutá (SVG) a drží jednu paletu a jeden štýl.
- **Plynulé pohyby:** parallax pozadia (`appScrollFx` → CSS `--progress`), posúvaný text pri scrollovaní, scroll reveal (`appReveal`), jemné hover stavy. Animuj len `transform`/`translate` a `opacity`. Vždy rešpektuj `prefers-reduced-motion`.
- **Výkon animácií** (Gether 8. 10. 2026: „sekajú, lagujú“): žiadny `backdrop-filter` (hlavička, karty), žiadne nekonečné animácie, ktoré prekresľujú (`background-position`, `filter`, `letter-spacing` – napr. lesk na „1035“), žiadny parallax podľa myši. Callback `Scroll.onFrame` iba číta layout a vráti funkciu, ktorá zapisuje štýly – všetky čítania snímky idú pred zápismi.
- **Scroll pri navigácii** (`app.ts`): nová stránka → hore, prepnutie jazyka → ostane na mieste, odkaz na sekciu (`/#alliance`) → sekcia pod hlavičkou, **späť/dopredu v prehliadači** → tam, kde návštevník stránku opustil. `history.scrollRestoration` je `manual` a pozíciu obnovuje `App` z udalosti routera `Scroll` – prehliadač by ju obnovil ešte na predošlej stránke a zastavil by sa na jej výške (dopredu z `/o-nas` na `/#alliance` skončil nad sekciou). Na obsah z API (návod) čaká max. 2 s, scroll alebo klik návštevníka obnovu preruší. Odkaz na sekciu ostane na sekcii, aj keď sa nad ňou neskôr zobrazí obsah z API (Najbližšie eventy na úvode ju posúvali o celú sekciu): `follow()` v `app.ts` ju 2,5 s po skoku dorovná pri každej zmene výšky `<main>`, scroll alebo klik to preruší (Gether 9. 10. 2026).
- **100 % responzívne** – mobil od 320 px, landscape mobil, tablet, notebook, desktop, ultrawide. Každú vizuálnu zmenu over screenshotmi (`tools/screenshots/shoot.sh`, skill `kd-verify`) minimálne na 360, 768, 1280, 1920 a 2560.
- Prístupnosť: dostatočný kontrast, viditeľný focus, `alt`/`aria-label`, ovládanie klávesnicou.
- Spoločné štýly formulárov (`.field`, `.input`, `.select`, `.choice`, `.chips`/`.chip`, `.segmented`, `.switch`, tokeny `--field-*`), tlačidlá `.pill-btn` (+ `--quiet`) a `.danger` a rám dialógu `.modal` (`.modal__head`, `__title`, `__close`…, na mobile spodný panel) sú v `styles.scss` – nové formuláre a dialógy ich používajú.

## Jazyky SK / CZ a SEO
- Každý jazyk má vlastné URL s rovnakými slugmi: SK v koreni (`/`, `/o-nas`, `/navody`, `/navody/vybava`, `/navody/vybava/<slug>`), CZ pod `/cz` (`/cz/...`). Jazyk sa určuje z URL; odkazy skladaj cez `I18n.path()`, `I18n.guidePath()`, prepínač jazyka cez `I18n.switchPath()` (iba cesta – canonical, hreflang a login `next` sú bez query; prepínač a presmerovanie na zapamätaný jazyk k nej pridajú query aj `#sekciu`, aby zdieľané `?event=`/`?commander=` prežili). Nové stránky pridávaj do `app.routes.ts` (funkcia `pages()`), `parseUrl`/`Page` v `i18n.ts`, `app.routes.server.ts` a do `STATIC_PAGES` v `backend/guides/views.py` (sitemap).
- Každý text v oboch jazykoch: `frontend/src/app/core/i18n/sk.ts` a `cs.ts` (typ `Dict` + test stráži rovnakú štruktúru). Žiadne natvrdo písané texty v šablónach (okrem vlastných mien: Kingdom 1035, Rise of Kingdoms, Discord…).
- Stránky sú **prerendrované** (Angular SSG, `outputMode: static`) → statické HTML pre Google. Výnimka: detail návodu (`navody/:category/:slug`) sa renderuje v prehliadači (`RenderMode.Client`, nginx vráti `index.csr.html`). Kód musí byť SSR-safe: `window`, `localStorage`, `matchMedia` len v prehliadači (`isPlatformBrowser`, `afterNextRender`). API sa volá iba v prehliadači.
- **Stránka 404** (`pages/not-found/`, texty `notFound`): neznáma adresa ostane v URL a ukáže 404 v jazyku URL (`/xyz` SK, `/cz/xyz` CZ), žiadne presmerovanie domov. Wildcard `**` je posledná route v koreni aj medzi deťmi `cz`, neprerendruje sa – nginx vráti `index.csr.html` so stavom 404. Neexistujúci návod a neznáma kategória ukážu tie isté tlačidlá Domov + Návody (`app-not-found-links`) a `notFoundMeta()` (`shared/not-found.ts`).
- **Náhľady odkazov na návody** (Discord, Facebook…): boti náhľadov nespúšťajú JS a detail návodu je len shell, preto ich nginx (`map $kd_link_bot` v `frontend/nginx/default.conf.template`, Discordbot, facebookexternalhit, Twitterbot, Slackbot, Telegram, WhatsApp…) prepíše na `/api/link-preview/<cesta>` → Django (`guides.views.link_preview`) vráti HTML s og:title/description/image návodu (CZ pod `/cz`, `X-Robots-Tag: noindex`, neznámy/skrytý návod = 404 so všeobecnými meta = `SITE_META`, kópia `seo.home` z i18n). Vyhľadávače (Googlebot, Bingbot, Applebot) tam zámerne nie sú – JS renderujú samy. Odkaz na event v kalendári (`/kalendar?event=<id>&on=<deň>`) dostane botom náhľad s názvom a termínom eventu (`map $kd_event_preview` → `/api/link-preview/[cz/]kalendar` → `kingdom/preview.py`, detail `docs/eventy.md`). Šablóna `backend/templates/link_preview.html` a hlavičky (`preview_page()` v `guides/views.py`) sú spoločné.
- `Seo` služba nastavuje title, description, canonical, hreflang (sk, cs, x-default), Open Graph a JSON-LD (WebSite, Organization, BreadcrumbList). Stránky s obsahom z DB volajú `seo.set({title, description, breadcrumbs})`. Stránka s `noindex` (404, neexistujúci návod, `/ucet`) nemá canonical ani hreflang – `Seo` ich zmaže a ďalšia indexovaná stránka ich vytvorí znova. `sitemap.xml` generuje Django (`/sitemap.xml`) vrátane všetkých zverejnených návodov. Prerendrované HTML má placeholder `__SITE_ORIGIN__`, ktorý nginx nahradí `SITE_URL` z `.env`.
- Kľúčové slová prirodzene v texte (bez spamovania): ROK KD CZ SK, slovenské KD, české KD, slovenské/české kráľovstvo v Rise of Kingdoms, KD 1035.
- Obsah z databázy (návody a pod.) bude mať polia pre SK aj CZ.
- Dbaj na pravopis a diakritiku (SK: ä, ô, ľ, ĺ, ŕ; CZ: ř, ů, ě).
- Herné pojmy neprekladáme, píšeme ich tak, ako ich hráči používajú: **rally, garrison** (nikdy „garnizóna“), combo, skill, rage… (pokyn Gethera 8. 10. 2026).

## Obsah
- Návody majú kategórie Commanderi, Výbava, Eventy a **Tipy a triky** (`tipy`, Gether 10. 10. 2026). Plánované: ďalšie kontakty na R4.
- **Rise of Kingdoms / Lilith nemá verejné API** (ani na hráčov, ani na kráľovstvá). Na webe preto **nezobrazujeme meniace sa čísla** (sila, počet členov, územie…), lebo by zastarali. Len stabilné údaje zadané v admine.
- Kráľovstvo má **vždy len jednu alianciu**: [CS35] CZ/SK Legends (admin ďalšiu pridať ani túto zmazať nedovolí, zoznam rovno otvorí jej úpravu). Vedenie (model `Officer`): Methiu von CzF – Vodca, Gether – R4, Hefarion – R4 (Discord ID všetkých troch v seed migrácii). Tlačidlo „Kontaktovať“ otvorí `discord.com/users/<ID>`, bez ID skopíruje Discord meno. Voliteľné „na čo sa obrátiť“ (`focus_sk`/`focus_cs`, CZ prázdne = SK) je tichý riadok pod menom, prázdne = nezobrazí sa; text vypĺňa Gether v admine, nevymýšľame ho. Komunita na úvode odkazuje na kroky migrácie `/o-nas#migracia`.
- Odkazy (admin → Odkazy): Facebook skupina https://www.facebook.com/groups/550189483954751, Discord trvalá pozvánka https://discord.gg/NhwP6y9ssM (nikdy nevyprší, neobmedzené použitia; obe v seed migrácii 0002).
- Fotky a texty dodá používateľ. Dovtedy len krátke placeholdery – **žiadne vymyslené fakty** o kráľovstve.
- Nepoužívaj oficiálne assety Lilith Games (logá, artworky) bez súhlasu používateľa. Výnimky so súhlasom Gethera (8. 10. 2026): ikony predmetov a portréty commanderov v návodoch (`docs/navody.md`) a ikony eventov (`docs/eventy.md`). Neskôr v ten istý deň aj tagy špecializácií commanderov v zozname návodov (sekcia Návody, PR #2).
- Pätička: malý watermark „Vytvoril Gether v spolupráci s TTakedaSVK · 2026“ (CZ „Vytvořil … ve spolupráci s …“; spolupracovník podľa Gethera 9. 10. 2026) + 1–2 vety, že ide o neoficiálnu fanúšikovskú stránku hráčov KD 1035 bez prepojenia s Lilith Games (Rise of Kingdoms a herné grafiky sú ich majetok), pod nimi malé odkazy na Podmienky používania a Ochranu údajov a verzia webu (zoznam `.footer__links`, sekcia **Verzia webu**).
- **Podmienky používania** (`/podmienky`, `/cz/podmienky`, `pages/terms/`, texty `termsPage` v i18n): neoficiálna nekomerčná stránka, žiadne prepojenie s Lilith Games, ochranné známky a grafika (odstránime na žiadosť majiteľa práv), návody bez záruky, externé odkazy, kontakt cez vedenie na Discorde, „Platné od“ (dátum v `terms.ts`). Krátke vecné bloky, žiadne právne tvrdenia, ktoré nevieme doložiť. Pri zmene textu posuň dátum platnosti.
- **Ochrana údajov** (`/ochrana-udajov`, `/cz/ochrana-udajov`, `pages/privacy/`, texty `privacyPage` v i18n, štýl spolu s Podmienkami v `shared/legal-page.scss`): kto web prevádzkuje (Gether, R4, kontakt cez Discord), čo ukladáme bez prihlásenia (cookie `csrftoken`, `kd1035.lang`) a po prihlásení (Discord ID, mená, avatar, meno v hre, registrácia a posledné prihlásenie, cookie `sessionid`, pripomienky, 30-dňový záznam odoslaných), kto to vidí, tretie strany, ako dlho, zmazanie účtu, úrad na ochranu údajov. Odkaz v pätičke, na `/ucet` a `/pripomienky` („Čo o tebe ukladáme“). Iba fakty, žiadne právne závery („v súlade s GDPR“, právne základy).
  - **Stránka musí sedieť s kódom:** každé nové pole s osobnými údajmi, nová cookie, tretia strana alebo zmena doby uchovania → uprav `privacyPage` v `sk.ts` aj `cs.ts` a posuň „Platné od“ v `privacy.ts`. Platí aj pre `BACKUP_KEEP` × `BACKUP_INTERVAL_DAYS` (na stránke „do 8 týždňov“) a limit logov (3 × 10 MB).

## Návody (CMS)
- Návody spravuje **iba superuser** v Django admine. HTML čistí **nh3** (`backend/guides/sanitize.py`), frontend ho vkladá cez `bypassSecurityTrustHtml`, vzhľad určuje `.prose` v `styles.scss`.
- Automaticky aktualizované návody (commanderi, výbava, eventy) sú **dáta v kóde** `backend/guides/meta/*.py`; `sync_meta_guides` ich zapisuje do DB, mení iba `auto_update=True`. Nový obsah od Clauda patrí do `guides/meta`, fakty len z datovaných zdrojov uvedených pod návodom. Páry commanderov idú podľa **WarDaddyChadského** (prepisy videí cez `tools/youtube/transcripts.py`), mesačne ich obnovuje workflow `kd-meta-update`.
- **Pred prácou na návodoch, meta moduloch, ikonách alebo mesačnej aktualizácii prečítaj [`docs/navody.md`](docs/navody.md).**

## Hráčske účty (prihlásenie cez Discord)
- Prihlásenie **iba cez Discord** (OAuth2, scope len `identify`), kód `backend/accounts/`, stránky `/ucet` a `/pripomienky`. Session cookie ostáva **SameSite=Lax**, DRF iba `SessionAuthentication` + CSRF.
- **Osobné údaje hráčov nikdy do gitu** (`export_snapshot` maže `accounts_*` aj používateľov `discord_*`; nové osobné dáta patria do appky `accounts`). Každá zmena osobných údajov = uprav stránku Ochrana údajov (sekcia Obsah).
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_ADMIN_IDS` iba v `.env`; na produkciu až po nasadení stránky Ochrana údajov.
- **Pred prácou na prihlásení, `/ucet`, mene v hre, superadminovi alebo osobných údajoch hráčov prečítaj [`docs/ucty.md`](docs/ucty.md).**

## Eventy, kalendár a notifikácie
- Eventy (`KingdomEvent`) a notifikácie zakladá **iba superuser** (admin alebo správa eventov priamo v `/kalendar`), posiela ich kontajner `worker`. Všetko ide **iba cez Discord**: webhook do kanála a osobné pripomienky súkromnou správou bota – **web push je zrušený**, späť ho nepridávaj bez Getherovho pokynu.
- **Produkčný webhook nikdy nedávaj do dev `.env`** (eventy putujú v snapshote na každé dev PC).
- Nepravidelné eventy (`irregular`) nemajú cyklus, termín nastavuje Gether. Herné eventy začínajú o 00:00 UTC, čas začiatku sa na webe ukazuje len pri krátkych nepravidelných eventoch.
- **Pred prácou na eventoch, kalendári, notifikáciách, pripomienkach hráčov alebo ikonách eventov prečítaj [`docs/eventy.md`](docs/eventy.md).**

## Dáta a zálohy
- SQLite súbor a nahrané súbory sú v Docker named volumes `db_data` a `uploads`. Prežijú `docker compose up --build`, rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v` ani nemaž volumes** (zmaže databázu).
- `worker` robí zálohu každých `BACKUP_INTERVAL_DAYS` (7) dní do `BACKUP_PATH` (`./backups` na hoste), necháva `BACKUP_KEEP` (8) posledných. Používa SQLite backup API (bezpečné za behu). Raz denne maže expirované session (`clearsessions`), aby v DB ani zálohách neostávali stopy po prihláseniach. Kópie záloh mimo servera tiež maž po 8 týždňoch (sľub na stránke Ochrana údajov).
- **Stav workera** (9. 10. 2026): worker každý tik prepíše `/app/data/worker_status.json` (`WORKER_STATUS_PATH`, posledný tik + posledná záloha; atomicky, chyba zápisu worker nezastaví). Je to súbor, nie riadok v DB, aby sa snapshot v gite nemenil každých 30 s – do `export_snapshot` nikdy nepatrí. Číta ho panel **Prehľad** na úvode adminu (detail `docs/eventy.md`). Worker musí mať `/app/data` z toho istého volume ako backend (produkcia `db_data`, dev `backend_data`).
- **Logy bez IP:** nginx v kontajneri `web` píše prístupový log vo formáte `kd_noip` (bez `$remote_addr`, v oboch `server` blokoch) a `log_not_found off`; gunicorn vidí iba adresu kontajnera `web`. Každá služba v oboch compose súboroch má `logging: *logging` (json-file, 3 × 10 MB). HTTPS proxy na serveri (Caddy) nesmie mať zapnutý prístupový log (`log`) – stránka Ochrana údajov sľubuje, že IP neukladáme. Nová služba v compose = aj `logging: *logging`.
- Ručne: `docker compose exec -u app worker python manage.py backup_db` / `restore_db <súbor>`. **Vždy s `-u app`** – ako root by vznikli súbory DB s iným vlastníkom a backend by nemohol zapisovať.
- Migrácie nikdy needituj spätne po nasadení na server. Zatiaľ nič nie je nasadené.

## Synchronizácia databázy cez git (vývoj)
- Celá dev databáza ide do gitu ako `backend/snapshot/db.sqlite3` (bez prihlasovacích session a bez hráčov z Discordu) a nahrané súbory ako `backend/media/` (v dev je to bind mount = živý MEDIA_ROOT). Repo je privátne, snapshot obsahuje aj hash hesla admina.
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
- **Backend:** Django 6 + Django REST Framework, SQLite súbor, Django admin na správu obsahu, `backend/` (apps `kingdom`, `guides`, `accounts`).
  - Testy: `TransactionTestCase` po sebe vyprázdni DB (aj dáta zo seed migrácií) → každý z nich má `serialized_rollback = True`, žiadne `get_or_create` obchádzky.
- **Docker všade** – server aj lokálny vývoj. Nepredpokladaj lokálny Python ani Node, príkazy spúšťaj cez `docker compose`.
  - `docker-compose.yml` (produkcia): `backend` (gunicorn), `worker` (notifikácie + zálohy), `web` (nginx: prerendrované stránky + proxy `/api/`, `/admin/`, `/static/` na backend).
  - `docker-compose.dev.yml` (vývoj): `ng serve` s hot reloadom (port 4200, proxy `/api` → backend), Django `runserver` (port 8000), `worker`.
- Dynamické dáta idú z API `/api/alliances/`, `/api/links/`, `/api/guides/` (+ `/api/guides/<slug>/`), kalendár z `/api/events/` (odber do kalendára v mobile `/api/calendar.ics`, `docs/eventy.md`), prihlásený hráč z `/api/auth/me/`, jeho pripomienky z `/api/me/reminders/`. Frontend musí fungovať aj keď API zlyhá (sekcia sa skryje, nič sa nerozbije).
- URL: `/static/` = Django statika (admin), `/uploads/` = nahraté súbory (MEDIA_URL), `/media/` patrí Angular buildu (fonty).
- Ikony: SVG sprite `frontend/public/icons.svg` (Lucide + Simple Icons), použitie `<svg appIcon="swords" />`. Novú ikonu pridaj do `frontend/scripts/build-icons.mjs` a spusti `npm run icons`.
- Angular konvencie: súbory bez prípony `.component` (`hero.ts`, trieda `Hero`), `inject()`, `input()`, signals, `OnPush`.

## Bezpečnosť a konfigurácia
- Citlivé údaje (kľúče, heslá, tokeny, webhooky) **iba v `.env`**. Ten je v `.gitignore` a nikdy sa necommituje. Kontajner `web` dostane z `.env` len `SITE_URL`.
- Každú novú premennú pridaj aj do `.env.example` (s popisom, bez skutočnej hodnoty).
- `.env` na server nahráva používateľ ručne. Lokálny `.env` je len pre vývoj (`DJANGO_DEBUG=1`).
- Produkčná doména **kd1035.eu** (`SITE_URL=https://kd1035.eu`), kanonická adresa bez `www` – `www.kd1035.eu` presmeruje nginx v kontajneri `web` (301). HTTPS rieši reverse proxy na serveri (napr. Caddy) a musí posielať `X-Forwarded-Proto`. Server, DNS a proxy nastavuje Gether sám (README → Doména kd1035.eu).
- Web na serveri počúva na porte **9005** (`WEB_PORT`, predvolený aj v `docker-compose.yml`; Gether 8. 10. 2026).
- Hotový produkčný `.env` je na Getherovom PC ako `.env.production` (git-ignored, vlastný `DJANGO_SECRET_KEY`, heslo admina, Discord aplikácia rovnaká ako vo vývoji); na server ho nahráva ručne ako `.env`. Dev `.env` ostáva vývojový.
- Nasadenie = `git pull && docker compose up -d --build`. **Prvý štart s novou databázou** (`entrypoint.sh`: súbor DB ešte neexistoval) po migráciách a `sync_meta_guides` spustí `seed_initial_events` → eventy z `backend/kingdom/initial_events.json` (stav dev DB k 8. 10. 2026, návody prepojené podľa slugu, existujúci názov neprepíše). Neskôr sa už nespúšťa – eventy na serveri žijú v produkčnom admine.

## Verzia webu
- Pätička ukazuje verziu webu (`v1.0.0`) hneď za odkazmi na Podmienky používania a Ochranu údajov (Gether 9. 10. 2026). Číslo je na jednom mieste: `SITE_VERSION` v `frontend/src/app/core/version.ts`, rovnaké musí byť `version` v `frontend/package.json`.
- Formát **MAJOR.MINOR.PATCH**, začali sme na **1.0.0** (9. 10. 2026). Pravidlo (Gether 9. 10. 2026: „malé zmeny na koniec, väčšie do stredu, prvé číslo poviem ja“):
  - **PATCH** (1.0.0 → 1.0.1) – malá zmena správania alebo vzhľadu, ktorú hráč pocíti: oprava chyby, úprava zobrazenia (napr. čas pri eventoch), drobné vylepšenie ovládania.
  - **MINOR** (1.0.5 → 1.1.0, PATCH sa vynuluje) – väčšia zmena: nová stránka, sekcia alebo funkcia, prerobená časť webu, zmena fungovania pre hráčov (napr. pripomienky iba cez Discord).
  - **MAJOR** (2.0.0) – **iba keď to Gether povie.** Sám ho nikdy nezvyšuj.
  - Verziu **nemení**: drobnosti v texte (doplnené meno či nick, preklep, formulácia – Gether 9. 10. 2026: „takéto maličké veci nedávaj ako novú verziu“), obsah (návody, eventy, mesačná meta aktualizácia, snapshot DB), dokumentácia, testy, nástroje, agenti a iné zmeny bez dopadu na web.
  - Jedna úloha = jedno zvýšenie, aj keď má viac commitov (zvýš v poslednom). Pri pochybnosti PATCH.
  - Čísla nemajú limit a píšu sa bez úvodných núl: po 1.0.9 ide 1.0.10, potom 1.0.11… (nie 1.0.00 – npm takú verziu neprijme; Gether 9. 10. 2026 súhlasil).
- Pri zvýšení: zmeň obe miesta, správa commitu začína `Release v1.0.1:` alebo verziu spomenie, commit označ tagom `v<verzia>` a tag pushni **vždy v tom istom pushi** ako commit (`git tag v1.0.1 && git push origin main v1.0.1`; Gether 9. 10. 2026: „nové verzie taguj do pushov“). Do `docs/backlog.md` pri položke dopíš verziu. Gethera stačí informovať, na akú verziu si to zvýšil.

## Git
- Po každej dokončenej a overenej zmene rovno **commit + push** do `main` (github.com/Gether1996/kd_1035).
- Malé, zrozumiteľné commity s anglickou správou.
- Pred commitom musí bežať Docker (pre-commit hook exportuje databázu). Pred prácou s obsahom vždy najprv `git pull`.

## Príkazy
```bash
# vývoj (frontend http://localhost:4200, backend/admin http://localhost:8000/admin/)
docker compose -f docker-compose.dev.yml up --build

# produkcia (web na http://localhost:${WEB_PORT:-9005})
docker compose up -d --build

# npm / manage.py vo vývojovom kontajneri
docker compose -f docker-compose.dev.yml run --rm frontend npm <príkaz>
docker compose -f docker-compose.dev.yml run --rm backend python manage.py <príkaz>

# testy + produkčný build bez bind mountu (Docker Desktop na Windows pri ňom padá), vypíše len súhrn alebo chyby;
# --ref <vetva> otestuje kód z gitu namiesto pracovného adresára
tools/test.sh [--ref <commit>] [backend [label…] | frontend [args…] | build | all]

# screenshoty na viacerých rozlíšeniach (beží dev server) → tools/screenshots/out/; premenné v shoot.mjs
tools/screenshots/shoot.sh [--player | --superuser] [PAGES=/,/cz/kalendar] [SIZES=…] [SELECTOR=…] [MEASURE=…]

# pregenerovanie hero grafiky + og-image + ikon aplikácie
docker build -t kd1035-artgen tools/background
docker run --rm -v "$PWD:/work" kd1035-artgen --raster
# banner (1500×600) a avatar (1024×1024) pre Discord bota / aplikáciu → tools/background/discord/
docker run --rm -v "$PWD:/work" kd1035-artgen --discord
```
