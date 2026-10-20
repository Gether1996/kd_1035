# QA – ako testujeme KD 1035

Merge do `main` = nasadenie na kd1035.eu. Hráči sú väčšinou netechnickí – chybu často nenahlásia, alebo len „na mobile to je divné“. Chyby preto musíme chytiť my, **pred** mergom. Dvaja vývojári nestihnú pred každým releasom preklikať web na piatich zariadeniach, takže to robia stroje: automatické testy v CI a Claude ako manuálny tester v skutočnom Chrome.

## Tri vrstvy

| Vrstva | Čo chytí | Kedy | Ako |
|---|---|---|---|
| 1. Unit testy (Django, Vitest) | logika, API, oprávnenia, časy, i18n | každý commit + CI | `tools/test.sh all` |
| 2. E2E + rozloženie (Playwright, `tools/e2e/`) | stránka nejde, chyba v konzole, 5xx, posun do strany, orezaný text, nezarovnané ikony, deformované obrázky, rozbitá navigácia, 404, hlavičky nginx | každý PR a push do `main` (CI), lokálne pred PR | `tools/e2e/run.sh` |
| 3. Manuálne / exploratívne QA (Claude + Chrome DevTools MCP) | čo test nepredvída: vzhľad, čitateľnosť, UX, slabý mobil a sieť, nové funkcie | UI zmena, pred väčším releasom, „na mobile to je divné“ | `/kd-qa` |

Po nasadení: GitHub → Actions → **Live smoke** → Run workflow (iba čítanie živého webu).

## Pred mergom do main

1. `tools/test.sh all` – zelené.
2. PR na GitHube → CI (`.github/workflows/ci.yml`) musí byť zelené: backend testy + chýbajúce migrácie, frontend testy + produkčný build, e2e na produkčnom Docker stacku s čerstvou DB (vrátane prihláseného test hráča – bez neho krok „Test player“ zlyhá). Pri zlyhaní: Summary v behu workflowu, artefakt `playwright-report` (report + trace). **„flaky“ v Summary je chyba, nie šum** – test prešiel až na druhý pokus (`retries: 1`); „dopredu na `/#alliance`“ takto 14× prešiel, kým sa ukázalo, že web je naozaj chybný (v1.32.2).
3. Zmena UI → `/kd-qa <oblasť>` (telefón + laptop), pozri screenshoty z `tools/qa/out/`.
4. Merge → po nasadení **Live smoke**.

Odporúčanie (rozhodne Gether): na GitHube zapnúť ochranu vetvy `main` – *Require status checks to pass* (CI) a merge cez PR. Potom sa do produkcie nedostane nič, čo neprešlo testami.

## Zariadenia

Rovnaké v e2e (`tools/e2e/playwright.config.ts`, projekty) aj pri manuálnom QA (`kd-qa-tester`, `emulate`):

| Projekt | Rozmer | Testuje |
|---|---|---|
| `phone-320` | 320 × 640, Android | rozloženie (najužší podporovaný mobil) |
| `phone` | 360 × 780, Android | všetko |
| `iphone` | iPhone 15, **WebKit** (Safari aj Chrome na iOS) | všetko |
| `phone-landscape` | 844 × 390 | rozloženie |
| `tablet` | 768 × 1024, dotyk | rozloženie + smoke |
| `desktop` | 1280 × 800 | všetko |
| `wide` | 2560 × 1080 | rozloženie |

## Automatické testy (`tools/e2e/`)

