# Návrhy nových funkcií pre hráčov

Stav k **11. 10. 2026** (v1.6.3). Čo by bežný hráč Rise of Kingdoms mohol na webe využiť navyše. Nič z toho ešte nie je rozhodnuté – Gether vyberie, čo spravíme. Návrhy rešpektujú pravidlá z `CLAUDE.md`: žiadne živé čísla z hry (nie je API), všetko cez Discord (žiadny web push), žiadna FAQ, žiadna registrácia Governor ID, žiadne vymyslené fakty.

Náročnosť: **S** = hodiny, **M** = jeden deň práce, **L** = viac dní. Osobné údaje = treba upraviť stránku Ochrana údajov.

## Odporúčané poradie (najväčší úžitok za najmenej práce)

1. Kalkulačky (speedupy, MGE/KvK body, výcvik) – #1
2. Herné hodiny UTC a odpočet do resetu – #2 (už schválené v backlogu)
3. Osobný budík cez Discord (štít, KvK) – #3
4. Prihlášky na eventy (Ark of Osiris, MGE, KvK) – #4
5. „Čo môžem postaviť“ z mojich commanderov – #5

## A. Nástroje, ktoré hráč použije každý týždeň

### 1. Kalkulačky – **M** (každá zvlášť S)
Samostatná stránka `/nastroje` so záložkami, všetko beží v prehliadači, nič sa neukladá.
- **Speedupy:** zadáš počty (1 min, 5 min, 1 h, 8 h, 1 deň…) zvlášť pre výcvik, stavbu, výskum, liečenie a univerzálne → spolu v dňoch a hodinách.
- **Body do MGE / KvK:** koľko bodov dajú tvoje speedupy, výcvik T4/T5, sila – pre konkrétnu fázu MGE alebo Most Powerful Governor.
- **Výcvik jednotiek:** počet a tier → suroviny, čas (s tvojím bonusom rýchlosti), sila a body.
- **Kill points:** T1–T5 zabitia → KP (0,2 / 2 / 4 / 10 / 20 bodov za jednotku).
- **Prečo:** hráči to dnes rátajú v Exceli alebo na anglických weboch. SEO bonus („ROK kalkulačka speedupov“ po slovensky/česky nikto nemá).
- **Pozor:** hodnoty bodov len z datovaných zdrojov pod nástrojom (ako pri návodoch), MGE body sa menia → kontrola v mesačnej aktualizácii.

### 2. Herné hodiny UTC a odpočet do resetu – **S**
Už schválené (`game-clock-reset` v backlogu). Vhodné rozšíriť aj o odpočet do konca aktuálneho eventu a do pondelkového resetu (týždenné úlohy).

### 3. Osobný budík cez Discord – **M**, osobné údaje
Prihlásený hráč si nastaví jednorazovú pripomienku „o 7 h 30 min“ alebo „v sobotu 14:00“ s krátkym textom (napr. *končí mi štít*, *otvára sa pass*, *rally na sväté miesto*). Bot mu pošle súkromnú správu.
- **Prečo:** koniec štítu v KvK je najčastejší dôvod, prečo hráč príde o armádu. Hra sama neupozorní dosť skoro.
- **Technicky:** stavia na existujúcich pripomienkach a workerovi; limit napr. 5 aktívnych na hráča, po odoslaní sa zmaže.

### 4. Prihlášky na eventy – **L**, osobné údaje
Superuser otvorí prihlasovanie k eventu (Ark of Osiris, MGE, KvK, Shadow Legion). Hráč sa prihlási jedným klikom cez Discord účet, vyberie úlohu (rally leader, garrison, teleport, farmer…), časy, kedy môže, a poznámku. Vedenie vidí zoznam (meno v hre, úloha), vie ho stiahnuť a rozdeliť tímy.
- **Prečo:** dnes sa to robí cez Google formuláre a reakcie na Discorde, kde sa zoznam stratí. Pri MGE (kto smie ísť na 1. miesto) je prehľadný zoznam priamo užitočný.
- **Nadväzuje:** pripomienka prihláseným pred eventom ide cez existujúce DM.

