import { cs } from './cs';
import { parseUrl } from './i18n';
import { sk } from './sk';

describe('parseUrl', () => {
  it('maps addresses to language and page', () => {
    expect(parseUrl('/')).toEqual({ lang: 'sk', page: 'home' });
    expect(parseUrl('/#guides')).toEqual({ lang: 'sk', page: 'home' });
    expect(parseUrl('/o-nas')).toEqual({ lang: 'sk', page: 'about' });
    expect(parseUrl('/cz')).toEqual({ lang: 'cs', page: 'home' });
    expect(parseUrl('/cz/')).toEqual({ lang: 'cs', page: 'home' });
    expect(parseUrl('/cz/o-nas?ref=fb')).toEqual({ lang: 'cs', page: 'about' });
    expect(parseUrl('/czech')).toEqual({ lang: 'sk', page: 'home' });
  });
});

describe('dictionaries', () => {
  // same keys and the same number of list items in both languages
  const shape = (value: unknown): unknown =>
    typeof value === 'object' && value !== null
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
      : typeof value;

  it('SK and CZ have identical structure', () => {
    expect(shape(cs)).toEqual(shape(sk));
  });

  it('have no empty texts', () => {
    const texts = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Object.values(value as object).flatMap(texts);
    for (const dict of [sk, cs]) {
      expect(texts(dict).filter((t) => !t.trim())).toEqual([]);
    }
  });
});
