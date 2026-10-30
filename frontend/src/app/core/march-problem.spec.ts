import { describe, expect, it } from 'vitest';
import { March, marchHasProblem } from './kvk-api';

describe('marchHasProblem', () => {
  const march = { id: 1, position: 1, kind: 'cavalry', primary: 'Attila', secondary: 'Takeda Shingen' } as March;

  it('equipment or armaments not filled in are red like a wrong pair (Gether 30. 10. 2026)', () => {
    expect(marchHasProblem(march)).toBe(false);
    expect(marchHasProblem({ ...march, gear_problem: ['gear'] })).toBe(true);
    expect(marchHasProblem({ ...march, gear_problem: ['armaments'] })).toBe(true);
    expect(marchHasProblem({ ...march, gear_problem: null })).toBe(false);
  });
});
