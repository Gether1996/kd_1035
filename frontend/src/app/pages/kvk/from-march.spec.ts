import { March } from '../../core/kvk-api';
import { buildChange, draftOf } from './from-march';

const MARCH: March = {
  id: 1,
  position: 1,
  kind: 'cavalry',
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  primary_skills: '5511',
  secondary_skills: '5555',
  gear: { weapon: { item: 'sacred-dominion', crit: false, iconic: 1 } },
  formation: 'delta',
  inscriptions: ['delta-scroll-thrasher'],
  attack: 12,
  defense: 8,
  health: 6,
  damage: 3,
};

describe('Vyplniť z marchu', () => {
  it('fills the form with the type, the commanders and their skills', () => {
    expect(draftOf(MARCH)).toEqual({
      kind: 'cavalry',
      primary: 'Attila',
      secondary: 'Takeda Shingen',
      skills: { primary: '5511', secondary: '5555' },
    });
  });

  it('leaves out a type the sign-up does not offer', () => {
    expect(draftOf({ ...MARCH, kind: 'engineering' }).kind).toBe('');
    expect(draftOf({ ...MARCH, kind: 'garrison' }).kind).toBe('');
  });

  it('copies the build and every armament bonus', () => {
    expect(buildChange(MARCH)).toEqual({
      gear: MARCH.gear,
      formation: 'delta',
      inscriptions: ['delta-scroll-thrasher'],
      attack: 12,
      defense: 8,
      health: 6,
      damage: 3,
    });
  });

  it('copies nothing from an older march without ATK, DEF and HP', () => {
    expect(buildChange({ ...MARCH, health: null })).toBeNull();
    expect(buildChange({ ...MARCH, attack: undefined })).toBeNull();
  });
});
