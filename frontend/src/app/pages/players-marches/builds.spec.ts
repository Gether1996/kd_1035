import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ARMORY } from '../../core/armory-testing';
import { MarchBuilds } from './builds';

const MARCH = {
  id: 3,
  position: 1,
  kind: 'cavalry' as const,
  primary: 'Attila',
  secondary: 'Takeda Shingen',
  images: [],
  attack: 12,
  gear: {},
  formation: '',
  inscriptions: [],
};

const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

describe('MarchBuilds', () => {
  it('clicks the equipment and armaments of a march together and saves them', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MarchBuilds);
    fixture.detectChanges();
    http.expectOne('/api/me/marches/').flush({ marches: [MARCH], max: 7, public: false });
    http.expectOne('/api/commanders/marches/').flush([{ name: 'Attila', icon: '/static/guides/commanders/attila.webp', pick: true }]);
    await tick(fixture);
    http.expectOne('/api/armory/').flush(ARMORY);
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mb__primary')?.textContent).toBe('Attila');
    expect(el.querySelector('.mb__note')?.textContent).toContain('Zatiaľ prázdne');

    el.querySelector<HTMLButtonElement>('app-march-build .pill-btn')!.click();
    await tick(fixture);
    const dialog = el.querySelector('dialog.be')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const tiles = () => [...dialog.querySelectorAll<HTMLButtonElement>('.gear__tile')];
    expect(tiles()[0].getAttribute('aria-pressed')).toBe('true');
    // only the weapons of the catalog
    const items = () => [...dialog.querySelectorAll<HTMLButtonElement>('.be__item')];
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Sacred Dominion']);
    items()[0].click();
    await tick(fixture);
    // the slot stays chosen (crit and iconic right below, the focus on the item), the tile shows its icon
    expect(tiles()[0].getAttribute('aria-pressed')).toBe('true');
    expect(items()[0].getAttribute('aria-pressed')).toBe('true');
    expect(tiles()[0].querySelector('img')?.getAttribute('src')).toBe('/static/guides/gear/sacred-dominion.webp');
    // Zrušiť leaves the march as it was, the next opening starts from it again
    dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn--quiet')!.click();
    await tick(fixture);
    expect(el.querySelector('app-march-build .gear__icon')).toBeNull();
    el.querySelector<HTMLButtonElement>('app-march-build .pill-btn')!.click();
    await tick(fixture);
    expect(tiles()[0].querySelector('img')).toBeNull();
    items()[0].click();
    await tick(fixture);
    dialog.querySelector<HTMLInputElement>('.be__crit input')!.click();
    await tick(fixture);
    [...dialog.querySelectorAll<HTMLButtonElement>('.be__iconic button')].find((b) => b.textContent?.trim() === 'III')!.click();
    await tick(fixture);
    // Cav ATK of the crit
    expect(dialog.querySelector('.be__stats')?.textContent).toContain('32.5%');

    dialog.querySelectorAll<HTMLButtonElement>('.be__tabs button')[1].click();
    await tick(fixture);
    const formations = () => [...dialog.querySelectorAll<HTMLButtonElement>('.be__formation')];
    const inscriptions = () => [...dialog.querySelectorAll<HTMLButtonElement>('button.insc')];
    // without a formation only the common ones
    expect(inscriptions().map((b) => b.textContent?.trim())).toEqual(['Enduring', 'Watchmen', 'Patronage']);
    formations()[0].click();
    await tick(fixture);
    expect(inscriptions().map((b) => b.textContent?.trim())).toEqual(['Relentless', 'Enduring', 'Watchmen', 'Patronage', 'Thrasher']);
    // two of each armament at most: the third emblem one is blocked
    inscriptions()[0].click();
    inscriptions()[1].click();
    await tick(fixture);
    expect(dialog.querySelector('.be__piece-count')?.textContent).toBe('2/2');
    expect(inscriptions()[2].getAttribute('aria-disabled')).toBe('true');
    inscriptions()[2].click();
    await tick(fixture);
    expect(inscriptions()[2].getAttribute('aria-pressed')).toBe('false');
    inscriptions()[0].click();
    inscriptions()[1].click();
    inscriptions()[4].click();
    inscriptions()[3].click();
    await tick(fixture);
    // another formation: its own inscriptions instead, the common one stays
    formations()[1].click();
    await tick(fixture);
    expect(inscriptions().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent?.trim())).toEqual([
      'Patronage',
    ]);
    inscriptions().find((b) => b.textContent?.trim() === 'Toppler')!.click();
    await tick(fixture);

    dialog.querySelector<HTMLButtonElement>('.be__actions .pill-btn')!.click();
    const save = http.expectOne('/api/me/marches/3/');
    expect(save.request.method).toBe('PATCH');
    expect(save.request.body).toEqual({
      gear: { weapon: { item: 'sacred-dominion', crit: true, iconic: 3 } },
      formation: 'pincer',
      inscriptions: ['u-instrument-patronage', 'pincer-scroll-toppler'],
    });
    save.flush({ ...MARCH, ...save.request.body });
    await tick(fixture);
    await tick(fixture);
    expect(dialog.hasAttribute('open')).toBe(false);
    // the card shows the build
    // the formation as its icon only, the inscriptions gold first
    expect(el.querySelector('.mb__formation img')?.getAttribute('alt')).toBe('Pincer');
    expect([...el.querySelectorAll('.mb__inscs .insc')].map((i) => i.textContent?.trim())).toEqual(['Toppler', 'Patronage']);
    expect(el.querySelector('app-march-build .gear__iconic')?.textContent).toBe('III');
    expect(el.querySelector('app-march-build .gear__crit')).not.toBeNull();
    http.verify();
  });
});
