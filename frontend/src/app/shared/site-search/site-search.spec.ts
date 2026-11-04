import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SiteSearch } from './site-search';

const GUIDES = [
  {
    slug: 'karuak',
    category: 'eventy',
    title_sk: 'Karuak Ceremony (návod)',
    title_cs: 'Karuak Ceremony – český návod',
    excerpt_sk: 'Ako získať čo najviac bodov.',
    excerpt_cs: 'Jak získat co nejvíc bodů.',
  },
  { slug: 'vybava-pechota', category: 'vybava', title_sk: 'Výbava pre pechotu', title_cs: '', excerpt_sk: 'Sety a ikony.' },
  // more matches than one group shows
  ...Array.from({ length: 8 }, (_, i) => ({
    slug: `tip-${i}`,
    category: 'tipy',
    title_sk: `Tip na rally ${i}`,
    title_cs: `Tip na rally ${i}`,
  })),
];

const COMMANDERS = [{ name: 'Attila' }, { name: 'Sun Tzu' }, { name: 'Cú Chulainn' }];

const EVENTS = {
  occurrences: [
    { id: 5, name_sk: 'Karuak Ceremony', name_cs: 'Karuakův obřad', start: '2026-11-10T00:00:00Z', end: '2026-11-16T00:00:00Z' },
    // the same event again (its next occurrence) – one hit
    { id: 5, name_sk: 'Karuak Ceremony', name_cs: 'Karuakův obřad', start: '2027-01-05T00:00:00Z', end: '2027-01-11T00:00:00Z' },
  ],
  irregular: [{ id: 9, name_sk: 'Silk Road', name_cs: '', start: null, end: null }],
};

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('SiteSearch (the header search)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** opens the search at `url`; `fail` lists the API sources that answer with an error */
  async function open(url = '/', fail: string[] = []) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const fixture = TestBed.createComponent(SiteSearch);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await fixture.whenStable();
    const answer = (path: string, body: object) => {
      const req = http.expectOne(path);
      if (fail.includes(path)) req.flush(null, { status: 500, statusText: 'Error' });
      else req.flush(body);
    };
    answer('/api/guides/', GUIDES);
    answer('/api/commanders/', COMMANDERS);
    answer('/api/events/', EVENTS);
    // the glossary and the helpers are dynamic imports – wait until every source answered (a slow machine needs more)
    const loading = () => (fixture.componentInstance as unknown as { loading(): boolean }).loading();
    for (let i = 0; i < 200 && loading(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(loading()).toBe(false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = async (value: string) => {
      const input = el.querySelector<HTMLInputElement>('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const groups = () =>
      [...el.querySelectorAll('.search__group')].map((g) => ({
        title: text(g.querySelector('.search__group-title')),
        hits: [...g.querySelectorAll<HTMLAnchorElement>('a.search__hit')].map((a) => [
          text(a.querySelector('.search__hit-title')),
          a.getAttribute('href'),
        ]),
      }));
    return { fixture, el, type, groups, closed: () => closed };
  }

  it('opens as a modal dialog with a hint until two characters are typed', async () => {
    const { el, type, groups } = await open();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('site-search-title');
    expect(text(el.querySelector('#site-search-title'))).toBe('Hľadať na webe');
    const status = el.querySelector('#site-search-status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(el.querySelector('input')!.getAttribute('aria-describedby')).toBe('site-search-status');
    expect(text(status)).toBe('Napíš aspoň dva znaky. Šípkami sa pohybuješ vo výsledkoch.');
    await type('m');
    expect(groups()).toEqual([]);
    expect(text(status)).toContain('aspoň dva znaky');
  });

  it('finds pages, guides, glossary terms and events without diacritics, each with its link', async () => {
    const { type, groups } = await open();
    await type('KARUAK');
    expect(groups()).toEqual([
      { title: 'Návody', hits: [['Karuak Ceremony (návod)', '/navody/eventy/karuak']] },
      { title: 'Eventy', hits: [['Karuak Ceremony', expect.stringMatching(/^\/kalendar\?event=5(&on=\d{4}-\d{2}-\d{2})?$/)]] },
    ]);

    await type('vybava pre');
    expect(groups()).toEqual([{ title: 'Návody', hits: [['Výbava pre pechotu', '/navody/vybava/vybava-pechota']] }]);

    await type('kalendar');
    expect(groups()[0]).toEqual({ title: 'Stránky', hits: [['Kalendár', '/kalendar']] });

    // the glossary searches its explanations too ("Kráľovstvo – herný server…")
    await type('kralovstvo');
    const glossary = groups().find((g) => g.title === 'Slovník pojmov');
    expect(glossary?.hits).toContainEqual(['KD', '/slovnik#kd']);
  });

  it('shows at most six hits per group', async () => {
    const { type, groups } = await open();
    await type('tip na rally');
    expect(groups()).toEqual([{ title: 'Návody', hits: expect.any(Array) }]);
    expect(groups()[0].hits.length).toBe(6);
  });

  it('commanders lead to the pair finder, hidden ones are left out', async () => {
    const { type, groups } = await open();
    await type('attila');
    expect(groups()).toContainEqual({ title: 'Commanderi', hits: [['Attila', '/navody?commander=attila']] });
    await type('sun tzu');
    expect(groups().find((g) => g.title === 'Commanderi')).toBeUndefined();
    await type('cu chul');
    expect(groups()).toContainEqual({ title: 'Commanderi', hits: [['Cú Chulainn', '/navody?commander=cu-chulainn']] });
  });

  it('a source that fails is left out, the others still answer; nothing found says so', async () => {
    const { el, type, groups } = await open('/', ['/api/guides/', '/api/events/']);
    await type('karuak');
    expect(groups()).toEqual([]);
    expect(text(el.querySelector('#site-search-status'))).toBe('Nič sme nenašli.');
    await type('attila');
    expect(groups().map((g) => g.title)).toEqual(['Commanderi']);
    expect(text(el.querySelector('#site-search-status'))).toBe('');
  });

  it('in Czech: Czech texts, Czech titles (Slovak still found) and links under /cz', async () => {
    const { el, type, groups } = await open('/cz');
    expect(text(el.querySelector('#site-search-title'))).toBe('Hledat na webu');
    await type('karuakuv obrad');
    expect(groups()).toEqual([
      { title: 'Eventy', hits: [['Karuakův obřad', expect.stringMatching(/^\/cz\/kalendar\?event=5/)]] },
    ]);
    // the Slovak title is searched too, the Czech one shown
    await type('karuak ceremony (navod)');
    expect(groups()[0]).toEqual({ title: 'Návody', hits: [['Karuak Ceremony – český návod', '/cz/navody/eventy/karuak']] });
    // no Czech title → the Slovak one
    await type('silk road');
    expect(groups()).toEqual([{ title: 'Eventy', hits: [['Silk Road', '/cz/kalendar?event=9']] }]);
  });

  it('arrow keys move through the results and back to the field', async () => {
    const { el, type } = await open();
    await type('karuak');
    const input = el.querySelector('input')!;
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a.search__hit')];
    input.focus();
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (document.activeElement ?? input).dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press('ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(links[0]);
    press('ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    press('ArrowDown'); // stays on the last one
    expect(document.activeElement).toBe(links[1]);
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(input);
    expect(press('a')).toBe(false); // other keys are left alone
  });

  it('a click goes through the router and closes the search; Ctrl+click is left to the browser', async () => {
    const { el, type, closed } = await open();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    await type('kalendar');
    const link = el.querySelector<HTMLAnchorElement>('a.search__hit')!;

    const ctrl = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
    link.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    const click = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/kalendar');
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve)); // a native dialog fires "close" in a task
    expect(closed()).toBe(1);
  });

  it('the close button closes it', async () => {
    const { el, closed } = await open();
    el.querySelector<HTMLButtonElement>('.modal__close')!.click();
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(el.querySelector('.modal__close')!.getAttribute('aria-label')).toBe('Zavrieť');
    await new Promise((resolve) => setTimeout(resolve)); // a native dialog fires "close" in a task
    expect(closed()).toBe(1);
  });
});
