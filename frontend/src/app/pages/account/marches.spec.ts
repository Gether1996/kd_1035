import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { March } from '../../core/kvk-api';
import { Marches } from './marches';
import { PlayersAdmin } from './players-admin';

const MARCH: March = { id: 1, position: 1, kind: '', primary: '', secondary: '', images: [] };
const COMMANDERS = [
  { name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true },
  // a golden-key commander: only for the portrait of an old march, not offered
  { name: 'Cao Cao', icon: '/static/guides/commanders/cao-cao.webp', pick: false },
  { name: 'Takeda Shingen', icon: '/static/guides/commanders/takeda-shingen.webp', pick: true },
];

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

// the save chain (march, then each screenshot) continues in plain promises after each response
const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
};

describe('Marches', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('saves a march only with its type, commander and both screenshots, then offers the next one', async () => {
    URL.createObjectURL ??= () => 'blob:preview';
    URL.revokeObjectURL ??= () => undefined;
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [], max: 7 });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.add-march')?.textContent).toContain('Pridať prvý march');

    el.querySelector<HTMLButtonElement>('.add-march')!.click();
    await fixture.whenStable();
    // nothing is sent before "Uložiť"; the next march waits
    expect(el.querySelector('.add-march')).toBeNull();
    expect(el.textContent).toContain('Ďalší march pridáš, keď tento uložíš.');
    const save = () => el.querySelector<HTMLButtonElement>('.march--editing .form__actions .pill-btn')!;
    save().click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Vyber typ marchu.');

    el.querySelectorAll<HTMLButtonElement>('.kind')[1].click();
    await fixture.whenStable();
    // the bonuses are read as those of the march's troop type
    expect(Array.from(el.querySelectorAll('.stat-field__label'), (l) => l.textContent?.trim()).slice(0, 4)).toEqual([
      'Cav ATK',
      'Cav DEF',
      'Cav HP',
      'All DMG',
    ]);
    const stat = (i: number, value: string) => {
      const input = el.querySelectorAll<HTMLInputElement>('.stat-field__input')[i];
      input.value = value;
      input.dispatchEvent(new Event('input'));
      return input;
    };
    // whole numbers of two digits: anything else is dropped as it is typed
    expect(stat(0, '12,5').value).toBe('12');
    stat(4, '3');
    el.querySelector<HTMLButtonElement>('.tile')!.click();
    await fixture.whenStable();
    const tiles = Array.from(el.querySelectorAll<HTMLButtonElement>('.picker-tile'));
    expect(tiles.map((t) => t.textContent?.trim())).toEqual(['Attila', 'Takeda Shingen']);
    tiles[0].click();
    await fixture.whenStable();
    // only the equipment screenshot (the armaments are typed in), with an example
    expect(el.querySelectorAll('.tile__example').length).toBe(1);
    save().click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Pridaj screenshot výbavy.');
    http.expectNone('/api/me/marches/');

    const pickFile = async (name: string) => {
      const input = el.querySelector<HTMLInputElement>('.march--editing input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    await pickFile('equipment.png');
    expect(el.querySelectorAll('.march--editing .tile__box--shot img').length).toBe(1);
    // every bonus and inscription count is required instead of the armaments screenshot (0 counts)
    save().click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Vyplň ATK, DEF, HP a počet inscriptions');
    expect(el.querySelector('.stat-grid')?.classList).toContain('is-invalid');
    http.expectNone('/api/me/marches/');
    stat(1, '8');
    stat(2, '0');
    stat(5, '2');
    stat(6, '10');

    // All DMG may stay empty: it is sent as 0
    expect(el.querySelectorAll<HTMLInputElement>('.stat-field__input')[3].placeholder).toBe('0');
    save().click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/marches/');
    expect(req.request.body).toEqual({
      kind: 'cavalry',
      primary: 'Attila',
      secondary: '',
      attack: 12,
      defense: 8,
      health: 0,
      damage: 0,
      gold: 3,
      blue: 2,
      white: 10,
    });
    req.flush({ ...MARCH, kind: 'cavalry', primary: 'Attila', attack: 12, damage: 0, gold: 3 });
    await settle(fixture);
    const image = (id: number, kind: string) => ({ id, kind, url: `/api/marches/images/${id}/`, thumb: `/api/marches/images/${id}/?thumb=1`, width: 1, height: 1 });
    const equipment = http.expectOne('/api/me/marches/1/images/');
    expect((equipment.request.body as FormData).get('kind')).toBe('equipment');
    equipment.flush(image(7, 'equipment'));
    await settle(fixture);

    expect(el.querySelector('.march--editing')).toBeNull();
    expect(el.querySelector('.mrow__head')?.getAttribute('alt')).toBe('Attila');
    expect(el.querySelectorAll('.mrow__shot img').length).toBe(1);
    // short labels next to the type icon, the full "Cav ATK" in the title (and for screen readers)
    const stats = Array.from(el.querySelectorAll<HTMLElement>('.mrow__stat'));
    expect(stats.map((s) => s.title)).toEqual(['Cav ATK', 'All DMG', 'Zlaté']);
    expect(stats.map((s) => s.textContent?.match(/\d+%?/)?.[0])).toEqual(['12%', '0%', '3']);
    expect(el.querySelector('.add-march')?.textContent).toContain('Pridať druhý march');
    http.verify();
  });

  it('stops at seven and removes a march from its editor only on the second click', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...MARCH, id: i + 1, position: i + 1 }));
    http.expectOne('/api/me/marches/').flush({ marches: seven, max: 7 });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.add-march')).toBeNull();

    // removing is in the editor of the march
    el.querySelector<HTMLButtonElement>('.march__edit')!.click();
    await fixture.whenStable();
    const remove = () => el.querySelector<HTMLButtonElement>('.march__remove')!;
    remove().click();
    await fixture.whenStable();
    http.expectNone('/api/me/marches/1/');
    remove().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/me/marches/1/').flush(null, { status: 204, statusText: '' });
    await settle(fixture);
    expect(Array.from(el.querySelectorAll('.mrow__num'), (t) => t.textContent?.trim())).toEqual([
      '1.',
      '2.',
      '3.',
      '4.',
      '5.',
      '6.',
    ]);
    expect(el.querySelector('.add-march')?.textContent).toContain('siedmy');
    http.verify();
  });
});

