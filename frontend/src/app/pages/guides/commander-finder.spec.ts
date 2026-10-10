import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CommanderEntry, CommanderFinder, IndexedCommander, commanderKey } from './commander-finder';

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
      entry('pary-pre-jazdu', 'primary', ['William Marshal'], 'Tri armády'),
      entry('pary-pre-rally', 'primary', ['William Marshal'], 'jazda'),
      entry('pary-pre-rally', 'secondary', ['Subutai'], 'jazda'),
    ],
  },
  { ...pic('Sun Tzu'), entries: [entry('pary-pre-f2p-a-zaciatok', 'solo', [], 'KvK1')] },
  { ...pic('Sun Tzu Prime'), entries: [entry('pary-pre-pechotu', 'primary', [])] },
];

describe('CommanderFinder', () => {
  beforeEach(() => {
    // jsdom has no layout: the highlighted option is scrolled into the list's view
    Element.prototype.scrollIntoView = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  async function render(commander?: string, fail = false) {
    const fixture = TestBed.createComponent(CommanderFinder);
    if (commander) fixture.componentRef.setInput('commander', commander);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/commanders/');
    if (fail) req.flush('down', { status: 500, statusText: 'Server Error' });
    else req.flush(INDEX);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[role="combobox"]');
    return { fixture, el, input, navigate };
  }

  const options = (el: HTMLElement) => Array.from(el.querySelectorAll('[role="option"]'), (o) => o.textContent?.trim());
  const press = (input: HTMLInputElement, key: string) =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  it('offers matching commanders as a keyboard-operable listbox and keeps the choice in ?commander=', async () => {
    const { fixture, el, input, navigate } = await render();
    expect(input!.getAttribute('aria-expanded')).toBe('false');
    expect(input!.getAttribute('aria-controls')).toBe('finder-options');
    expect(el.querySelector('#finder-options')?.getAttribute('role')).toBe('listbox');

    input!.value = 'SUN';
    input!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(input!.getAttribute('aria-expanded')).toBe('true');
    expect(options(el)).toEqual(['Sun Tzu', 'Sun Tzu Prime']);
    expect(input!.getAttribute('aria-activedescendant')).toBe('finder-option-0');

    press(input!, 'ArrowDown');
    await fixture.whenStable();
    expect(input!.getAttribute('aria-activedescendant')).toBe('finder-option-1');
    expect(el.querySelector('#finder-option-1')?.getAttribute('aria-selected')).toBe('true');

    press(input!, 'Enter');
    await fixture.whenStable();
    expect(input!.getAttribute('aria-expanded')).toBe('false');
    expect(input!.value).toBe('Sun Tzu Prime');
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { commander: 'sun-tzu-prime' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('finds a name without diacritics or from its middle; Escape closes the list, then empties the field', async () => {
    const { fixture, el, input } = await render();
    input!.value = 'til';
    input!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(options(el)).toEqual(['Attila']);

    input!.value = 'xyz';
    input!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.finder__empty')?.textContent).toContain('nespomínajú');

    press(input!, 'Escape');
    await fixture.whenStable();
    expect(input!.getAttribute('aria-expanded')).toBe('false');
    press(input!, 'Escape');
    await fixture.whenStable();
    expect(input!.value).toBe('');
  });

  it('lists the pairs of the chosen commander by role, one card per pair with a link to each guide', async () => {
    const { el, input } = await render('attila');
    expect(input!.value).toBe('Attila');
    expect(Array.from(el.querySelectorAll('.result__role'), (h) => h.textContent?.trim())).toEqual([
      'Ako primárny',
      'Ako sekundárny',
    ]);
    const cards = Array.from(el.querySelectorAll('.card'));
    expect(cards.map((c) => c.querySelector('.card__name')?.textContent?.trim())).toEqual([
      'Achilles',
      'William Marshal',
      'Subutai',
    ]);
    const marshal = Array.from(cards[1].querySelectorAll('.card__guide'), (g) => [
      g.querySelector('a')?.getAttribute('href'),
      g.querySelector('a')?.textContent?.trim(),
      g.querySelector('.card__context')?.textContent?.trim(),
    ]);
    expect(marshal).toEqual([
      ['/navody/commanderi/pary-pre-jazdu', 'Návod pary-pre-jazdu', '· Tri armády'],
      ['/navody/commanderi/pary-pre-rally', 'Návod pary-pre-rally', '· jazda'],
    ]);
    expect(cards[1].querySelector('img')?.getAttribute('src')).toBe('/static/guides/commanders/william-marshal.webp');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Attila: 3 odporúčania');
  });

  it('a pair with anyone and a commander to focus on alone', async () => {
    const prime = await render('sun-tzu-prime');
    expect(prime.el.querySelector('.card__name')?.textContent?.trim()).toBe('ktokoľvek');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const { el } = await render('sun-tzu');
    expect(el.querySelector('.result__role')?.textContent).toContain('Na koho sa sústrediť');
    expect(el.querySelector('.card__guide')?.textContent).toContain('KvK1');
  });

  it('hides itself when the API fails', async () => {
    const { el } = await render(undefined, true);
    expect(el.querySelector('.finder')).toBeNull();
  });
});
