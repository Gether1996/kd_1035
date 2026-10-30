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
    date: '2026-10-14',
    version: '1.32.2',
    sk: [
      'Poradie vlastných marchov a veta, koľko z nich sa počíta do vyhodnocovania KvK.',
      'Zlý pár commanderov alebo formácia svieti načerveno a bot ti napíše, čo opraviť.',
      'Aktuálnu power si zapíšeš na Môj účet.',
    ],
    cs: [
      'Pořadí vlastních marchů a věta, kolik z nich se počítá do vyhodnocování KvK.',
      'Špatný pár commanderů nebo formace svítí červeně a bot ti napíše, co opravit.',
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
      'Skilly commanderov pri marchi (expertise alebo napr. 5111).',
    ],
    cs: [
      'Výbavu a armamenty marche si naklikáš – předměty s critem a iconic, formace i inscriptions.',
      'Přihláška na KvK se vyplňuje stejně jako march, bez screenshotů.',
      'Skilly commanderů u marche (expertise nebo např. 5111).',
    ],
  },
  {
    date: '2026-10-11',
    version: '1.18.10',
    sk: [
      'Prihláška na KvK a Marche hráčov na porovnanie.',
      'Budíky – bot ti pripomenie štít či čokoľvek iné.',
      'Kalkulačka pasov na migráciu a Slovník pojmov.',
      'Hľadanie v návodoch a „Čo môžem postaviť“ z commanderov, ktorých máš.',
    ],
    cs: [
      'Přihláška na KvK a Marche hráčů k porovnání.',
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
