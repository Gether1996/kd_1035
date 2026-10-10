import { fold } from './search';

describe('fold', () => {
  it('drops diacritics, case and outer spaces', () => {
    expect(fold('  MGE – Pěchota ')).toBe('mge – pechota');
    expect(fold('Áčko Ľudo')).toBe('acko ludo');
  });
});
