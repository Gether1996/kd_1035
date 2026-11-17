/**
 * Texts of /hraci – SK and CZ side by side like the evaluation's, out of sk.ts/cs.ts: only the superadmin ever sees
 * them, and the initial bundle (both dictionaries) was over its budget (18. 11. 2026).
 */
export const PLAYERS_TEXTS = {
  sk: {
    title: 'Hráči',
    eyebrow: 'Superadmin',
    onlySuperuser: 'Zoznam hráčov vidí iba superadmin.',
    lead: 'Nového hráča schváľ – až potom pridá marche a prihlášku na KvK a uvidí marche ostatných. R4 vidí všetky prihlášky aj marche.',
    search: 'Hľadať hráča',
    auto: 'Schvaľovať automaticky',
    autoOn: 'Nový hráč je schválený hneď, správa na Discord nepríde. Kto už čaká, ostáva na schválenie.',
    autoOff: 'Nového hráča schvaľuješ ty, o každom ti príde správa na Discord.',
    powerLock: 'Zamknúť power',
    powerLockOn: 'Hráči si power nezmenia, vo vyhodnocovaní ju zapisuje vedenie.',
    powerLockOff: 'Hráči si power menia na Môj účet.',
    // the switches of a player – short names in the row, the legend above the list explains them
    legend: 'Čo znamenajú prepínače',
    flags: {
      approved: {
        short: 'Schválený',
        label: 'Schválený – pridáva marche a prihlášky na KvK',
        tip: 'Pridáva marche a prihlášky na KvK, vidí marche ostatných hráčov a zverejnený požadovaný acclaim.',
      },
      reviewer: {
        short: 'R4',
        label: 'R4 – vidí prihlášky',
        tip: 'Vidí všetky prihlášky na KvK a marche všetkých hráčov.',
      },
      // the KvK evaluation (/vyhodnocovanie, Gether 14. 10. 2026): the evaluation itself, and its published result
      evaluation_settings: {
        short: 'Vyh. nastavenia',
        label: 'Nastavenia vyhodnocovania – odhad acclaimu a premenné',
        tip: 'Nastavenia vyhodnocovania: vidí odhad acclaimu schválených hráčov a ich marche, zapisuje im power a T4, mení premenné, páry a formácie commanderov (platí pre všetkých) a zverejňuje požadovaný acclaim.',
      },
      // yellow cards on /priestupky (Gether 18. 11. 2026)
      violations_manager: {
        short: 'Priestupky',
        label: 'Priestupky',
        tip: 'Pridáva a maže žlté karty hráčov.',
      },
      // hidden in the list until "Zobraziť neaktívnych" (Gether 20. 10. 2026) – nothing else
      inactive: {
        short: 'Neaktívny',
        label: 'Neaktívny – skrytý v zozname',
        tip: 'Neaktívneho hráča v zozname nevidíš, kým nezapneš „Zobraziť neaktívnych“. Na nič iné to nemá vplyv – schválenie, R4 aj marche ostávajú a hráč je ďalej v prihláškach na KvK aj v Top 5 equip.',
      },
    },
    // R4 and the evaluation switches of a row that is not approved: kept, but they count only once approved
    flagsInactive: 'Neplatí, kým nie je schválený',
    superuser: 'superadmin',
    since: 'od {date}',
    pending: 'Čaká',
    showInactive: 'Zobraziť neaktívnych',
    inactiveTag: 'neaktívny',
    // a player without Discord (Gether 17. 10. 2026): a one-off code for a new password, delete one waiting
    local: {
      tag: 'bez Discordu',
      code: 'Kód na nové heslo',
      codeIs: 'Kód:',
      until: 'platí do {date}, raz. Pošli mu ho v hre alebo správou.',
      delete: 'Zmazať',
      confirm: 'Naozaj zmazať?',
    },
    filters: {
      all: 'Všetci',
      approval: 'Schválenie',
      approved: 'Schválení',
      pending: 'Čakajú',
    },
    // sorting and filters like on /marche (Gether 13. 10. 2026); the players waiting for the approval stay on top
    sort: 'Zoradiť',
    sorts: { name: 'Meno', newest: 'Najnovší', login: 'Naposledy prihlásení', marches: 'Počet marchov' },
    marchFilter: 'Marche',
    marchFilters: { all: 'Marche: všetci', with: 'S marchmi', without: 'Bez marchov', fix: 'Na opravu' },
    // by the switches (Gether 14. 10. 2026) – the superadmin is only under "všetci"
    access: 'Prístup',
    accessFilters: {
      all: 'Prístup: všetci',
      r4: 'R4',
      evaluation_settings: 'Vyh. nastavenia',
      violations_manager: 'Priestupky',
      none: 'Bez prístupu',
    },
    kvkFilter: 'KvK rally / garrison',
    kvkFilters: {
      all: 'KvK: všetci',
      any: 'Prihlásení na KvK',
      rally: 'Rally',
      garrison: 'Garrison',
      none: 'Bez rally / garrison',
    },
    lastLogin: 'naposledy {date}',
    marchCount: ['{n} march', '{n} marche', '{n} marchov'],
    kvk: 'KvK {roles}',
    // the player's marches red on /marche
    issues: 'na opravu: {n}',
    issuesHint: 'nesprávny pár, formácia alebo bonusy armamentov pre vyhodnocovanie KvK',
    noMatch: 'Takého hráča tu nemáme.',
    empty: 'Zatiaľ sa neprihlásil žiadny hráč.',
    loadError: 'Hráčov sa nepodarilo načítať.',
    failed: 'Zmenu sa nepodarilo uložiť. Skús to znova.',
  },
  cs: {
    title: 'Hráči',
    eyebrow: 'Superadmin',
    onlySuperuser: 'Seznam hráčů vidí jen superadmin.',
    lead: 'Nového hráče schval – až pak přidá marche a přihlášku na KvK a uvidí marche ostatních. R4 vidí všechny přihlášky i marche.',
    search: 'Hledat hráče',
    auto: 'Schvalovat automaticky',
    autoOn: 'Nový hráč je schválený hned, zpráva na Discord nepřijde. Kdo už čeká, zůstává ke schválení.',
    autoOff: 'Nového hráče schvaluješ ty, o každém ti přijde zpráva na Discord.',
    powerLock: 'Zamknout power',
    powerLockOn: 'Hráči si power nezmění, ve vyhodnocování ji zapisuje vedení.',
    powerLockOff: 'Hráči si power mění na Můj účet.',
    legend: 'Co znamenají přepínače',
    flags: {
      approved: {
        short: 'Schválený',
        label: 'Schválený – přidává marche a přihlášky na KvK',
        tip: 'Přidává marche a přihlášky na KvK, vidí marche ostatních hráčů a zveřejněný požadovaný acclaim.',
      },
      reviewer: {
        short: 'R4',
        label: 'R4 – vidí přihlášky',
        tip: 'Vidí všechny přihlášky na KvK a marche všech hráčů.',
      },
      evaluation_settings: {
        short: 'Vyh. nastavení',
        label: 'Nastavení vyhodnocování – odhad acclaimu a proměnné',
        tip: 'Nastavení vyhodnocování: vidí odhad acclaimu schválených hráčů a jejich marche, zapisuje jim power a T4, mění proměnné, páry a formace commanderů (platí pro všechny) a zveřejňuje požadovaný acclaim.',
      },
      violations_manager: {
        short: 'Přestupky',
        label: 'Přestupky',
        tip: 'Přidává a maže žluté karty hráčů.',
      },
      inactive: {
        short: 'Neaktivní',
        label: 'Neaktivní – skrytý v seznamu',
        tip: 'Neaktivního hráče v seznamu nevidíš, dokud nezapneš „Zobrazit neaktivní“. Na nic jiného to nemá vliv – schválení, R4 i marche zůstávají a hráč je dál v přihláškách na KvK i v Top 5 equip.',
      },
    },
    // R4 and the evaluation switches of a row that is not approved: kept, but they count only once approved
    flagsInactive: 'Neplatí, dokud není schválený',
    superuser: 'superadmin',
    since: 'od {date}',
    pending: 'Čeká',
    showInactive: 'Zobrazit neaktivní',
    inactiveTag: 'neaktivní',
    // a player without Discord (Gether 17. 10. 2026): a one-off code for a new password, delete one waiting
    local: {
      tag: 'bez Discordu',
      code: 'Kód na nové heslo',
      codeIs: 'Kód:',
      until: 'platí do {date}, jednou. Pošli mu ho ve hře nebo zprávou.',
      delete: 'Smazat',
      confirm: 'Opravdu smazat?',
    },
    filters: {
      all: 'Všichni',
      approval: 'Schválení',
      approved: 'Schválení',
      pending: 'Čekají',
    },
    // sorting and filters like on /marche (Gether 13. 10. 2026); the players waiting for the approval stay on top
    sort: 'Seřadit',
    sorts: { name: 'Jméno', newest: 'Nejnovější', login: 'Naposledy přihlášení', marches: 'Počet marchů' },
    marchFilter: 'Marche',
    marchFilters: { all: 'Marche: všichni', with: 'S marchi', without: 'Bez marchů', fix: 'K opravě' },
    // by the switches (Gether 14. 10. 2026) – the superadmin is only under "všichni"
    access: 'Přístup',
    accessFilters: {
      all: 'Přístup: všichni',
      r4: 'R4',
      evaluation_settings: 'Vyh. nastavení',
      violations_manager: 'Přestupky',
      none: 'Bez přístupu',
    },
    kvkFilter: 'KvK rally / garrison',
    kvkFilters: {
      all: 'KvK: všichni',
      any: 'Přihlášení na KvK',
      rally: 'Rally',
      garrison: 'Garrison',
      none: 'Bez rally / garrison',
    },
    lastLogin: 'naposledy {date}',
    marchCount: ['{n} march', '{n} marche', '{n} marchů'],
    kvk: 'KvK {roles}',
    // the player's marches red on /marche
    issues: 'k opravě: {n}',
    issuesHint: 'nesprávný pár, formace nebo bonusy armamentů pro vyhodnocování KvK',
    noMatch: 'Takového hráče tu nemáme.',
    empty: 'Zatím se nepřihlásil žádný hráč.',
    loadError: 'Hráče se nepodařilo načíst.',
    failed: 'Změnu se nepodařilo uložit. Zkus to znovu.',
  },
};

export type PlayersTexts = (typeof PLAYERS_TEXTS)['sk'];
