import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { March } from '../../core/kvk-api';
import { Marches } from './marches';
import { PlayersAdmin } from './players-admin';

const MARCH: March = { id: 1, position: 1, kind: '', primary: '', secondary: '', images: [] };
const COMMANDERS = [
  { name: 'Attila', icon: '/static/guides/commanders/attila.webp', entries: [] },
  { name: 'Takeda Shingen', icon: '/static/guides/commanders/takeda-shingen.webp', entries: [] },
];

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(HttpTestingController);
}

const settle = async (fixture: { whenStable(): Promise<unknown> }) => {
  await fixture.whenStable();
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

  it('fills a march in, saves it, and only then offers the next one and its screenshots', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [], max: 7 });
    http.expectOne('/api/commanders/').flush(COMMANDERS);
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
    el.querySelector<HTMLButtonElement>('.pick')!.click();
    await fixture.whenStable();
    const tiles = Array.from(el.querySelectorAll<HTMLButtonElement>('.picker-tile'));
    expect(tiles.map((t) => t.textContent?.trim())).toEqual(['Attila', 'Takeda Shingen']);
    tiles[0].click();
    await fixture.whenStable();
    save().click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/marches/');
    expect(req.request.body).toEqual({ kind: 'cavalry', primary: 'Attila', secondary: '' });
    req.flush({ ...MARCH, kind: 'cavalry', primary: 'Attila' });
    await settle(fixture);
    expect(el.querySelector('.march--editing')).toBeNull();
    expect(el.querySelector('.pick__name')?.textContent).toBe('Attila');
    expect(el.querySelector('.add-march')?.textContent).toContain('Pridať druhý march');
    // one screenshot of each kind, with an example
    expect(el.querySelectorAll('.thumb--add').length).toBe(2);
    expect(el.querySelector('.example img')?.getAttribute('src')).toBe('img/examples/equipment.webp');

    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'eq.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change'));
    http
      .expectOne('/api/me/marches/1/images/')
      .flush({ id: 7, kind: 'equipment', url: '/api/marches/images/7/', thumb: '/api/marches/images/7/?thumb=1', width: 1, height: 1 });
    await settle(fixture);
    expect(el.querySelectorAll('.thumb--add').length).toBe(1);
    http.verify();
  });

  it('stops at seven and removes a march only on the second click', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(Marches);
    fixture.detectChanges();
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...MARCH, id: i + 1, position: i + 1 }));
    http.expectOne('/api/me/marches/').flush({ marches: seven, max: 7 });
    http.expectOne('/api/commanders/').flush(COMMANDERS);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.add-march')).toBeNull();

    const remove = () => el.querySelector<HTMLButtonElement>('.march__actions .danger')!;
    remove().click();
    await fixture.whenStable();
    http.expectNone('/api/me/marches/1/');
    remove().click();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/me/marches/1/').flush(null, { status: 204, statusText: '' });
    await settle(fixture);
    expect(Array.from(el.querySelectorAll('.march__title'), (t) => t.textContent?.trim().slice(0, 2))).toEqual([
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
