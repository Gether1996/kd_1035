import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CommanderEntry, IndexedCommander, commanderKey } from './commander-finder';
import { MyCommanders, OWNED_KEY, pairsOf, plan } from './my-commanders';

const pic = (name: string) => ({ name, icon: `/static/guides/commanders/${commanderKey(name)}.webp` });
const entry = (slug: string, role: CommanderEntry['role'], partners: string[], context = ''): CommanderEntry => ({
  slug,
  category: 'commanderi',
  title_sk: `Návod ${slug}`,
  title_cs: `Návod CZ ${slug}`,
  role,
  partners: partners.map(pic),
  context_sk: context,
  context_cs: context,
});

const INDEX: IndexedCommander[] = [
  { ...pic('Achilles'), entries: [entry('pary-pre-jazdu', 'secondary', ['Attila'])] },
  {
    ...pic('Attila'),
    entries: [
      entry('pary-pre-jazdu', 'primary', ['Achilles']),
      entry('pary-pre-rally', 'primary', ['Achilles'], 'jazda'),
      // alternatives: two pairs
      entry('pary-pre-rally', 'primary', ['William Marshal', 'Subutai'], 'jazda'),
    ],
  },
  { ...pic('Subutai'), entries: [entry('pary-pre-rally', 'secondary', ['Attila'], 'jazda')] },
  { ...pic('Sun Tzu'), entries: [entry('pary-pre-f2p-a-zaciatok', 'solo', [], 'KvK1')] },
  { ...pic('Sun Tzu Prime'), entries: [entry('pary-pre-pechotu', 'primary', [])] },
  { ...pic('William Marshal'), entries: [entry('pary-pre-rally', 'secondary', ['Attila'], 'jazda')] },
];

describe('pairs of the guides', () => {
  const pairs = pairsOf(INDEX);

  it('lists each pair once from the primary side, one per alternative, with every guide naming it', () => {
    expect(pairs.map((p) => p.key)).toEqual([
      'attila+achilles',
      'attila+william-marshal',
      'attila+subutai',
      'sun-tzu-prime+',
    ]);
    expect(pairs[0].guides.map((g) => g.slug)).toEqual(['pary-pre-jazdu', 'pary-pre-rally']);
  });

  it('needs both commanders; "anyone" only the primary; a solo commander is no pair', () => {
    expect(plan(pairs, new Set(['attila'])).ready).toEqual([]);
    expect(plan(pairs, new Set(['attila', 'achilles'])).ready.map((p) => p.key)).toEqual(['attila+achilles']);
    expect(plan(pairs, new Set(['sun-tzu-prime', 'sun-tzu'])).ready.map((p) => p.key)).toEqual(['sun-tzu-prime+']);
  });

  it('suggests the missing commander that opens the most pairs first', () => {
    const { missing } = plan(pairs, new Set(['achilles', 'william-marshal', 'subutai']));
    expect(missing.map((s) => [s.commander.name, s.pairs.length])).toEqual([['Attila', 3]]);
    const { missing: other } = plan(pairs, new Set(['attila']));
    expect(other.map((s) => s.commander.name)).toEqual(['Achilles', 'Subutai', 'William Marshal']);
  });
});

describe('MyCommanders', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(MyCommanders);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/commanders/').flush(INDEX);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const tile = (el: HTMLElement, name: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.tile')).find((b) => b.textContent?.includes(name))!;

  it('toggles owned commanders, shows the pairs to field and remembers the choice in this browser', async () => {
    const { fixture, el } = await render();
    expect(el.textContent).toContain('Začni tým');

    tile(el, 'Attila').click();
    tile(el, 'Achilles').click();
    await fixture.whenStable();
    expect(tile(el, 'Attila').getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('2 označení commanderi');
    expect(el.querySelector('.cards .card__name')?.textContent?.trim()).toBe('Attila + Achilles');
    expect(el.textContent).toContain('pridá 1 pár');
    expect(JSON.parse(localStorage.getItem(OWNED_KEY)!)).toEqual(['achilles', 'attila']);

    el.querySelector<HTMLButtonElement>('.pill-btn')!.click();
    await fixture.whenStable();
    expect(localStorage.getItem(OWNED_KEY)).toBeNull();
    expect(el.textContent).toContain('Začni tým');
  });

  it('restores the saved choice and filters the list without diacritics', async () => {
    localStorage.setItem(OWNED_KEY, JSON.stringify(['sun-tzu-prime']));
    const { fixture, el } = await render();
    expect(el.textContent).toContain('Sun Tzu Prime + ktokoľvek');

    const input = el.querySelector<HTMLInputElement>('#builder-filter')!;
    input.value = 'atti';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('.tile'), (b) => b.textContent?.trim())).toEqual(['Attila']);
  });
});