| Súbor | Tag | Čo overí |
|---|---|---|
| `tests/smoke.spec.ts` | `@smoke` | každá stránka SK + CZ: stav 200, `lang`, jeden `h1`, title, description, canonical + hreflang (alebo `noindex` pri účte), hlavička, pätička s verziou, žiadny posun do strany; 404 stránky |
| `tests/layout.spec.ts` | `@layout` | každá stránka na každom zariadení + mobilné menu, dialóg eventu, výsledky hľadania: posun do strany (s vinníkom), časti riadku mimo spoločnej osi (`ALIGNED` v `tests/layout.ts`), orezaný text, roztiahnuté obrázky. **Varovania** (nezhodia test): dotykové plochy pod 24 × 24 px, písmo pod 11 px |
| `tests/journeys.spec.ts` | `@journey` | mobilné menu (Esc, fokus), lišta, zdieľaný odkaz na sekciu, späť/dopredu (PR #1), nová stránka hore, skip link, prepínač jazyka, český prehliadač → `/cz`, návody (hub → kategória → návod → breadcrumbs), hľadanie, kalendár (dialóg, Esc, mesiace), web bez API; s `PROD=1` aj cache hlavičky, sitemap, robots, náhľad pre Discord, meta návodu v prvom HTML (SK, CZ, neznámy = 404), 404 zo servera |
| `tests/player.spec.ts` | `@player` | s test hráčom: `/ucet`, `/pripomienky`, `/marche`, `/kvk` – prihlásený, rozloženie, ukážkové marche |

Každý test navyše zlyhá pri chybe JS, chybe v konzole, odpovedi 5xx alebo zlyhanej požiadavke (`tests/fixtures.ts`).

**Spustenie s Dockerom** (dev stack beží):
```bash
tools/e2e/run.sh                                  # všetko, všetky zariadenia (~5 min)
tools/e2e/run.sh --grep @smoke --project phone    # rýchlo
tools/e2e/run.sh --player                         # aj prihlásené stránky (dočasný test hráč)
tools/e2e/run.sh --prod                           # proti produkčnému stacku na :9005 (+ hlavičky, 404, sitemap)
```
**Bez Dockera** (Node ≥ 20.19 a Chrome, dev server na :4200):
```bash
cd tools/e2e && npm ci
BASE_URL=http://localhost:4200 PW_CHANNEL=chrome npx playwright test --project phone --project desktop
npx playwright install webkit                     # raz, pre projekt iphone
```
Na Windows s Django `runserver` mimo Dockera daj `--workers 3` (runserver tam odmieta veľa súbežných spojení → 502).

**Výsledok:** na konci `summary.mjs` vypíše zlyhania a zoskupené varovania (`node summary.mjs out/run.json --warnings`). Klikací report: `npx playwright show-report out/report`, záznam zlyhaného testu: `npx playwright show-trace out/results/<test>/trace.zip`.

**Nová kontrola:** nová stránka → `tests/pages.ts`; riadok s ikonou/číslom/šípkou, ktoré musia byť na jednej osi → `ALIGNED` v `tests/layout.ts`; nová cesta používateľa → `tests/journeys.spec.ts`. Opravená chyba rozloženia dostane kontrolu, aby sa nevrátila.

## Manuálne QA s Claude (Chrome DevTools MCP)

Claude ovláda skutočný Chrome cez [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp): emuluje mobil (aj pomalú sieť a CPU), kliká, číta konzolu a sieť, robí screenshoty, Lighthouse a performance trace.

**Raz na každom PC:** Node ≥ 20.19 a Google Chrome. Otvor Claude Code v repe, schváľ server `chrome-devtools` (výzva pri štarte alebo `/mcp`). `.mcp.json` ho spúšťa cez `node tools/qa/chrome-devtools-mcp.mjs` (rovnako na Windows aj macOS), ten si pri prvom štarte nainštaluje pinnutú verziu. Povolené nástroje sú v `.claude/settings.json` (bez `upload_file`).

**Použitie:** `/kd-qa` (smoke celého webu), `/kd-qa mobil`, `/kd-qa /kalendar`, `/kd-qa PR 12`, `/kd-qa live` (živý web, len čítanie). Skill najprv spustí automatické testy, potom paralelných agentov `kd-qa-tester` (jeden na skupinu zariadení) a vráti jeden zoradený report: Blokujúce → Vážne → Drobné → Nápad, so screenshotmi v `tools/qa/out/`.

- Chrome má vždy dočasný profil (žiadne tvoje cookies). Bez okna: `KD_QA_HEADLESS=1`. Tvoj vlastný Chrome s `--remote-debugging-port=9222`: `KD_QA_BROWSER_URL=http://127.0.0.1:9222` – spusti ho s osobitným profilom (`--user-data-dir=<prázdny priečinok>`), nikdy nie s tým, kde si prihlásený (admin webu, Discord, GitHub): nástroje z `.claude/settings.json` (aj `evaluate_script`, `navigate_page`) bežia bez pýtania.
- Prihlásený hráč: `manage.py test_session [--superuser] [--marches] [--new]` – skill ho vytvorí aj zmaže.
- Vypnuté: štatistiky používania a posielanie URL do Google CrUX.

## Testovací plán

Scenáre pre `kd-qa-tester` aj pre ručné klikanie. **A** = pokryté automaticky v `tools/e2e` (manuálne len pri zmene v oblasti).

**G – každá stránka**
- G1 (A) Načíta sa v SK aj CZ, bez chýb v konzole a zlyhaných požiadaviek.
- G2 (A) Od 320 po 2560 px nič neutečie do strany, text sa neoreže, obrázky nie sú roztiahnuté (iPhone!).
- G3 Text sa dá čítať: kontrast na kartách, žiadne písmo pod ~12 px okrem štítkov, nadpisy sa nelámu po slovách.
- G4 Dotykové ciele na mobile ≥ 24 px a nie natlačené na seba; fokus pri Tabe viditeľný.
- G5 Pri načítaní dát z API stránka neskáče (CLS); na Slow 4G + 4× CPU sa obsah ukáže do ~3 s.

**N – navigácia**
- N1 (A) Mobilné menu: otvorí, Esc zatvorí a vráti fokus, odkaz prejde a menu zavrie.
- N2 (A) Odkaz na sekciu (`/#alliance`) aj zdieľaný odkaz na sekciu skončí pod hlavičkou; späť/dopredu vráti pozíciu.
- N3 (A) Prepínač jazyka ostane na stránke; český prehliadač dostane `/cz`; 404 v jazyku adresy.

**V – návody**
- V1 (A) Hub: záložky, hľadanie (bez diakritiky), Esc vymaže; filtre špecializácií (chipy) na mobile.
- V2 (A) Kategória → návod → breadcrumbs späť; ikony špecializácie zarovnané s číslom a šípkou.
- V3 Návod na telefóne: tabuľky (posun len vnútri tabuľky), obrázky, video, Súvisiace návody, Kopírovať odkaz.
- V4 Hľadanie commandera (`?commander=`) a Moji commanderi na mobile.

**K – kalendár**
- K1 Mriežka od 768 px, zoznam pod 768 px; dnešok, viacdňové pásy, „Každý deň“, nepravidelné bez termínu.
- K2 (A) Dialóg eventu: otvorí, Esc/zatvoriť, fokus späť, odkaz `?event=` sa dá zdieľať; na mobile spodný panel celý viditeľný.
- K3 Prihlásený hráč: pripomienky v dialógu (časy, vlastný čas dni/h/min).

**O – O nás**: O1 kalkulačka migrácie (čísla s čiarkou, T4/T5), O2 Kontaktovať (Discord / kopírovanie mena), O3 kroky migrácie.

**P – hráč** (`test_session`, `--new` = neschválený bez súhlasu s podmienkami)
- P1 `/ucet`: meno v hre (max. 32, prázdne = zmazať), odhlásenie. Nikdy nepotvrdzuj zmazanie účtu.
- P2 `/pripomienky`: výber eventu, časy, vlastný čas; kanál Discord.
- P3 `/marche`: pridanie a úprava marchu na telefóne – typ, commanderi, výbava, armamenty, Detail.
- P4 `/kvk`: prihláška rally/garrison; P5 nový hráč: dialóg podmienok, čakanie na schválenie.

**S – superadmin** (`--superuser`): S1 správa eventov v kalendári („+“, editor, Termín), S2 sekcia Hráči na `/ucet` (prepínače, filtre), S3 `/vyhodnocovanie`.

**R – odolnosť**: R1 (A) web bez API – sekcie zmiznú, nič nespadne; R2 offline po načítaní; R3 lišta „Web má novú verziu“ po novom builde.

**L – výkon a SEO**: Lighthouse (mobil) pre `/`, `/navody`, `/kalendar`: prístupnosť ≥ 95, SEO 100, CLS < 0,1, LCP < 2,5 s.
