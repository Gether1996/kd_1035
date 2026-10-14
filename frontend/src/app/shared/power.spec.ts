import { parsePower, powerMillions } from './power';

describe('power', () => {
  it('reads millions or the whole number', () => {
    expect(parsePower('42,5')).toBe(42_500_000);
    expect(parsePower('42.5')).toBe(42_500_000);
    expect(parsePower('42 500 000')).toBe(42_500_000);
    expect(parsePower('9')).toBe(9_000_000);
    expect(parsePower('42,500,000')).toBe(42_500_000);
    expect(parsePower('42.500.000')).toBe(42_500_000);
    expect(parsePower('42,500')).toBe(42_500_000); // one group = a decimal comma (42,5 mil.)
    for (const bad of ['', '0', 'abc', '-5', '1,2,3']) expect(parsePower(bad), bad).toBeNull();
  });

  it('gives millions with one decimal for the evaluation, empty = not written down', () => {
    expect(powerMillions('101,5')).toBe(101.5);
    expect(powerMillions('101 549 999')).toBe(101.5);
    expect(powerMillions('101,500,000')).toBe(101.5);
    expect(powerMillions(' 98.46 ')).toBe(98.5);
    expect(powerMillions('')).toBeNull();
    expect(powerMillions('   ')).toBeNull();
    for (const bad of ['abc', '0', '-5', '10000']) expect(powerMillions(bad), bad).toBeUndefined();
  });
});
