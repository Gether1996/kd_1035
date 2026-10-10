# UX analýza webu KD 1035

Stav k **10. 10. 2026** (v1.2.1, kolo 5). Prečo by hráč web používal, čo mu chýba a čo sme zámerne vynechali. Analýza môže zastarať – pri ďalších kolách ju porovnaj s [`backlog.md`](backlog.md).

## 1. Prečo by web niekto používal

- **Kalendár kráľovstva** (`/kalendar`) – všetky eventy na jednom mieste, v lokálnom čase aj v UTC, bez prepočítavania herného času.
- **Osobné pripomienky súkromnou správou na Discorde** – zadarmo, bez ďalšieho bota či predplatného; hráč si vyberie eventy a časy (aj „deň vopred o 18:00“).
- **Aktuálne návody v SK/CZ** – commanderi, výbava, eventy; s portrétmi commanderov, ikonami predmetov a zdrojmi pod návodom, mesačne aktualizované.
- **Kontakty na vedenie a trvalá pozvánka na Discord** – tlačidlo „Kontaktovať“ otvorí Discord profil.
- **Pre migranta:** jediné kráľovstvo zložené výhradne zo slovenských a českých hráčov; stránka O nás s krokmi migrácie.

## 2. Cesty používateľov

### Migrant (hľadá nové kráľovstvo)
- **Funguje:** hero s výzvou „Pridaj sa k nám“, stránka O nás (SEO text, 3 kroky migrácie), Discord pozvánka, kontakty na vedenie.
- **Chýba:**
  - Hlavné CTA v hero vedie na `#community`, kde sú iba Discord, Facebook a jedna veta – nie na kroky migrácie → `join-path-and-officer-focus`.
  - Blok migrácie na O nás nemá kotvu, nedá sa naň odkázať → `join-path-and-officer-focus`.
  - Vedenie je Vodca + 2× R4 a nikde nie je napísané, na koho sa obrátiť s čím (migrácia, KvK…) → `join-path-and-officer-focus`.
  - Stav migrácie (otvorená / po dohode / zatvorená) a podmienky chýbajú → `migration-status`, odložené (rozhodne Gether).

### Člen kráľovstva (bežný hráč)
- **Funguje:** kalendár s UTC, pripomienky na Discorde, najbližšie eventy na úvode, termín eventu priamo v jeho návode, náhľady odkazov na návody na Discorde.
- **Chýba:**
  - „Návody“ v hlavičke skočí na sekciu úvodu a `/navody` je 404 → `guides-hub`.
  - Žiadne vyhľadávanie v 29 návodoch (garrison, jazda, MGE…) → `guides-search`.
  - Nič neodpovie na „mám commandera X, s kým ho spárovať“ – páry sú roztrúsené v 9 návodoch → `commander-finder`.
  - Návod končí iba odkazom „Späť na zoznam“, bez súvisiacich návodov a kopírovania odkazu → `guide-related-and-share`.
  - Chýbajú herné hodiny UTC a odpočet do denného resetu → `game-clock-reset`.
  - Event sa nedá pridať do kalendára v mobile (jeden termín ani odber všetkých) → `event-add-to-calendar`, `ics-calendar-feed`.

### Vedenie (R4, Vodca)
- **Funguje:** automatické správy o eventoch cez webhook do kanála, kontakty na webe.
- **Chýba:** odkaz na event z kalendára zdieľaný na Discorde ukáže všeobecný náhľad kalendára, nie konkrétny event → `calendar-event-link-previews`.

### Superadmin (Gether)
- **Funguje:** prehľad na úvode adminu (worker, zálohy, notifikácie), správa eventov priamo v `/kalendar`, skúšobná správa od bota, bezpečné akcie v admine eventov.
- **Chýba:** nič zásadné. Otvorené rozhodnutia (týždenný prehľad, stav migrácie, Discord Scheduled Events) sú v backlogu v časti „Čaká na Gethera“.

### Všetci
- Web rýchlo narástol (dialógy, výbery, vyhľadávanie) – bariéry prístupnosti treba overiť automaticky → `a11y-audit-axe`.

## 3. Nápady kola 5 a verdikty kritika

Poradie stavby v tomto kole:

1. `ux-analysis-doc` – tento dokument (schválené s úpravami).
2. `guides-hub` – rozcestník `/navody` so všetkými návodmi podľa kategórií, aktívna záložka v hlavičke (schválené).
3. `join-path-and-officer-focus` – odkaz z hero na kroky migrácie a voliteľný riadok „na čo sa obrátiť“ pri každom z vedenia (schválené).
4. `event-add-to-calendar` – jeden termín eventu do Google kalendára alebo ako `.ics` (schválené s úpravami: iCal iba v backende).
5. `commander-finder` – hľadanie podľa commandera: s kým ho spárovať (schválené s úpravami: bez F2P).

Na ďalšie kolá:

- `guides-search` – vyhľadávanie a filter v návodoch, druhý krok rozcestníka (schválené).
- `ics-calendar-feed` – odber všetkých eventov do mobilu (schválené, stavia na iCal helperi z `event-add-to-calendar`).
- `game-clock-reset` – herný čas UTC a odpočet do resetu, iba v kalendári (schválené).
- `a11y-audit-axe` – audit prístupnosti, len critical/serious (schválené).
- `guide-related-and-share` – súvisiace návody a kopírovanie odkazu (schválené s úpravami).
- `calendar-event-link-previews` – náhľad konkrétneho eventu na Discorde (schválené s úpravami, logika v appke `kingdom`).

Odložené:

- `migration-status` – stav migrácie v admine; zastaraný „otvorené“ je horší než žiadny, čaká na rozhodnutie Gethera, či ho vedenie bude udržiavať.

## 4. Zámerne nie

- **Živé štatistiky** (sila, počet členov, KvK výsledky) – Rise of Kingdoms nemá verejné API, čísla by zastarali.
- **FAQ sekcia** – Gether ju nechce.
- **Web push** – zrušený, všetko ide cez Discord.
- **Registrácia Governor ID** – Gether ju zrušil 8. 10. 2026, hráč vypĺňa iba meno v hre.
- **Platené služby** – web je neoficiálny a nekomerčný.

## 5. Požiadavky Gethera z 10. 10. 2026 (hotové)

- **Karuak Ceremony** – celý Karuak event ako nepravidelný viacdňový event (ako Alliance Mobilization), pripomienka deň vopred o 18:00 namiesto 15 min pred začiatkom; večerný Karuak Boss ostáva samostatný (v1.2.0).
- **F2P** – v1.2.0 pridala F2P do každej tabuľky párov; v1.2.1 stĺpec F2P z tabuliek párov na pokyn Gethera odstránila. F2P návody a zmienky v texte ostali.
- **Zostavy armád ako portréty** commanderov namiesto textu (v1.2.0).
- **Zdroje iba dole** – v textoch nepíšeme, že je všetko podľa WarDaddyChadského, zdroj je pod návodom (v1.2.0).
- **Tri portréty na mobile** – v prvom stĺpci tabuľky sa zalomia a nezasahujú do druhého stĺpca (v1.2.0).
