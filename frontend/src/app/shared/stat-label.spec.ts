import { formatBonus, readBonus } from './stat-label';

describe('armament bonuses', () => {
  it('take two digits and one decimal and show a decimal comma', () => {
    const input = document.createElement('input');
    const type = (value: string) => {
      input.value = value;
      return [readBonus(input), input.value];
    };
    expect(type('12,5')).toEqual([12.5, '12,5']);
    expect(type('12.55')).toEqual([12.5, '12,5']);
    expect(type('123')).toEqual([12, '12']);
    expect(type('12,')).toEqual([12, '12,']);
    expect(type('')).toEqual([null, '']);
    expect(formatBonus(46.5)).toBe('46,5');
    expect(formatBonus(25)).toBe('25');
    expect(formatBonus(null)).toBe('');
  });
});
