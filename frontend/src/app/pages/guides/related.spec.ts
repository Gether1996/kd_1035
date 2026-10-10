import { GuideCategory } from '../../core/i18n/i18n';
import { relatedGuides } from './related';

describe('relatedGuides', () => {
  const g = (slug: string, category: GuideCategory, specialty: '' | 'cavalry' | 'infantry' | 'garrison' = '') => ({
    slug,
    category,
    specialty,
  });
  // the list API order: category, then the admin's order
  const all = [
    g('ako-skladat-pary-commanderov', 'commanderi'),
    g('pary-pre-jazdu', 'commanderi', 'cavalry'),
    g('pary-pre-pechotu', 'commanderi', 'infantry'),
    g('pary-pre-garrison', 'commanderi', 'garrison'),
    g('kalendar-eventov', 'eventy'),
    g('mightiest-governor-mge', 'eventy'),
    g('ark-of-osiris', 'eventy'),
    g('priprava-na-kvk', 'eventy'),
    g('zaklady-vybavy', 'vybava'),
    g('vybava-pre-jazdu', 'vybava', 'cavalry'),
    g('vybava-pre-pechotu', 'vybava', 'infantry'),
  ];
  const slugs = (current: ReturnType<typeof g>, max?: number) => relatedGuides(current, all, max).map((r) => r.slug);

  it('puts the same specialty first, then the same category in the API order', () => {
    expect(slugs(all[1])).toEqual(['vybava-pre-jazdu', 'ako-skladat-pary-commanderov', 'pary-pre-pechotu']);
    expect(slugs(all[9])).toEqual(['pary-pre-jazdu', 'zaklady-vybavy', 'vybava-pre-pechotu']);
  });

  it('never lists the guide itself and keeps at most `max`', () => {
    expect(slugs(all[1], 10)).not.toContain('pary-pre-jazdu');
    expect(slugs(all[1], 10)).toHaveLength(4);
    expect(slugs(all[1], 1)).toEqual(['vybava-pre-jazdu']);
  });

  it('ranks a guide without a specialty by its category only', () => {
    // '' never matches another guide without a specialty in another category
    expect(slugs(all[5])).toEqual(['kalendar-eventov', 'ark-of-osiris', 'priprava-na-kvk']);
    expect(slugs(all[0])).toEqual(['pary-pre-jazdu', 'pary-pre-pechotu', 'pary-pre-garrison']);
  });

  it('leaves out guides with nothing in common', () => {
    const lonely = [g('tip', 'tipy'), ...all];
    expect(relatedGuides(lonely[0], lonely)).toEqual([]);
    // the same specialty is enough across categories
    expect(slugs(g('pary-pre-garrison-2', 'tipy', 'garrison'))).toEqual(['pary-pre-garrison']);
  });
});