### 5. „Čo môžem postaviť“ – **M**
Rozšírenie hľadania párov (`commander-finder`): hráč si zaškrtne commanderov, ktorých má (uložené v prehliadači, po prihlásení voliteľne na účte) a web ukáže páry z našich návodov, ktoré vie hneď postaviť, a ktorý jeden commander mu otvorí najviac nových párov.
- **Prečo:** odpovedá na najčastejšiu otázku v aliančnom chate („mám X a Y, čo s tým“) bez toho, aby sme si vymýšľali rady – len páry z návodov.

### 6. Denný a týždenný checklist – **S**
Odškrtávací zoznam denných vecí (VIP truhla, aliančná pomoc a dary, krčma, Lyceum of Wisdom, Expedition, denné úlohy…), ktorý sa sám vynuluje o 00:00 UTC. Uložený len v prehliadači.
- **Prečo:** hlavne noví a menej aktívni hráči zabúdajú na zadarmo odmeny. Hráč si stránku dá na plochu mobilu.

## B. Pre migrantov a nových členov

### 7. Kalkulačka migrácie – **S**
Zadáš silu účtu → koľko pasov na migráciu potrebuješ (tabuľka z hry podľa sily) a kde ich získať.
- **Prečo:** prvé, čo migrant rieši; dobrý SEO vstup („migrácia ROK pasy“) priamo na stránku O nás a kroky migrácie.

### 8. Pravidlá kráľovstva – **S** (text dodá Gether)
Jedna stránka spravovaná v admine: pravidlá farmenia, útokov na kráľovstvo, MGE rotácia, KvK požiadavky (KP/deads podľa sily), správanie na Discorde. Krátke bloky, SK aj CZ.
- **Prečo:** nový člen ich nemusí hľadať v pripnutých správach na Discorde; vedenie má na čo odkázať.

### 9. Prvé dni v 1035 – **S** (text dodá Gether)
Pokračovanie krokov migrácie: čo spraviť po prílete (vstup do aliancie, rola na Discorde, kde sú pravidlá, prihlásenie na webe a zapnutie pripomienok).

### 10. Slovník pojmov – **S**
Skratky a slang (KvK, MGE, AoO, GH, SoC, KP, DKP, rally, garrison, zeroing, farm, F2P, whale…) s vysvetlením v jednej vete a odkazom na návod.
- **Prečo:** nováčik rozumie chatu; SEO na slovenské/české výrazy. Nie je to FAQ – je to vyhľadateľný zoznam pojmov.

## C. Komunita a promo

### 11. Kronika kráľovstva – **M** (obsah dodá Gether)
História: založenie, odohrané KvK (sezóna, výsledok, súper), víťazi MGE, významné momenty, screenshoty. Admin s dátumom ku každému záznamu.
- **Prečo:** historické fakty nestarnú (na rozdiel od sily či počtu členov), migrant vidí, že kráľovstvo žije, členovia majú hrdosť.

### 12. Galéria – **S** (fotky dodá Gether)
Screenshoty z KvK, mapy, aliančné akcie. Nahrávanie v admine, náhľady na webe.

### 13. Darčekové kódy (gift codes) – **S**
Zoznam aktuálnych kódov na vyzdvihnutie odmien s dátumom platnosti; po vypršaní sa sám skryje. Nový kód môže bot hneď poslať do kanála.
- **Pozor:** kódy pridáva ručne superuser (nie je API), inak by na webe ostávali neplatné.

## D. Zvážiť neskôr

- **Talent stromy v návodoch commanderov** – obrázok/rozpis talentov ku každému páru. Veľa obsahu a rýchlo zastaráva; len ak bude zdroj s datovanými buildmi.
- **Lyceum of Wisdom – hľadanie odpovedí** – hráči to milujú, ale otázky sú po anglicky a databázu by sme preberali z cudzích webov (autorské práva) → skôr nie.
- **Adresár členov** (dobrovoľný profil: hlavní commanderi, úloha, aktívne hodiny) – pomôže hľadať partnerov na rally, ale osobné údaje a rýchlo zastaráva.
- **Hlasovania** – Discord ich má natívne, malý prínos.

## Zámerne nie

- Rebríčky sily, KP či DKP členov – čísla by sa museli prepisovať ručne a zastarali by (pravidlo: žiadne meniace sa čísla).
- Čokoľvek platené alebo s reklamou – web je nekomerčný.
