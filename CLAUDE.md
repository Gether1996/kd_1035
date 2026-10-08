# KD 1035 – projektové pravidlá

Promo web pre kráľovstvo **1035** v hre Rise of Kingdoms (https://rok.lilith.com/) – jediné kráľovstvo v hre zložené výhradne zo slovenských a českých hráčov.

Tieto pravidlá platia pri **každej** úlohe v tomto repozitári. Každé nové dôležité rozhodnutie (konfigurácia, dizajn, architektúra, workflow) hneď zapíš sem.

## Automatizácia agentmi
- Web vylepšujú agenti v kolách (`kd-improve`) a návody sa mesačne aktualizujú (`kd-meta-update`). Plán, pravidlá a postup: `docs/agenti.md`, konfigurácia a stav kôl: `.claude/kd-agents.json`, čo je hotové a čo čaká: `docs/backlog.md`.
- Keď Gether povie „pokračuj“ (aj na inom PC), najprv si prečítaj tieto tri súbory a pokračuj podľa `next` v `.claude/kd-agents.json`.

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
- **100 % responzívne** – mobil od 320 px, landscape mobil, tablet, notebook, desktop, ultrawide. Každú vizuálnu zmenu over screenshotmi (`tools/screenshots/shoot.mjs`) minimálne na 360, 768, 1280, 1920 a 2560.
- Prístupnosť: dostatočný kontrast, viditeľný focus, `alt`/`aria-label`, ovládanie klávesnicou.

## Jazyky SK / CZ a SEO
- Každý jazyk má vlastné URL s rovnakými slugmi: SK v koreni (`/`, `/o-nas`, `/navody/vybava`, `/navody/vybava/<slug>`), CZ pod `/cz` (`/cz/...`). Jazyk sa určuje z URL; odkazy skladaj cez `I18n.path()`, `I18n.guidePath()`, prepínač jazyka cez `I18n.switchPath()`. Nové stránky pridávaj do `app.routes.ts` (funkcia `pages()`), `parseUrl`/`Page` v `i18n.ts`, `app.routes.server.ts` a do `STATIC_PAGES` v `backend/guides/views.py` (sitemap).
- Každý text v oboch jazykoch: `frontend/src/app/core/i18n/sk.ts` a `cs.ts` (typ `Dict` + test stráži rovnakú štruktúru). Žiadne natvrdo písané texty v šablónach (okrem vlastných mien: Kingdom 1035, Rise of Kingdoms, Discord…).
- Stránky sú **prerendrované** (Angular SSG, `outputMode: static`) → statické HTML pre Google. Výnimka: detail návodu (`navody/:category/:slug`) sa renderuje v prehliadači (`RenderMode.Client`, nginx vráti `index.csr.html`). Kód musí byť SSR-safe: `window`, `localStorage`, `matchMedia` len v prehliadači (`isPlatformBrowser`, `afterNextRender`). API sa volá iba v prehliadači.
- **Stránka 404** (`pages/not-found/`, texty `notFound`): neznáma adresa ostane v URL a ukáže 404 v jazyku URL (`/xyz` SK, `/cz/xyz` CZ), žiadne presmerovanie domov. Wildcard `**` je posledná route v koreni aj medzi deťmi `cz`, neprerendruje sa – nginx vráti `index.csr.html` so stavom 404. Neexistujúci návod a neznáma kategória ukážu tie isté tlačidlá Domov + Návody (`app-not-found-links`) a `notFoundMeta()` (`shared/not-found.ts`).
- **Náhľady odkazov na návody** (Discord, Facebook…): boti náhľadov nespúšťajú JS a detail návodu je len shell, preto ich nginx (`map $kd_link_bot` v `frontend/nginx/default.conf.template`, Discordbot, facebookexternalhit, Twitterbot, Slackbot, Telegram, WhatsApp…) prepíše na `/api/link-preview/<cesta>` → Django (`guides.views.link_preview`) vráti HTML s og:title/description/image návodu (CZ pod `/cz`, `X-Robots-Tag: noindex`, neznámy/skrytý návod = 404 so všeobecnými meta = `SITE_META`, kópia `seo.home` z i18n). Vyhľadávače (Googlebot, Bingbot, Applebot) tam zámerne nie sú – JS renderujú samy.
- `Seo` služba nastavuje title, description, canonical, hreflang (sk, cs, x-default), Open Graph a JSON-LD (WebSite, Organization, BreadcrumbList). Stránky s obsahom z DB volajú `seo.set({title, description, breadcrumbs})`. Stránka s `noindex` (404, neexistujúci návod, `/ucet`) nemá canonical ani hreflang – `Seo` ich zmaže a ďalšia indexovaná stránka ich vytvorí znova. `sitemap.xml` generuje Django (`/sitemap.xml`) vrátane všetkých zverejnených návodov. Prerendrované HTML má placeholder `__SITE_ORIGIN__`, ktorý nginx nahradí `SITE_URL` z `.env`.
- Kľúčové slová prirodzene v texte (bez spamovania): ROK KD CZ SK, slovenské KD, české KD, slovenské/české kráľovstvo v Rise of Kingdoms, KD 1035.
- Obsah z databázy (návody a pod.) bude mať polia pre SK aj CZ.
- Dbaj na pravopis a diakritiku (SK: ä, ô, ľ, ĺ, ŕ; CZ: ř, ů, ě).
- Herné pojmy neprekladáme, píšeme ich tak, ako ich hráči používajú: **rally, garrison** (nikdy „garnizóna“), combo, skill, rage… (pokyn Gethera 8. 10. 2026).

## Obsah
- Plánované: návody (kombinácie commanderov, najlepšia výbava, eventy), ďalšie kontakty na R4.
- **Rise of Kingdoms / Lilith nemá verejné API** (ani na hráčov, ani na kráľovstvá). Na webe preto **nezobrazujeme meniace sa čísla** (sila, počet členov, územie…), lebo by zastarali. Len stabilné údaje zadané v admine.
- Kráľovstvo má **vždy len jednu alianciu**: [CS35] CZ/SK Legends (admin ďalšiu pridať ani túto zmazať nedovolí, zoznam rovno otvorí jej úpravu). Vedenie (model `Officer`): Methiu von CzF – Vodca, Gether – R4, Hefarion – R4 (Discord ID všetkých troch v seed migrácii). Tlačidlo „Kontaktovať“ otvorí `discord.com/users/<ID>`, bez ID skopíruje Discord meno.
- Odkazy (admin → Odkazy): Facebook skupina https://www.facebook.com/groups/550189483954751, Discord trvalá pozvánka https://discord.gg/NhwP6y9ssM (nikdy nevyprší, neobmedzené použitia; obe v seed migrácii 0002).
- Fotky a texty dodá používateľ. Dovtedy len krátke placeholdery – **žiadne vymyslené fakty** o kráľovstve.
- Nepoužívaj oficiálne assety Lilith Games (logá, artworky) bez súhlasu používateľa. Výnimky so súhlasom Gethera (8. 10. 2026): ikony predmetov a portréty commanderov v návodoch (sekcia Automaticky aktualizované návody) a ikony eventov (sekcia Kalendár eventov).
- Pätička: malý watermark „Vytvoril Gether · 2026“ + 1–2 vety, že ide o neoficiálnu fanúšikovskú stránku hráčov KD 1035 bez prepojenia s Lilith Games (Rise of Kingdoms a herné grafiky sú ich majetok), pod nimi malé odkazy na Podmienky používania a Ochranu údajov (zoznam `.footer__links`).
- **Podmienky používania** (`/podmienky`, `/cz/podmienky`, `pages/terms/`, texty `termsPage` v i18n): neoficiálna nekomerčná stránka, žiadne prepojenie s Lilith Games, ochranné známky a grafika (odstránime na žiadosť majiteľa práv), návody bez záruky, externé odkazy, kontakt cez vedenie na Discorde, „Platné od“ (dátum v `terms.ts`). Krátke vecné bloky, žiadne právne tvrdenia, ktoré nevieme doložiť. Pri zmene textu posuň dátum platnosti.
- **Ochrana údajov** (`/ochrana-udajov`, `/cz/ochrana-udajov`, `pages/privacy/`, texty `privacyPage` v i18n, štýl spolu s Podmienkami v `shared/legal-page.scss`): kto web prevádzkuje (Gether, R4, kontakt cez Discord), čo ukladáme bez prihlásenia (cookie `csrftoken`, `kd1035.lang`) a po prihlásení (Discord ID, mená, avatar, meno v hre, registrácia a posledné prihlásenie, cookie `sessionid`, pripomienky, push prehliadače, 30-dňový záznam odoslaných), kto to vidí, tretie strany, ako dlho, zmazanie účtu, úrad na ochranu údajov. Odkaz v pätičke a na `/ucet` („Čo o tebe ukladáme“). Iba fakty, žiadne právne závery („v súlade s GDPR“, právne základy).
  - **Stránka musí sedieť s kódom:** každé nové pole s osobnými údajmi, nová cookie, tretia strana alebo zmena doby uchovania → uprav `privacyPage` v `sk.ts` aj `cs.ts` a posuň „Platné od“ v `privacy.ts`. Platí aj pre `BACKUP_KEEP` × `BACKUP_INTERVAL_DAYS` (na stránke „do 8 týždňov“) a limit logov (3 × 10 MB).

## Návody (CMS)
- Spravuje ich **iba superuser** v Django admine (Návody): kategória (Commanderi / Výbava / Eventy), nadpis SK + CZ (CZ nepovinný → použije sa SK), slug, HTML obsah SK + CZ, poradie, zverejnený.
- HTML sa pri uložení čistí knižnicou **nh3** (`backend/guides/sanitize.py`): odstráni `<script>`, `<style>`, on* atribúty a `javascript:` odkazy; povolené sú bežné tagy, tabuľky, obrázky a video embedy (YouTube, Twitch). YouTube embed sa prepíše na `www.youtube-nocookie.com/embed/` (spomína ho stránka Ochrana údajov; staršie návody prečistila migrácia `guides/0006`). Frontend preto obsah vkladá cez `bypassSecurityTrustHtml`. Vzhľad obsahu určuje globálna trieda `.prose` v `frontend/src/styles.scss`.
- Obrázky: inline „Obrázky“ pri návode → po uložení admin ukáže kód `<img src="/uploads/guides/...">` na skopírovanie do HTML. Súbor sa zmaže spolu s obrázkom/návodom.
- Web: `/navody/<kategória>` = zoznam (záložky kategórií), `/navody/<kategória>/<slug>` = článok. Všade **breadcrumbs** (Domov › Kategória › Článok), aj ako JSON-LD.
- Úvod (excerpt) pre zoznam a meta description = prvý odsek `<p>` obsahu.
- Obsah (návody, obrázky) žije v databáze. Medzi vývojovými PC sa prenáša cez git (sekcia **Synchronizácia databázy cez git**), na serveri je vo volumes `db_data` a `uploads`.

### Automaticky aktualizované návody (meta)
- Návody o commanderoch, výbave a eventoch sú **dáta v kóde**: `backend/guides/meta/commanders.py`, `equipment.py`, `events.py` (bloky → HTML cez `meta/render.py`). `manage.py sync_meta_guides` (beží v `entrypoint.sh` pri každom štarte, po `import_snapshot` a po pulle, ktorý zmení `guides/meta`) ich zapíše do DB.
- Sync mení **len návody s `auto_update=True`** a ukladá len skutočné zmeny (dátum „Aktualizované“ = reálna zmena). Ručne písané návody ani návod s rovnakým slugom, ktorý nie je auto, nikdy neprepíše. Auto návod vypadnutý z dát sa skryje, nezmaže.
- Ručná úprava nadpisu/obsahu auto návodu v admine vypne `auto_update` (inak by ho ďalšia aktualizácia prepísala). Zapnúť späť = zaškrtnúť políčko.
- Každý modul má `VERIFIED = 'RRRR-MM'` → v návodoch „Stav k októbru 2026“. Texty píšeme vlastnými slovami (SK aj CZ), fakty len z datovaných zdrojov uvedených pod návodom. LootBar blog je nespoľahlivý (vymýšľa predmety), rokboom.com neexistuje.
- **Mesačná aktualizácia:** workflow `.claude/workflows/kd-meta-update.js` (research agent na každý modul → kd-builder upraví moduly a zvýši `VERIFIED` → kd-critic overí každé tvrdenie oproti zdroju → push). Spúšťa ho naplánovaná úloha Claude desktop appky `kd1035-meta-update` (7. deň v mesiaci 18:00, prvý beh 7. 11. 2026; beží len keď je appka otvorená, inak pri ďalšom spustení) s args `{date: 'RRRR-MM-DD'}`. Ručne: „spusti kd-meta-update“.
- Pätička webu ukazuje „Informácie aktualizované <dátum>“ z `/api/status/` = neskorší z `LAST_UPDATE` (`guides/meta/__init__.py`, mesačná aktualizácia ho posunie aj bez zmien) a poslednej zmeny zverejneného návodu. Načítava sa len v prehliadači, pri chybe API sa riadok skryje.
- Nový obsah generovaný Claudom patrí do `guides/meta`, nie do migrácií ani len do DB.
- **Ikony predmetov a portréty commanderov**: `backend/guides/static/guides/gear/<slug>.webp` (z codexhelper.com) a `…/commanders/<slug>.webp` (z rokstats.online, orezané na tvár), 96×96. `render.py` ich sám pridá ku každému predmetu v stĺpci `item`, `alt` alebo `accessory` (malá ikona pri alternatíve) a ku každému commanderovi v tabuľkách párov (trieda `.pic` v `styles.scss`). Nový predmet → `manage.py fetch_gear_icons "Názov"`, nový commander → `manage.py fetch_commander_icons "Meno"` (skrátené mená ako Minamoto mapuje `ALIASES` v príkaze); testy zlyhajú, ak ikona chýba. Servíruje ich Django na `/static/` (v dev cez proxy `ng serve`).
- Fakty, ktoré Gether potvrdil z hry (v kóde komentár `confirmed in game by Gether`), majú prednosť pred webovými zdrojmi – mesačná aktualizácia ich neprepisuje. Napr. More Than Gems je po novom raz za mesiac (nie každé 2–3 mesiace).

## Hráčske účty (prihlásenie cez Discord)
- Hráči sa prihlasujú **cez Discord** (komunita žije na Discorde, žiadne nové heslo). OAuth2 authorization code, scope **iba `identify`** (ID, meno, avatar) – žiadny e-mail, žiadne servery. Kód: `backend/accounts/` (`discord_oauth.py` cez stdlib urllib, `views.py`).
- Model `Player` (1:1 na `auth.User` s menom `discord_<id>`, nepoužiteľné heslo, staff iba cez `DISCORD_ADMIN_IDS` alebo ručne v admine; `first_name` = Discord meno). Hráč sa páruje podľa `Player.discord_id` (používateľa smie admin premenovať), pri každom prihlásení sa meno a avatar obnovia. Admin „Hráči“ vidí iba superuser, pridať sa nedá; zmazanie hráča zmaže aj jeho používateľa. Zmazanie účtu (`Player.delete_account()` – tlačidlo na `/ucet` aj admin) zmaže aj záznamy admin histórie o hráčovi, jeho používateľovi a jeho pripomienkach (vrátane práve zapísaného záznamu o zmazaní), lebo obsahujú jeho meno. Zablokovanie = v Users admin vypnúť „aktívny“.
- API pod `/api/auth/`: `discord/login/?next=` (404 keď je login vypnutý; náhodný `state` + `next` do session) → Discord → `discord/callback/` (state jednorazový, overí sa skôr než ide čokoľvek na Discord, throttle ~20/h na IP – IP z `X-Forwarded-For` podľa `DJANGO_NUM_PROXIES`, na serveri 2 = nginx + HTTPS proxy; chyba → `next?login=error`, zrušenie → `?login=cancelled`), `me/` (`login_enabled` + `user`, nastaví `csrftoken`, `no-store`), `PATCH me/` (meno v hre), `POST logout/`, `DELETE me/` (zmaže vlastný účet; staff/superuser 403). `next` je iba cesta na tomto webe, inak `/ucet`.
- Session cookie musí ostať **SameSite=Lax** (návrat z discord.com). DRF používa iba `SessionAuthentication` (CSRF hlavička `X-CSRFToken`, Angular `withXsrfConfiguration`); Basic auth je zámerne vypnutá.
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` iba v `.env`. Bez nich je login vypnutý: `login_enabled=false`, web neukáže tlačidlo, `/ucet` ukáže „Prihlásenie zatiaľ nie je zapnuté“. **Na produkčný server ich dávaj až po nasadení stránky Ochrana údajov** (`/ochrana-udajov`; zbierame osobné údaje).
- Frontend: služba `Auth` (`core/auth.ts`, API iba v prehliadači), stránka `/ucet` + `/cz/ucet` (prerendrovaný shell, `noindex` cez `PageMeta.noindex`, nie je v sitemap). Hlavička: od 900 px pilulka „Prihlásiť“ / avatar + meno (900–1099 px iba ikona), pod 900 px iba v mobilnom menu. Slot `.account` má **pevnú šírku vo všetkých stavoch** (40 px, od 1100 px 132 px) a je v HTML vždy – počas načítania, pri vypnutom logine aj pri chybe API ostane prázdny, dlhé meno sa oreže („…“, celé v `title`). Hlavička sa po odpovedi `/api/auth/me/` nikdy nepohne (overené meraním pozície `.nav`).
- **Osobné údaje hráčov nikdy do gitu:** `export_snapshot` maže riadky všetkých tabuliek `accounts_*` a používateľov `discord_*` (aj ich skupiny, práva a záznamy admin logu; aj záznamy o hráčoch). Ďalšie osobné dáta hráčov (napr. meno v hre) patria do appky `accounts`.

### Meno v hre a superadmin
- **Registrácia Governor ID je zrušená** (rozhodnutie Gethera 8. 10. 2026, migrácia `accounts/0004` zmazala model `Governor` aj skupinu `R4`). Namiesto nej si prihlásený hráč na `/ucet` vyplní **meno v hre** (`Player.ingame_name`, max. 32, nepovinné), aby ho vedenie spoznalo. API: `PATCH /api/auth/me/ {ingame_name}` (iba hráč prihlásený cez Discord, CSRF, prázdne = zmazať), `GET me/` ho vracia v `user.ingame_name`. Superuser ho vidí a vie opraviť v admine → Hráči.
- **Superadmin cez Discord:** Discord ID v `DISCORD_ADMIN_IDS` (`.env`, čiarkou oddelené; Gether `245662824171438090`) dostanú pri každom prihlásení `is_staff` + `is_superuser`. Funguje na každej databáze aj po importe snapshotu (ten Discord účty vynecháva). Odobratie ID práva nezoberie – to sa robí v admine. Na `/ucet` vidí účet vedenia odkaz **Administrácia** (`/admin/`, v dev cez proxy `ng serve`, rovnaká session).
- Spoločné štýly formulárov (`.field`, `.input`, `.select`, `.choice`, `.chips`/`.chip`, `.segmented`, `.switch`, tokeny `--field-*`), tlačidlá `.pill-btn` (+ `--quiet`) a `.danger` a rám dialógu `.modal` (`.modal__head`, `__title`, `__close`…, na mobile spodný panel) sú v `styles.scss` – nové formuláre a dialógy ich používajú.
- Osobné údaje hráčov a ich pripomienok popisuje stránka **Ochrana údajov** (sekcia Obsah) – pri každej zmene týchto dát ju uprav v oboch jazykoch.

## Notifikácie
- **Discord** (nie e-mail, nie WhatsApp – WhatsApp Cloud API vyžaduje Meta Business účet a platí sa za správy). Webhook do kanála, voliteľne ping roly. Premenné `DISCORD_WEBHOOK_URL`, `DISCORD_EVENT_ROLE_ID`. Osobné pripomienky hráčov navyše cez súkromnú správu bota a web push (nižšie).
- Model `EventNotification` – plánovať (dátum a čas) smie **iba superuser** v admine. Posiela ich kontajner `worker` (`manage.py run_worker`, kontrola každých 30 s). Notifikácia zmeškaná o viac ako 6 h sa už neposiela.
- Opakované eventy = model **`KingdomEvent`** (admin „Eventy kráľovstva“, iba superuser): prvý začiatok, opakovanie každých N dní (0 = jednorazovo), voliteľne „do“ (vrátane celého dňa), pripomienky X minút pred začiatkom (1 deň, 3 h, 1 h, 30 min, 15 min, pri začiatku). Logika v `backend/kingdom/events.py`.
  - **UTC vs. lokálny čas:** `time_basis='utc'` = herný čas, termín sa drží v rovnakej UTC hodine (u nás sa pri zmene letného času posunie o hodinu); `'local'` = rovnaká hodina v Europe/Bratislava celý rok. Testy pokrývajú poslednú októbrovú nedeľu.
  - Worker každých 5 min volá `plan_reminders()`: vytvorí PENDING `EventNotification` pre každú pripomienku, ktorej čas odoslania je v najbližších **48 h**. Unikátny index (event, termín, offset) → žiadne duplikáty; existujúci riadok (aj zrušený či odoslaný) sa už nevytvorí znova.
  - Uloženie eventu v admine volá `replan()`: zmaže jeho budúce PENDING riadky a naplánuje nové. Ručné úpravy takých riadkov sa tým stratia; odoslané, chybné a zrušené ostanú. Jednu pripomienku zrušíš akciou „Zrušiť (neposielať)“ (stav Zrušená).
  - Admin akcie kontrolujú stav: „Odoslať na Discord hneď“ pošle iba naplánované a chybné (odoslané a zrušené preskočí), „Znova naplánovať“ mení iba chybné a zrušené (odoslané nikdy; pri čase odoslania staršom ako 6 h upozorní). Worker pred každým odoslaním overí, že riadok je stále Naplánovaný.
  - „Uložiť ako nový“ pri evente aj notifikácii: kópia eventu si naplánuje vlastné pripomienky, kópia notifikácie je obyčajná (bez väzby na event). Admin odmietne duplicitu: druhý aktívny event s rovnakým názvom SK a prvým začiatkom (kontrola v `KingdomEvent.clean()`, aby platila aj pre zaškrtnutie „aktívny“ v zozname; zoznam navyše porovná riadky zapnuté naraz), druhú naplánovanú notifikáciu s rovnakým nadpisom a časom (formulár; „Znova naplánovať“ takú preskočí).
  - Zoznam eventov sa zmestí pri 1280 px s oboma bočnými panelmi: dátum nad časom, „Discord“ iba na čítanie (zapnutie vyžaduje vybrať pripomienky vo formulári), stĺpec „hráči“ = počet hráčov s osobnou pripomienkou, odkaz na Pripomienky hráčov. Opakovanie po slovensky („každé 3 dni“, „každých 8 týždňov“).
  - Bez `DISCORD_WEBHOOK_URL` sa nič neplánuje (admin ukáže varovanie). Správa má Discord časové značky `<t:UNIX:F>` / `<t:UNIX:R>` – každý vidí čas vo svojom pásme. Rola na ping: ID na notifikácii → ID na evente → `DISCORD_EVENT_ROLE_ID`.
  - **Produkčný webhook nikdy nedávaj do dev `.env`** – eventy putujú v snapshote na každé dev PC a ich worker by posielal tiež. Na skúšanie testovací kanál. Skutočné eventy zakladaj priamo v produkčnom admine (snapshot sa na server nedostane).
  - `show_on_web` = event je vo verejnom kalendári a hráči si ho môžu vybrať v osobných pripomienkach, `guide` = odkaz v správach aj v kalendári. Nepravidelné eventy (fázy KvK a pod.) ostávajú ako jednorazové záznamy.
  - **Šablóna rotácie** (Gether 8. 10. 2026): `manage.py seed_event_templates` (`kingdom/event_templates.py`) založí **neaktívne** koncepty bežnej rotácie (4× MGE každých 56 dní, Ark of Osiris, Wheel of Fortune, Esmeralda, Hunt for History každých 14 dní, More Than Gems a Alliance Mobilization každých 28 dní), cykly a dátumy podľa rokcentral.com/calendar (odhad, nie dáta z hry; ich API neexistuje, preberať ich `script.js` automaticky nechceme). Existujúci event s rovnakým SK názvom neprepíše. Gether dátumy overí v admine a eventy zapne.
  - **Nepravidelné eventy** (`KingdomEvent.irregular`, Gether 8. 10. 2026; napr. Silk Road, Shadow Legion, Karuak Boss – obvykle večer v pevný čas): bez cyklu (`repeat_days` musí byť 0), pred každým konaním Gether v admine nastaví „prvý začiatok“ na nový termín. Kým ďalší termín nie je, hráči ich na `/ucet` vidia s textom „Ďalší termín oznámime“ (API `next_start: null`, `irregular: true`) a môžu si ich vybrať vopred. Ich prihlášky hráčov sa po skončení termínu **nemažú** (`prune_sent`), takže pri ďalšom termíne príde pripomienka tým istým hráčom. Šablóna ich zakladá aktívne bez termínu (`IRREGULAR_TEMPLATES` v `kingdom/event_templates.py`).

### Kalendár eventov (`/kalendar`, `/cz/kalendar`)
- Požiadavka Gethera (8. 10. 2026): samostatná záložka **Kalendár** v hornej lište (aj v mobilnom menu, za „O nás“) a vlastná stránka `pages/calendar/`. Lišta sa zmestí od 900 px aj s prepínačom jazyka a prihlásením (overené meraním na 900/960/1024/1100/1280, SK aj CZ).
- API `GET /api/events/?from=RRRR-MM-DD&to=RRRR-MM-DD` (`kingdom/views.py` `EventCalendar`, `events.calendar()`): dni v Europe/Bratislava, max. 62, bez parametrov aktuálny mesiac v celých týždňoch; zlé dátumy → 400. Vráti výskyty eventov `is_active` + `show_on_web`, ktoré zasahujú do rozsahu (aj prebiehajúci viacdňový), max. 500, + `irregular_waiting` (nepravidelné bez ďalšieho termínu). Nepravidelné eventy len od teraz – ich minulý „prvý začiatok“ je iba zástupný dátum. Iba verejné polia (žiadny text správy, role ani nič o hráčoch), návod len zverejnený, `Cache-Control: public, max-age=300`, bez session.
- Stránka je prerendrovaný shell, mesiac sa počíta až v prehliadači (závisí od dnešného dňa). Od 768 px mesačná mriežka (týždne od pondelka, dnešok zlatý, viacdňové eventy ako pásy v pruhoch cez dni, `month.ts`), pod 768 px zoznam po dňoch (v aktuálnom mesiaci od dneška, prebiehajúce pod „Dnes“). Časy v pásme návštevníka + vždy aj UTC (herný čas). Nočný chvost viacdňového eventu (koniec pred 06:00) mriežka nekreslí na ďalší deň – presný koniec je v detaile. Denné eventy (`repeat_days=1`) raz v pásiku „Každý deň“, nepravidelné bez termínu v bloku pod kalendárom. Farba udalosti (zlatá/červená/navy) podľa ID.
- Klik na event → `<dialog>` (`event-dialog.ts`, na mobile spodný panel; Esc, zatvorenie, fokus späť): termín, opakovanie, „Prebieha“, návod. Prihlásený hráč tam má **tie isté ovládače ako na `/ucet`** (`ReminderPicker`) + odkaz na Môj účet a varovanie, keď mu nejde žiadny kanál; anonym tlačidlo „Prihlásiť cez Discord“ (návrat na `/kalendar?event=<id>` dialóg znova otvorí); pri vypnutom logine bez pripomienok.

- **Správa eventov pre superadmina priamo v kalendári** (Gether 8. 10. 2026, „celkový CRUD eventov v kalendárovom prostredí“): API `/api/events/manage/` (GET všetky eventy aj vypnuté + ikony, návody, voľby pripomienok, `webhook`; POST), `/api/events/manage/<id>/` (GET, PATCH, DELETE) a `<id>/date/` (PUT `{start}` = ďalší termín nepravidelného eventu, DELETE = bez termínu, zachová obvyklú hodinu) – `kingdom/manage_api.py`, iba superuser, session + CSRF, rovnaké pravidlá ako admin (`KingdomEvent.clean()`, kontrola pripomienok) a `replan()` pri zmene plánu (`PLAN_FIELDS`). Web: „+“ na dňoch od dneška v mriežke (nepravidelný event → dialóg Termín, inak nový event), panel „Správa eventov“ pod kalendárom (jeden riadok na event, prepínač aktívny, termín, úprava, odkaz do adminu), editor `admin/event-editor.ts` (čas v našom čase alebo UTC podľa `time_basis`, druhý čas sa ukáže, `admin/zone.ts`), v dialógu eventu tlačidlá Upraviť / Termín. Tieto časti sú v `@defer` blokoch – návštevníci ich nesťahujú (rozpočet bundle 600 kB). Po zmene sa kalendár načíta s parametrom `v` (obíde 5-min. cache prehliadača).
- **Ikony eventov** (súhlas Gethera 8. 10. 2026): herné ikony z kalendára codexhelper.com v `backend/kingdom/static/kingdom/events/<slug>.webp` (96×96), stiahne ich `manage.py fetch_event_icons` (`kingdom/event_icons.py` `ICONS`). `KingdomEvent.icon` = slug, nový event ho dostane podľa názvu (`GUESSES`, napr. Karuak → lebka Ceroli), v admine aj v editore výber s náhľadom. API vracia URL v `icon`. Alliance Mobilization, Shadow Legion a Silk Road na codexhelper nie sú – ich ikony sú vystrihnuté zo screenshotov z hry od Gethera (v `ICONS` bez zdroja, `fetch_event_icons` ich nechá tak). Event bez ikony má zlatý monogram (`shared/event-icon.ts`). Na `/ucet` sú vo „Všetkých eventoch“ nepravidelné eventy navrchu (Gether 8. 10. 2026). Ikony sú v kalendári, v dialógu, na `/ucet` aj v správe eventov.
- **Alliance Mobilization** je nepravidelný event: súťaž trvá týždeň od pondelka 00:00 UTC (Gether 8. 10. 2026, screenshot z hry: 5.–12. 10. 2026), pripomienky deň vopred.

### Osobné pripomienky hráčov
- Rozhodnutie Gethera (8. 10. 2026): eventy a ich čas zakladá **iba superadmin**. Pri evente ponúkne hráčom časy `KingdomEvent.player_reminders` (minúty, v admine text „10, 60, 1440“, max. 6, 0–10080, predvolené 10 a 60). Prihlásený hráč si na `/ucet` (sekcia „Pripomienky eventov“, `pages/account/reminders/`, služba `core/reminders-api.ts`) zapne event a vyberie ponúknuté časy alebo zadá vlastný (1–5 časov; vlastný čas = tri polia **dni / h / min**, súčet 1 min až 7 dní; Gether 8. 10. 2026). Ovládače sú komponent `ReminderPicker` (aj v dialógu kalendára). Časy sa všade píšu ako dni + hodiny + minúty bez nulových častí („1 deň 6 h vopred“) – web `format.ts` `duration()` aj backend `accounts/reminders.py` `duration()`. Vidí len eventy `is_active` + `show_on_web` s ďalším termínom.
- Vzhľad `/ucet` (Gether 8. 10. 2026: „nech je to prehľadné aj pri veľa eventoch“): od 1024 px profil vľavo (sticky) a pripomienky vpravo, kanály vedľa seba. **Moje pripomienky** = jeden riadok na event (ikona, názov, termín + UTC, časy, upraviť ×), **Všetky eventy** = dlaždice s vyhľadávaním (bez diakritiky) a filtrom Pravidelné/Nepravidelné, 12 na stránku. Časy sa nastavujú v rovnakom dialógu ako v kalendári (`EventDialog` s `onAccount`).
- **Kanály:** súkromná správa od Discord bota (tá istá aplikácia ako prihlásenie, `DISCORD_BOT_TOKEN`, `accounts/discord_bot.py` cez stdlib urllib) a **web push** (`pywebpush`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, kľúče z `manage.py generate_vapid_keys`). Bez kľúča je kanál vypnutý (`discord_available=false`, `push_key=""`) a nič nepadá. DM príde len hráčovi, ktorý je na serveri s botom a má povolené DM od členov.
- Service worker `frontend/public/push-sw.js`: iba `push` → notifikácia (`{title, body, url}`) a klik → otvorí stránku. **Žiadna cache, žiadny fetch handler.** nginx ho servíruje s `no-cache`. V dev ho `ng serve` servíruje z `public/` (nový súbor v `public/` vyžaduje reštart `ng serve`). Push funguje iba v bezpečnom kontexte (HTTPS alebo `localhost`).
- Push endpointy prijímame **iba od push služieb prehliadačov** (Google FCM, Mozilla, Apple, Microsoft WNS – `accounts/push.py` `PUSH_HOSTS`), inak by worker posielal POST na ľubovoľnú adresu. Max. 10 prehliadačov na hráča (najstarší vypadne). Endpoint, ktorý predtým patril inému hráčovi, sa presunie na aktuálne prihláseného.
- **Dáta v appke `accounts`** (do snapshotu nejdú): `Player.remind_discord`, `Player.lang` (jazyk správ = jazyk webu, `/ucet` ho pošle pri načítaní), `EventReminder`, `PushSubscription`, `SentReminder` (záznam idempotencie, worker ho po 30 dňoch maže).
- API (iba hráč prihlásený cez Discord, session + CSRF, throttle 60 zápisov/min na hráča): `GET/PATCH /api/me/reminders/` (`{discord?, lang?}`), `PUT/DELETE /api/me/reminders/<event_id>/` (`{offsets}`; 404 pre eventy, ktoré hráč nevidí), `POST/DELETE /api/me/push/`.
- Worker každý tik volá `send_personal_reminders()` (`accounts/reminders.py`): pošle, keď čas začiatok − offset padne do posledných **10 min**; zmeškané viac ako 10 min preskočí. Pre každý kanál najprv zapíše unikátny `SentReminder`, až potom posiela → nikdy dvakrát, zlyhanie sa neopakuje (Discord 429 sa iba zaznamená, worker nikdy nečaká). Push 404/410 zmaže prehliadač, 5 chýb za sebou tiež. Kanálové pripomienky cez webhook (`EventNotification`) sú nezávislé a nezmenené.
- Správy: Discord embed s `<t:UNIX:F>` / `<t:UNIX:R>`, odkazom na návod a na `/ucet`; push text „Začína o 10 min · 20:00“ v čase Europe/Bratislava (CZ „Začíná za …“).
- Admin „Pripomienky hráčov“ (Hráči, iba superuser, len na čítanie; mazanie povolené, inak by admin nedovolil zmazať hráča či event s pripomienkami). Push kľúče v admine nie sú.

## Dáta a zálohy
- SQLite súbor a nahrané súbory sú v Docker named volumes `db_data` a `uploads`. Prežijú `docker compose up --build`, rebuild aj `docker compose down`.
- **Nikdy nespúšťaj `docker compose down -v` ani nemaž volumes** (zmaže databázu).
- `worker` robí zálohu každých `BACKUP_INTERVAL_DAYS` (7) dní do `BACKUP_PATH` (`./backups` na hoste), necháva `BACKUP_KEEP` (8) posledných. Používa SQLite backup API (bezpečné za behu). Raz denne maže expirované session (`clearsessions`), aby v DB ani zálohách neostávali stopy po prihláseniach. Kópie záloh mimo servera tiež maž po 8 týždňoch (sľub na stránke Ochrana údajov).
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
- Dynamické dáta idú z API `/api/alliances/`, `/api/links/`, `/api/guides/` (+ `/api/guides/<slug>/`), kalendár z `/api/events/`, prihlásený hráč z `/api/auth/me/`, jeho pripomienky z `/api/me/reminders/`. Frontend musí fungovať aj keď API zlyhá (sekcia sa skryje, nič sa nerozbije).
- URL: `/static/` = Django statika (admin), `/uploads/` = nahraté súbory (MEDIA_URL), `/media/` patrí Angular buildu (fonty).
- Ikony: SVG sprite `frontend/public/icons.svg` (Lucide + Simple Icons), použitie `<svg appIcon="swords" />`. Novú ikonu pridaj do `frontend/scripts/build-icons.mjs` a spusti `npm run icons`.
- Angular konvencie: súbory bez prípony `.component` (`hero.ts`, trieda `Hero`), `inject()`, `input()`, signals, `OnPush`.

## Bezpečnosť a konfigurácia
- Citlivé údaje (kľúče, heslá, tokeny, webhooky) **iba v `.env`**. Ten je v `.gitignore` a nikdy sa necommituje. Kontajner `web` dostane z `.env` len `SITE_URL`.
- Každú novú premennú pridaj aj do `.env.example` (s popisom, bez skutočnej hodnoty).
- `.env` na server nahráva používateľ ručne. Lokálny `.env` je len pre vývoj (`DJANGO_DEBUG=1`).
- Produkčná doména **kd1035.eu** (`SITE_URL=https://kd1035.eu`), kanonická adresa bez `www` – `www.kd1035.eu` presmeruje nginx v kontajneri `web` (301). HTTPS rieši reverse proxy na serveri (napr. Caddy) a musí posielať `X-Forwarded-Proto`. Server, DNS a proxy nastavuje Gether sám (README → Doména kd1035.eu).
- Web na serveri počúva na porte **9005** (`WEB_PORT`, predvolený aj v `docker-compose.yml`; Gether 8. 10. 2026).
- Hotový produkčný `.env` je na Getherovom PC ako `.env.production` (git-ignored, vlastný `DJANGO_SECRET_KEY`, heslo admina a VAPID kľúče, Discord aplikácia rovnaká ako vo vývoji); na server ho nahráva ručne ako `.env`. Dev `.env` ostáva vývojový.
- Nasadenie = `git pull && docker compose up -d --build`. **Prvý štart s novou databázou** (`entrypoint.sh`: súbor DB ešte neexistoval) po migráciách a `sync_meta_guides` spustí `seed_initial_events` → eventy z `backend/kingdom/initial_events.json` (stav dev DB k 8. 10. 2026, návody prepojené podľa slugu, existujúci názov neprepíše). Neskôr sa už nespúšťa – eventy na serveri žijú v produkčnom admine.

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

# testy
docker compose -f docker-compose.dev.yml run --rm backend python manage.py test
docker compose -f docker-compose.dev.yml run --rm frontend npx ng test --watch=false

# screenshoty na viacerých rozlíšeniach (beží dev server) → tools/screenshots/out/
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble sh -c \
  "cd tools/screenshots && npm i --no-save playwright@1.63.0 >/dev/null && node shoot.mjs"

# Docker Desktop na Windows občas zlyhá pri bind mounte s vnoreným volume (I/O error, „cannot allocate memory“,
# „No tests found“). Pomôže `docker desktop restart`, alebo testy úplne bez bind mountu:
tar -c --exclude=__pycache__ --exclude=data --exclude=media -C backend . | docker run -i --rm -u root -e DJANGO_DEBUG=1   -w /app --entrypoint sh kd1035-dev-backend -c "tar -x && python manage.py test"
tar -c --exclude=node_modules --exclude=.angular --exclude=dist -C frontend . | docker run -i --rm   -v kd1035-dev_frontend_node_modules:/app/node_modules -w /app node:24-alpine sh -c "tar -x && npx ng test --watch=false"

# pregenerovanie hero grafiky + og-image + ikon aplikácie
docker build -t kd1035-artgen tools/background
docker run --rm -v "$PWD:/work" kd1035-artgen --raster
# banner (1500×600) a avatar (1024×1024) pre Discord bota / aplikáciu → tools/background/discord/
docker run --rm -v "$PWD:/work" kd1035-artgen --discord
```
