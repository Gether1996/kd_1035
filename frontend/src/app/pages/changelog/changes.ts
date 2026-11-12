/**
 * What is new on the website, for players (Slim 30. 10. 2026: "pridaj changelog do footra"): one block per day with
 * the version the site had at its end, a few short lines in Slovak and Czech side by side – like the glossary, kept
 * out of sk.ts/cs.ts so the initial bundle does not carry it. Newest first; a test keeps the first version equal to
 * SITE_VERSION, so every release adds its line (skill kd-release). Only what players notice – no admin internals.
 */
export interface Change {
  /** the day, YYYY-MM-DD */
  date: string;
  /** the version at the end of that day */
  version: string;
  sk: string[];
  cs: string[];
}

export const CHANGES: Change[] = [
  {
    date: '2026-11-12',
    version: '1.67.0',
    sk: [
      'Kalendár: 20 GH má nový typ Lord of War – na max. odmenu treba 420 000 power.',
      'Môj účet: prehľadnejší profil – meno, jazyk a údaje z hry v paneloch a jedno tlačidlo Uložiť, ktoré sa rozsvieti, keď niečo zmeníš.',
      'Môj účet: VIP level 1 až 19, najvyšší SVIP zapneš prepínačom.',
      'Fórum: správy sú stále predvolene anonymné, ale prihlásený hráč môže prepínačom „Pod menom“ napísať so svojím menom a avatarom.',
    ],
    cs: [
      'Kalendář: 20 GH má nový typ Lord of War – na max. odměnu je potřeba 420 000 power.',
      'Můj účet: přehlednější profil – jméno, jazyk a údaje ze hry v panelech a jedno tlačítko Uložit, které se rozsvítí, když něco změníš.',
      'Můj účet: VIP level 1 až 19, nejvyšší SVIP zapneš přepínačem.',
      'Fórum: zprávy jsou dál výchozí anonymní, ale přihlášený hráč může přepínačem „Pod jménem“ napsat se svým jménem a avatarem.',
    ],
  },
  {
    date: '2026-11-11',
    version: '1.65.2',
    sk: [
      'Ikony jednotiek majú farby ako v hre: pechota modrá, jazda zelená, lukostrelci červení – v návodoch, pri marchoch aj v Sieni slávy. Krit na výbave ostáva červený.',
      'Prehľad účtu: All DMG má oranžovú hviezdu ako v hre.',
      'Prehľad účtu: z neho sa už dá prepnúť späť na ostatné záložky Marche.',
      'Prehľad účtu: marche sú v stĺpcoch zarovnané – formácia a bonusy sú vždy na rovnakej výške, All DMG s 0 % sa neukazuje.',
      'Môj účet: namiesto deads si zapíš svoj najvyšší acclaim, uvidíš ho v Prehľade účtu.',
    ],
    cs: [
      'Ikony jednotek mají barvy jako ve hře: pěchota modrá, jízda zelená, lučištníci červení – v návodech, u marchů i v Síni slávy. Krit na výbavě zůstává červený.',
      'Přehled účtu: All DMG má oranžovou hvězdu jako ve hře.',
      'Přehled účtu: z něj se už dá přepnout zpět na ostatní záložky Marche.',
      'Přehled účtu: marche jsou ve sloupcích zarovnané – formace a bonusy jsou vždy ve stejné výšce, All DMG s 0 % se neukazuje.',
      'Můj účet: místo deads si zapiš svůj nejvyšší acclaim, uvidíš ho v Přehledu účtu.',
    ],
  },
  {
    date: '2026-11-10',
    version: '1.65.0',
    sk: [
      'Marche: nová záložka Prehľad účtu – tvoj účet a všetky marche vedľa seba ako v hre, na širokom monitore až 7 v rade.',
      'Môj účet: zapíš si VIP level, kill points a deads (stačí 8.8B alebo 24M), uvidíš ich v Prehľade účtu.',
    ],
    cs: [
      'Marche: nová záložka Přehled účtu – tvůj účet a všechny marche vedle sebe jako ve hře, na širokém monitoru až 7 v řadě.',
      'Můj účet: zapiš si VIP level, kill points a deads (stačí 8.8B nebo 24M), uvidíš je v Přehledu účtu.',
    ],
  },
  {
    date: '2026-11-08',
    version: '1.64.3',
    sk: [
      'Sieň slávy: pri Ničiteľoch pevností je už len číslo, bez slova „pevností“ – na webe aj na Discorde.',
      'Sieň legiend: archivovaní Ničitelia pevností majú ako nadpis týždeň, za ktorý boli.',
    ],
    cs: [
      'Síň slávy: u Ničitelů pevností je už jen číslo, bez slova „pevností“ – na webu i na Discordu.',
      'Síň legend: archivovaní Ničitelé pevností mají jako nadpis týden, za který byli.',
    ],
  },
  {
    date: '2026-11-07',
    version: '1.64.0',
    sk: [
      'Sieň slávy: Ničitelia pevností až s piatimi menami a dátumom týždňa; nové poradie príde aj do Discord kanála sieň-slávy – prví traja vedľa seba, víťaz s avatarom.',
      'Sieň slávy: odchádzajúci týždeň sa uloží do Siene legiend aj s dátumom, nič sa nestratí.',
    ],
    cs: [
      'Síň slávy: Ničitelé pevností až s pěti jmény a datem týdne; nové pořadí přijde i do Discord kanálu sieň-slávy – první tři vedle sebe, vítěz s avatarem.',
      'Síň slávy: odcházející týden se uloží do Síně legend i s datem, nic se neztratí.',
    ],
  },
  {
    date: '2026-11-04',
    version: '1.62.0',
    sk: [
      'Úvod: pod O kráľovstve pribudla Múdrosť kráľovstva – screenshot z mapy, ktorý pozná každý z nás.',
      'Múdrosti kráľovstva môžeš dať like alebo srdiečko – stačí byť prihlásený.',
      'Požadovaný acclaim: kto má viac power, než unesú jeho marche, dostane prirážku – rovnakú za každý milión navyše, aj nad 105 M pri piatich marchoch.',
      'Vyhodnocovanie KvK pre vedenie: ručná úprava acclaimu je vidieť priamo v tabuľke vedľa požadovaného acclaimu.',
      'Vyhodnocovanie KvK pre vedenie: stĺpec a filter Minulé KvK nesplnil – takému hráčovi sa prirážka za power násobí.',
    ],
    cs: [
      'Úvod: pod O království přibyla Moudrost království – screenshot z mapy, který zná každý z nás.',
      'Moudrosti království můžeš dát like nebo srdíčko – stačí být přihlášený.',
      'Požadovaný acclaim: kdo má víc power, než unesou jeho marche, dostane přirážku – stejnou za každý milion navíc, i nad 105 M u pěti marchů.',
      'Vyhodnocování KvK pro vedení: ruční úprava acclaimu je vidět přímo v tabulce vedle požadovaného acclaimu.',
      'Vyhodnocování KvK pro vedení: sloupec a filtr Minulé KvK nesplnil – takovému hráči se přirážka za power násobí.',
    ],
  },
  {
    date: '2026-11-03',
    version: '1.60.0',
    sk: [
      'Hľadanie po celom webe: lupa v hlavičke (alebo kláves /) nájde stránky, návody, pojmy zo Slovníka, commanderov aj eventy.',
      'Prihláška na KvK: rozpísaná a neuložená sa už nestratí omylom – odkaz na inú stránku aj zatvorenie karty sa najprv opýtajú.',
      'Nové inscriptions Delty 2 majú rovnaké body ako Wedge 2 a Pincer 2 – zlaté 50, modré 30 a 20.',
      'Kalendár: hráč bez Discordu sa po prepojení s Discordom vráti rovno k eventu a nastaví si pripomienku.',
      'Nájdi pár pre commandera: presnejšia hláška, keď pár pre takého commandera v návodoch nemáme.',
      'Inscriptions sa počítajú po armamentoch: plné body sú 4 zlaté najvyššieho tieru, biela zlatú len doplní, nenahradí.',
      'Prihláška na KvK sa volá KvK rally / garrison – je len pre tých, čo chcú viesť rally alebo držať garrison.',
      'Pri výbave a armamentoch rally či garrisonu pribudlo Načítať z marchu – stačí upraviť, čo sa líši.',
      'Skóre výbavy a armamentov: 100 bodov je až všetko na maxime, armamenty už nevychádzajú vyššie, než majú.',
      'Sieň slávy: pod kútmi pribudla Sieň legiend – víťazi minulých KvK a týždňov, ktorých vedenie uložilo do archívu.',
      'Sieň slávy: nová zástava Najlepšia výbava – najlepší hráč na pechotu, jazdu a lukostrelcov podľa výbavy a armamentov naklikaných na webe.',
      'Marche a prihlášky na KvK: pod commandermi odkaz Návod k páru, alebo Páry pre commandera, ak tento pár v našich návodoch nie je.',
      'Výbava a armamenty: neuložené zmeny sa už nestratia omylom – Esc, krížik, Zrušiť aj zatvorenie karty sa najprv opýtajú.',
      'Požadovaný acclaim: Ivar so skillmi 5511 sa už počíta takmer ako plný pár.',
      'Armamenty: na jednom armamente je najviac jedna zlatá alebo modrá inscription, ďalšia len biela – ako v hre.',
      'March a prihláška na KvK uložené skôr s dvoma zlatými či modrými na jednom armamente sú červené a odkaz Oprav armamenty otvorí ten armament.',
    ],
    cs: [
      'Hledání po celém webu: lupa v hlavičce (nebo klávesa /) najde stránky, návody, pojmy ze Slovníku, commandery i eventy.',
      'Přihláška na KvK: rozepsaná a neuložená se už neztratí omylem – odkaz na jinou stránku i zavření karty se nejdřív zeptají.',
      'Nové inscriptions Delty 2 mají stejné body jako Wedge 2 a Pincer 2 – zlaté 50, modré 30 a 20.',
      'Kalendář: hráč bez Discordu se po propojení s Discordem vrátí rovnou k eventu a nastaví si připomínku.',
      'Najdi pár pro commandera: přesnější hláška, když pár pro takového commandera v návodech nemáme.',
      'Inscriptions se počítají po armamentech: plné body jsou 4 zlaté nejvyššího tieru, bílá zlatou jen doplní, nenahradí.',
      'Přihláška na KvK se jmenuje KvK rally / garrison – je jen pro ty, kdo chtějí vést rally nebo držet garrison.',
      'U výbavy a armamentů rally či garrisonu přibylo Načíst z marche – stačí upravit, co se liší.',
      'Skóre výbavy a armamentů: 100 bodů je až všechno na maximu, armamenty už nevycházejí výš, než mají.',
      'Síň slávy: pod koutky přibyla Síň legend – vítězové minulých KvK a týdnů, které vedení uložilo do archivu.',
      'Síň slávy: nový prapor Nejlepší výbava – nejlepší hráč na pěchotu, jízdu a lukostřelce podle výbavy a armamentů naklikaných na webu.',
      'Marche a přihlášky na KvK: pod commandery odkaz Návod k páru, nebo Páry pro commandera, pokud tento pár v našich návodech není.',
      'Výbava a armamenty: neuložené změny se už neztratí omylem – Esc, křížek, Zrušit i zavření karty se nejdřív zeptají.',
      'Požadovaný acclaim: Ivar se skilly 5511 se už počítá skoro jako plný pár.',
      'Armamenty: na jednom armamentu je nejvýš jedna zlatá nebo modrá inscription, další jen bílá – jako ve hře.',
      'March a přihláška na KvK uložené dřív se dvěma zlatými či modrými na jednom armamentu jsou červené a odkaz Oprav armamenty otevře ten armament.',
    ],
  },
  {
    date: '2026-11-02',
    version: '1.56.4',
    sk: [
      'Opravené: hráč prihlásený menom v hre a heslom (bez Discordu) už pošle prihlášku na KvK.',
      'Opravené: neschválený hráč už nemení prihlášky na KvK.',
    ],
    cs: [
      'Opraveno: hráč přihlášený jménem ve hře a heslem (bez Discordu) už odešle přihlášku na KvK.',
      'Opraveno: neschválený hráč už nemění přihlášky na KvK.',
    ],
  },
  {
    date: '2026-11-01',
    version: '1.56.1',
    sk: [
      'Armamenty sa naklikávajú ako v hre: formácia v strede, Scroll a Instrument hore, Emblem a Flag dole – ťukni na armament a vyber jeho inscriptions.',
      'Pri každej inscription na marchi je ikona jej armamentu, zoradené ako v hre.',
    ],
    cs: [
      'Armamenty se naklikávají jako ve hře: formace uprostřed, Scroll a Instrument nahoře, Emblem a Flag dole – ťukni na armament a vyber jeho inscriptions.',
      'U každé inscription na marchi je ikona jejího armamentu, seřazené jako ve hře.',
    ],
  },
  {
    date: '2026-10-30',
    version: '1.55.0',
    sk: [
      'March bez naklikanej výbavy alebo armamentov je červený ako march so zlým párom – hneď vidíš, čo doplniť.',
      'Pribudla táto stránka s novinkami.',
    ],
    cs: [
      'March bez naklikané výbavy nebo armamentů je červený jako march se špatným párem – hned vidíš, co doplnit.',
      'Přibyla tato stránka s novinkami.',
    ],
  },
  {
    date: '2026-10-29',
    version: '1.54.1',
    sk: [
      'Delta má nové armamenty z updatu 1.1.13 – 4 zlaté a 4 modré inscriptions na naklikanie.',
      'Prihlášky na KvK ukazujú vedeniu Top 5 podľa výbavy pri každom type jednotiek.',
      'Vedenie posiela vybrané oznámenia eventov do kanála na Discorde.',
      'Sieň slávy: kategória s najviac menami stojí v strede.',
    ],
    cs: [
      'Delta má nové armamenty z updatu 1.1.13 – 4 zlaté a 4 modré inscriptions k naklikání.',
      'Přihlášky na KvK ukazují vedení Top 5 podle výbavy u každého typu jednotek.',
      'Vedení posílá vybraná oznámení eventů do kanálu na Discordu.',
      'Síň slávy: kategorie s nejvíc jmény stojí uprostřed.',
    ],
  },
  {
    date: '2026-10-28',
    version: '1.53.0',
    sk: [
      'Nová Sieň slávy pre schválených hráčov – Ničiteľ pevností za týždeň, Top KP za KvK, Rally líder, Strážca garrisonu, Pomocná ruka, KvK Leader a kútik hanby.',
      'Vzhľad rytierskeho turnaja: zástavy na tribúne, štíty padlých a pavilón šašov.',
    ],
    cs: [
      'Nová Síň slávy pro schválené hráče – Ničitel pevností za týden, Top KP za KvK, Rally lídr, Strážce garrisonu, Pomocná ruka, KvK Leader a koutek hanby.',
      'Vzhled rytířského turnaje: korouhve na tribuně, štíty padlých a pavilon šašků.',
    ],
  },
  {
    date: '2026-10-27',
    version: '1.47.3',
    sk: [
      'Vlajky SK a CZ na hrade aj v prepínači jazyka.',
      'Marche otvoria najprv tvoje vlastné, marche ostatných sú na druhej záložke.',
    ],
    cs: [
      'Vlajky SK a CZ na hradě i v přepínači jazyka.',
      'Marche otevřou nejdřív tvoje vlastní, marche ostatních jsou na druhé záložce.',
    ],
  },
  {
    date: '2026-10-26',
    version: '1.47.1',
    sk: [
      'Fórum je širšie a dlhé príspevky sa čítajú pohodlnejšie.',
      'Požadovaný acclaim sa počíta podľa výsledkov minulého KvK.',
    ],
    cs: [
      'Fórum je širší a dlouhé příspěvky se čtou pohodlněji.',
      'Požadovaný acclaim se počítá podle výsledků minulého KvK.',
    ],
  },
  {
    date: '2026-10-25',
    version: '1.46.0',
    sk: [
      'Anonymné Fórum – vlákna pre všetkých, bez mena, s lajkami a odpoveďami na konkrétnu správu.',
      'Odpočet do začiatku KvK na úvodnej stránke.',
    ],
    cs: [
      'Anonymní Fórum – vlákna pro všechny, bez jména, s lajky a odpověďmi na konkrétní zprávu.',
      'Odpočet do začátku KvK na úvodní stránce.',
    ],
  },
  {
    date: '2026-10-24',
    version: '1.43.0',
    sk: [
      'Prihlášku na KvK vyplníš z vlastného marchu jedným výberom.',
      'Nový výpočet požadovaného acclaimu: power × počet marchov × kvalita.',
    ],
    cs: [
      'Přihlášku na KvK vyplníš z vlastního marche jedním výběrem.',
      'Nový výpočet požadovaného acclaimu: power × počet marchů × kvalita.',
    ],
  },
  {
    date: '2026-10-23',
    version: '1.41.1',
    sk: [
      'Požadovaný acclaim vidí každý schválený hráč.',
      'Vedenie vidí pri prihláškach na KvK najlepších hráčov podľa výbavy.',
    ],
    cs: [
      'Požadovaný acclaim vidí každý schválený hráč.',
      'Vedení vidí u přihlášek na KvK nejlepší hráče podle výbavy.',
    ],
  },
  {
    date: '2026-10-22',
    version: '1.39.0',
    sk: ['Na KvK sa môžeš prihlásiť dvakrát na rally a dvakrát na garrison – napríklad s dvoma rôznymi pármi.'],
    cs: ['Na KvK se můžeš přihlásit dvakrát na rally a dvakrát na garrison – třeba se dvěma různými páry.'],
  },
  {
    date: '2026-10-20',
    version: '1.38.0',
    sk: [
      'Prihláška na KvK má krátky dotazník – koľko dávaš do KvK a kedy si online.',
      'Vedenie filtruje prihlášky podľa času online.',
    ],
    cs: [
      'Přihláška na KvK má krátký dotazník – kolik dáváš do KvK a kdy jsi online.',
      'Vedení filtruje přihlášky podle času online.',
    ],
  },
  {
    date: '2026-10-19',
    version: '1.35.1',
    sk: [
      'Top 5 equip pre R4 – hráči s najlepšou výbavou na pechotu, jazdu a lukostrelcov.',
      'Preklep v bonusoch armamentov (nad 14 %, All DMG nad 8 %) svieti načerveno.',
    ],
    cs: [
      'Top 5 equip pro R4 – hráči s nejlepší výbavou na pěchotu, jízdu a lučištníky.',
      'Překlep v bonusech armamentů (nad 14 %, All DMG nad 8 %) svítí červeně.',
    ],
  },
  {
    date: '2026-10-18',
    version: '1.34.4',
    sk: ['Eventy majú typy (20 GH: Training Day…) aj s tým, čo treba na maximálnu odmenu – v kalendári aj v pripomienkach.'],
    cs: ['Eventy mají typy (20 GH: Training Day…) i s tím, co je potřeba na maximální odměnu – v kalendáři i v připomínkách.'],
  },
  {
    date: '2026-10-17',
    version: '1.33.0',
    sk: ['Prihlásenie aj bez Discordu – menom v hre a heslom.'],
    cs: ['Přihlášení i bez Discordu – jménem ve hře a heslem.'],
  },
  {
    date: '2026-10-16',
    version: '1.32.3',
    sk: [
      'Vyhodnocovanie KvK počíta tvoje najsilnejšie marche, nie prvé v poradí – silný march na konci zoznamu sa už nestratí.',
    ],
    cs: [
      'Vyhodnocování KvK počítá tvé nejsilnější marche, ne první v pořadí – silný march na konci seznamu se už neztratí.',
    ],
  },
  {
    date: '2026-10-14',
    version: '1.32.2',
    sk: [
      'Poradie vlastných marchov a veta, koľko z nich sa počíta do vyhodnocovania KvK.',
      'Zlý pár commanderov alebo formácia svieti načerveno a bot ti napíše, čo opraviť.',
      'Vedenie zverejňuje požadovaný acclaim – každý vidí, koľko sa od neho na KvK čaká.',
      'Po schválení ti bot pošle správu, že môžeš pridať marche a prihlášku na KvK.',
      'Aktuálnu power si zapíšeš na Môj účet.',
    ],
    cs: [
      'Pořadí vlastních marchů a věta, kolik z nich se počítá do vyhodnocování KvK.',
      'Špatný pár commanderů nebo formace svítí červeně a bot ti napíše, co opravit.',
      'Vedení zveřejňuje požadovaný acclaim – každý vidí, kolik se od něj na KvK čeká.',
      'Po schválení ti bot pošle zprávu, že můžeš přidat marche a přihlášku na KvK.',
      'Aktuální power si zapíšeš na Můj účet.',
    ],
  },
  {
    date: '2026-10-13',
    version: '1.26.1',
    sk: ['Karty marchov sú kompaktnejšie, všetky čísla ukáže tlačidlo Detail.'],
    cs: ['Karty marchů jsou kompaktnější, všechna čísla ukáže tlačítko Detail.'],
  },
  {
    date: '2026-10-12',
    version: '1.24.5',
    sk: [
      'Výbavu a armamenty marchu si naklikáš – predmety s critom a iconic, formácie aj inscriptions.',
      'Prihláška na KvK sa vypĺňa rovnako ako march, bez screenshotov.',
      'Nových hráčov schvaľuje vedenie, potom pridajú marche a prihlášku na KvK; raz potvrdíš podmienky používania.',
      'Skilly commanderov pri marchi (expertise alebo napr. 5111).',
    ],
    cs: [
      'Výbavu a armamenty marche si naklikáš – předměty s critem a iconic, formace i inscriptions.',
      'Přihláška na KvK se vyplňuje stejně jako march, bez screenshotů.',
      'Nové hráče schvaluje vedení, pak přidají marche a přihlášku na KvK; jednou potvrdíš podmínky používání.',
      'Skilly commanderů u marche (expertise nebo např. 5111).',
    ],
  },
  {
    date: '2026-10-11',
    version: '1.18.10',
    sk: [
      'Prihláška na KvK a Marche hráčov na porovnanie.',
      'Na KvK sa prihlásiš na rally aj garrison zvlášť; prihláška platí, kým ju nezrušíš.',
      'Vyberieš si, či tvoje marche vidia všetci hráči, alebo len vedenie.',
      'Meno v hre je povinné – web ťa po prvom prihlásení pošle nastaviť si ho.',
      'Budíky – bot ti pripomenie štít či čokoľvek iné.',
      'Kalkulačka pasov na migráciu a Slovník pojmov.',
      'Hľadanie v návodoch a „Čo môžem postaviť“ z commanderov, ktorých máš.',
    ],
    cs: [
      'Přihláška na KvK a Marche hráčů k porovnání.',
      'Na KvK se přihlásíš na rally i garrison zvlášť; přihláška platí, dokud ji nezrušíš.',
      'Vybereš si, jestli tvoje marche vidí všichni hráči, nebo jen vedení.',
      'Jméno ve hře je povinné – web tě po prvním přihlášení pošle nastavit si ho.',
      'Budíky – bot ti připomene štít nebo cokoli jiného.',
      'Kalkulačka pasů na migraci a Slovník pojmů.',
      'Hledání v návodech a „Co můžu postavit“ z commanderů, které máš.',
    ],
  },
  {
    date: '2026-10-10',
    version: '1.6.3',
    sk: [
      'Odber kalendára eventov do mobilu (Google, iPhone, Outlook).',
      'Rozcestník návodov, hľadanie páru pre commandera a nová kategória Tipy a triky.',
      'Herné eventy pripomíname deň vopred o 18:00, nie v noci.',
    ],
    cs: [
      'Odběr kalendáře eventů do mobilu (Google, iPhone, Outlook).',
      'Rozcestník návodů, hledání páru pro commandera a nová kategorie Tipy a triky.',
      'Herní eventy připomínáme den předem v 18:00, ne v noci.',
    ],
  },
  {
    date: '2026-10-09',
    version: '1.1.1',
    sk: ['Prvá očíslovaná verzia webu – kalendár eventov, pripomienky od bota na Discorde, návody a stránka O nás.'],
    cs: ['První očíslovaná verze webu – kalendář eventů, připomínky od bota na Discordu, návody a stránka O nás.'],
  },
];