describe('PlayersAdmin', () => {
  it('switches R4 for a player and puts the switch back when it fails', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(PlayersAdmin);
    fixture.detectChanges();
    http.expectOne('/api/kvk/reviewers/').flush({
      players: [
        { id: 1, name: 'gether', ingame_name: 'Gether', avatar_url: '', reviewer: false, superuser: true },
        { id: 2, name: 'nelly', ingame_name: 'Nelly', avatar_url: '', reviewer: false, superuser: false },
      ],
    });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const switches = el.querySelectorAll<HTMLInputElement>('.switch');
    expect(switches.length).toBe(1); // the superuser has no switch

    switches[0].click();
    const req = http.expectOne('/api/kvk/reviewers/2/');
    expect(req.request.body).toEqual({ reviewer: true });
    req.flush({ id: 2, reviewer: true });
    await settle(fixture);
    expect(el.textContent).toContain('R4 · vidí prihlášky');

    el.querySelector<HTMLInputElement>('.switch')!.click();
    http.expectOne('/api/kvk/reviewers/2/').flush('x', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(el.querySelector<HTMLInputElement>('.switch')!.checked).toBe(true);
    expect(el.querySelector('.form__state')?.textContent).toContain('nepodarilo');
    http.verify();
  });
});

describe('Marches visibility', () => {
  it('switches between R4 only and every player, and goes back when saving fails', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [], max: 7, public: false });
    http.expectOne('/api/commanders/marches/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const [r4, all] = Array.from(el.querySelectorAll<HTMLButtonElement>('.visibility button'));
    expect(r4.getAttribute('aria-pressed')).toBe('true');

    all.click();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/me/marches/');
    expect(req.request.body).toEqual({ public: true });
    req.flush({ public: true });
    await settle(fixture);
    expect(all.getAttribute('aria-pressed')).toBe('true');

    r4.click();
    http.expectOne((r) => r.method === 'PATCH').flush('x', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.visibility__error')?.textContent).toContain('Nepodarilo');
    http.verify();
  });
});
