import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { sk } from '../../core/i18n/sk';
import { Privacy } from './privacy';

describe('Privacy', () => {
  beforeEach(() => {
    // the page header parallax and the scroll reveal need browser APIs that jsdom does not have
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lists every section, the Discord privacy policy and links to the account page and leadership', async () => {
    const fixture = TestBed.createComponent(Privacy);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    // the numbered sections + the contact block
    expect(el.querySelectorAll('.block').length).toBe(sk.privacyPage.sections.length + 1);
    const text = el.textContent ?? '';
    for (const word of ['csrftoken', 'sessionid', 'kd1035.lang', '30 dní', '8 týždňov', 'Zmazať účet']) {
      expect(text).toContain(word);
    }

    const external = el.querySelector('a[target="_blank"]');
    expect(external?.getAttribute('href')).toBe('https://discord.com/privacy');
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer');
    const internal = Array.from(el.querySelectorAll('.links a'), (a) => a.getAttribute('href'));
    expect(internal).toEqual(['/ucet', '/#alliance']);
    expect(el.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
