import { GuideCategory } from '../../core/i18n/i18n';

export type TermGroup = 'kingdom' | 'battle' | 'account' | 'alliance';

export interface Term {
  /** the anchor: /slovnik#kvk */
  id: string;
  /** as players write it */
  term: string;
  /** the Czech form when it differs (Migrácia / Migrace) */
  termCs?: string;
  /** what the abbreviation stands for (English, as in the game) */
  full?: string;
  group: TermGroup;
  sk: string;
  cs: string;
  guide?: { category: GuideCategory; slug: string };
}

/**
 * The glossary of /slovnik. It lives in the page's own chunk, not in sk.ts/cs.ts – the initial bundle has a budget
 * (angular.json) and every page would load it. Game terms stay as players use them (CLAUDE.md); both languages are
 * kept side by side and a test checks none is empty.
 */
export const TERMS: Term[] = [
  // ---------------------------------------------------------------- kingdom and events
  {
    id: 'kd',
    term: 'KD',
    full: 'Kingdom',
    group: 'kingdom',
    sk: 'Kráľovstvo – herný server s vlastným číslom. Naše je KD 1035.',
    cs: 'Království – herní server s vlastním číslem. Naše je KD 1035.',
  },
  {
    id: 'kvk',
    term: 'KvK',
    full: 'Kingdom versus Kingdom',
    group: 'kingdom',
    sk: 'Sezóna, v ktorej proti sebe na spoločnej mape bojuje niekoľko kráľovstiev.',
    cs: 'Sezóna, ve které proti sobě na společné mapě bojuje několik království.',
    guide: { category: 'eventy', slug: 'priprava-na-kvk' },
  },
  {
    id: 'soc',
    term: 'SoC',
    full: 'Season of Conquest',
    group: 'kingdom',
    sk: 'Neskoršie KvK sezóny s vlastnými pravidlami a mapami.',
    cs: 'Pozdější KvK sezóny s vlastními pravidly a mapami.',
    guide: { category: 'eventy', slug: 'season-of-conquest' },
  },
  {
    id: 'mge',
    term: 'MGE',
    full: 'Mightiest Governor Event',
    group: 'kingdom',
    sk: 'Súťaž o body, v ktorej najlepší hráči získajú sochy commandera.',
    cs: 'Soutěž o body, ve které nejlepší hráči získají sochy commandera.',
    guide: { category: 'eventy', slug: 'mightiest-governor-mge' },
  },
  {
    id: 'aoo',
    term: 'AoO',
    full: 'Ark of Osiris',
    group: 'kingdom',
    sk: 'Aliančný event 30 na 30 hráčov o archu na samostatnej mape.',
    cs: 'Alianční event 30 na 30 hráčů o archu na samostatné mapě.',
    guide: { category: 'eventy', slug: 'ark-of-osiris' },
  },
  {
    id: 'mtg',
    term: 'MTG',
    full: 'More Than Gems',
    group: 'kingdom',
    sk: 'Event, v ktorom za minuté gemy dostaneš odmeny navyše.',
    cs: 'Event, ve kterém za utracené gemy dostaneš odměny navíc.',
    guide: { category: 'eventy', slug: 'more-than-gems' },
  },
  {
    id: 'wof',
    term: 'WoF',
    full: 'Wheel of Fortune',
    group: 'kingdom',
    sk: 'Koleso šťastia – za gemy točíš o sochy legendárneho commandera.',
    cs: 'Kolo štěstí – za gemy točíš o sochy legendárního commandera.',
    guide: { category: 'eventy', slug: 'wheel-of-fortune' },
  },
  {
    id: 'gh',
    term: 'GH',
    full: 'Gold Heads',
    group: 'kingdom',
    sk: 'Zlaté hlavy – sochy legendárnych commanderov.',
    cs: 'Zlaté hlavy – sochy legendárních commanderů.',
  },
  {
    id: 'utc',
    term: 'UTC',
    group: 'kingdom',
    sk: 'Herný čas. Denný reset a začiatok eventov sú o 00:00 UTC, u nás o 01:00 v zime a 02:00 v lete.',
    cs: 'Herní čas. Denní reset a začátek eventů jsou v 00:00 UTC, u nás v 01:00 v zimě a 02:00 v létě.',
  },
  {
    id: 'migracia',
    term: 'Migrácia',
    termCs: 'Migrace',
    full: 'Migration',
    group: 'kingdom',
    sk: 'Presun účtu do iného kráľovstva za pasy (Passport Pages). Ich počet závisí od sily účtu.',
    cs: 'Přesun účtu do jiného království za pasy (Passport Pages). Jejich počet závisí na síle účtu.',
    guide: { category: 'tipy', slug: 'pred-migraciou' },
  },

  // ---------------------------------------------------------------- battle
  {
    id: 'rally',
    term: 'Rally',
    group: 'battle',
    sk: 'Spoločný útok viacerých hráčov pod vedením jedného rally leadera, napr. na pevnosť alebo mesto.',
    cs: 'Společný útok více hráčů pod vedením jednoho rally leadera, např. na pevnost nebo město.',
    guide: { category: 'commanderi', slug: 'pary-pre-rally' },
  },
  {
    id: 'garrison',
    term: 'Garrison',
    group: 'battle',
    sk: 'Obrana mesta alebo aliančnej budovy. Do garrisonu posielajú spojenci svoje jednotky.',
    cs: 'Obrana města nebo alianční budovy. Do garrisonu posílají spojenci své jednotky.',
    guide: { category: 'commanderi', slug: 'pary-pre-garrison' },
  },
  {
    id: 'march',
    term: 'March',
    group: 'battle',
    sk: 'Jedna armáda na mape – primárny a sekundárny commander s jednotkami.',
    cs: 'Jedna armáda na mapě – primární a sekundární commander s jednotkami.',
    guide: { category: 'commanderi', slug: 'ako-skladat-pary-commanderov' },
  },
  {
    id: 'open-field',
    term: 'Open field',
    group: 'battle',
    sk: 'Boj na voľnej mape, mimo miest a budov.',
    cs: 'Boj na volné mapě, mimo měst a budov.',
  },
  {
    id: 'rage',
    term: 'Rage',
    group: 'battle',
    sk: 'Energia commandera v boji. Keď sa naplní, commander použije aktívny skill.',
    cs: 'Energie commandera v boji. Když se naplní, commander použije aktivní skill.',
  },
  {
    id: 'skill',
    term: 'Skill',
    group: 'battle',
    sk: 'Schopnosť commandera. Vylepšuje sa sochami, „5-5-5-5“ znamená všetky štyri skilly na maxime.',
    cs: 'Schopnost commandera. Vylepšuje se sochami, „5-5-5-5“ znamená všechny čtyři skilly na maximu.',
  },
  {
    id: 'combo',
    term: 'Combo',
    group: 'battle',
    sk: 'Dvojica commanderov, ktorých skilly sa dobre dopĺňajú.',
    cs: 'Dvojice commanderů, jejichž skilly se dobře doplňují.',
  },
  {
    id: 'tier',
    term: 'T1–T5',
    full: 'Tier',
    group: 'battle',
    sk: 'Úroveň jednotiek. T5 sú najsilnejšie, T4 sú bežný základ armády.',
    cs: 'Úroveň jednotek. T5 jsou nejsilnější, T4 jsou běžný základ armády.',
  },
  {
    id: 'kp',
    term: 'KP',
    full: 'Kill Points',
    group: 'battle',
    sk: 'Body za zabité jednotky nepriateľa. Za vyšší tier je viac bodov.',
    cs: 'Body za zabité jednotky nepřítele. Za vyšší tier je víc bodů.',
  },
  {
    id: 'deads',
    term: 'Deads',
    group: 'battle',
    sk: 'Jednotky, ktoré ti v boji zomreli – napr. keď sa ťažko zranení nezmestili do nemocnice.',
    cs: 'Jednotky, které ti v boji zemřely – např. když se těžce zranění nevešli do nemocnice.',
  },
  {
    id: 'dkp',
    term: 'DKP',
    full: 'Dead + Kill Points',
    group: 'battle',
    sk: 'Výkon hráča v KvK spočítaný z KP a deads. Vzorec a požiadavky určuje kráľovstvo.',
    cs: 'Výkon hráče v KvK spočítaný z KP a deads. Vzorec a požadavky určuje království.',
  },
  {
    id: 'zero',
    term: 'Zero',
    group: 'battle',
    sk: 'Vynulovať hráča – zničiť mu takmer všetky jednotky.',
    cs: 'Vynulovat hráče – zničit mu téměř všechny jednotky.',
  },
  {
    id: 'shield',
    term: 'Shield',
    group: 'battle',
    sk: 'Štít mieru – kým platí, na tvoje mesto nikto nezaútočí ani ho nepreskúma.',
    cs: 'Štít míru – dokud platí, na tvé město nikdo nezaútočí ani ho neprozkoumá.',
  },

  // ---------------------------------------------------------------- account and players
  {
    id: 'ch',
    term: 'CH',
    full: 'City Hall',
    group: 'account',
    sk: 'Radnica – hlavná budova mesta, jej úroveň (CH1–CH25) odomyká ostatné budovy.',
    cs: 'Radnice – hlavní budova města, její úroveň (CH1–CH25) odemyká ostatní budovy.',
  },
  {
    id: 'vip',
    term: 'VIP',
    group: 'account',
    sk: 'Úroveň VIP dáva trvalé bonusy a dennú truhlicu. Zvyšuje sa VIP bodmi.',
    cs: 'Úroveň VIP dává trvalé bonusy a denní truhlu. Zvyšuje se VIP body.',
  },
  {
    id: 'ap',
    term: 'AP',
    full: 'Action Points',
    group: 'account',
    sk: 'Akčné body na útoky na barbarov a ich pevnosti. Postupne sa dopĺňajú.',
    cs: 'Akční body na útoky na barbary a jejich pevnosti. Postupně se doplňují.',
    guide: { category: 'commanderi', slug: 'pary-na-barbarov-a-pevnosti' },
  },
  {
    id: 'speedup',
    term: 'Speedup',
    group: 'account',
    sk: 'Zrýchlenie stavby, výskumu, výcviku alebo liečenia. Univerzálne platia na všetko.',
    cs: 'Zrychlení stavby, výzkumu, výcviku nebo léčení. Univerzální platí na všechno.',
    guide: { category: 'tipy', slug: 'speedupy-ktore-hraci-prehliadaju' },
  },
  {
    id: 'f2p',
    term: 'F2P',
    full: 'Free to Play',
    group: 'account',
    sk: 'Hráč, ktorý do hry neinvestuje peniaze. Opak je P2W alebo „whale“ (veľryba).',
    cs: 'Hráč, který do hry neinvestuje peníze. Opak je P2W nebo „whale“ (velryba).',
    guide: { category: 'commanderi', slug: 'pary-pre-f2p-a-zaciatok' },
  },
  {
    id: 'farm',
    term: 'Farm',
    group: 'account',
    sk: 'Vedľajší účet hráča, ktorý zbiera suroviny pre hlavný účet (main).',
    cs: 'Vedlejší účet hráče, který sbírá suroviny pro hlavní účet (main).',
  },
  {
    id: 'primary-secondary',
    term: 'Primary / secondary',
    group: 'account',
    sk: 'Primárny commander vedie armádu a dáva jej talenty, sekundárny pridáva svoje skilly.',
    cs: 'Primární commander vede armádu a dává jí talenty, sekundární přidává své skilly.',
    guide: { category: 'commanderi', slug: 'ako-skladat-pary-commanderov' },
  },
  {
    id: 'equipment',
    term: 'Equipment',
    group: 'account',
    sk: 'Výbava commandera, ktorú vyrobíš v kováčovi (Blacksmith) z materiálov.',
    cs: 'Výbava commandera, kterou vyrobíš v kovárně (Blacksmith) z materiálů.',
    guide: { category: 'vybava', slug: 'zaklady-vybavy-a-craftovania' },
  },

  // ---------------------------------------------------------------- alliance
  {
    id: 'r4',
    term: 'R1–R5',
    full: 'Rank',
    group: 'alliance',
    sk: 'Hodnosti v aliancii. R5 je vodca, R4 sú dôstojníci, ktorí riadia alianciu s ním.',
    cs: 'Hodnosti v alianci. R5 je vůdce, R4 jsou důstojníci, kteří s ním řídí alianci.',
  },
  {
    id: 'flag',
    term: 'Flag',
    group: 'alliance',
    sk: 'Aliančná vlajka – rozširuje územie aliancie.',
    cs: 'Alianční vlajka – rozšiřuje území aliance.',
  },
  {
    id: 'holy-sites',
    term: 'Holy sites',
    group: 'alliance',
    sk: 'Sväté miesta na mape, ktorých obsadenie dáva bonusy celému kráľovstvu alebo aliancii.',
    cs: 'Svatá místa na mapě, jejichž obsazení dává bonusy celému království nebo alianci.',
  },
  {
    id: 'pass',
    term: 'Pass',
    group: 'alliance',
    sk: 'Priesmyk medzi oblasťami mapy. Kým ho aliancia neobsadí, ďalej sa nedostaneš.',
    cs: 'Průsmyk mezi oblastmi mapy. Dokud ho aliance neobsadí, dál se nedostaneš.',
  },
  {
    id: 'teleport',
    term: 'Teleport',
    group: 'alliance',
    sk: 'Presun mesta na iné miesto mapy, napr. k aliancii (Territory Teleport) alebo kamkoľvek (Advanced Teleport).',
    cs: 'Přesun města na jiné místo mapy, např. k alianci (Territory Teleport) nebo kamkoli (Advanced Teleport).',
  },
];
