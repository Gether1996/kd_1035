import { Lang } from '../../core/i18n/i18n';

/** The texts of the site search – loaded with it, not in the dictionaries of the initial bundle (like the glossary) */
export const SEARCH_TEXTS = {
  sk: {
    title: 'Hľadať na webe',
    placeholder: 'Napr. MGE, Attila, rally, kalendár',
    hint: 'Napíš aspoň dva znaky. Šípkami sa pohybuješ vo výsledkoch.',
    loading: 'Načítavam…',
    none: 'Nič sme nenašli.',
    close: 'Zavrieť',
    commanderDetail: 'Páry v našich návodoch',
    groups: { pages: 'Stránky', guides: 'Návody', glossary: 'Slovník pojmov', commanders: 'Commanderi', events: 'Eventy' },
  },
  cs: {
    title: 'Hledat na webu',
    placeholder: 'Např. MGE, Attila, rally, kalendář',
    hint: 'Napiš aspoň dva znaky. Šipkami se pohybuješ ve výsledcích.',
    loading: 'Načítám…',
    none: 'Nic jsme nenašli.',
    close: 'Zavřít',
    commanderDetail: 'Páry v našich návodech',
    groups: { pages: 'Stránky', guides: 'Návody', glossary: 'Slovník pojmů', commanders: 'Commandeři', events: 'Eventy' },
  },
} satisfies Record<Lang, unknown>;
