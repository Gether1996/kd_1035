import { cs } from './cs';
import { parseUrl } from './i18n';
import { sk } from './sk';

describe('parseUrl', () => {
  it('maps addresses to language, page and language-free path', () => {
    expect(parseUrl('/')).toEqual({ lang: 'sk', page: 'home', rest: '' });
    expect(parseUrl('/#guides')).toEqual({ lang: 'sk', page: 'home', rest: '' });
    expect(parseUrl('/o-nas')).toEqual({ lang: 'sk', page: 'about', rest: '/o-nas' });
    expect(parseUrl('/cz')).toEqual({ lang: 'cs', page: 'home', rest: '' });
    expect(parseUrl('/cz/')).toEqual({ lang: 'cs', page: 'home', rest: '' });
    expect(parseUrl('/cz/o-nas?ref=fb')).toEqual({ lang: 'cs', page: 'about', rest: '/o-nas' });
    expect(parseUrl('/podmienky')).toEqual({ lang: 'sk', page: 'terms', rest: '/podmienky' });
    expect(parseUrl('/cz/podmienky/')).toEqual({ lang: 'cs', page: 'terms', rest: '/podmienky' });
    expect(parseUrl('/navody/vybava')).toEqual({ lang: 'sk', page: 'guides', rest: '/navody/vybava' });
    expect(parseUrl('/cz/navody/eventy/mge')).toEqual({ lang: 'cs', page: 'guide', rest: '/navody/eventy/mge' });
    expect(parseUrl('/czech')).toEqual({ lang: 'sk', page: 'home', rest: '/czech' });
    expect(parseUrl('/ucet?login=error')).toEqual({ lang: 'sk', page: 'account', rest: '/ucet' });
    expect(parseUrl('/cz/ucet')).toEqual({ lang: 'cs', page: 'account', rest: '/ucet' });
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
