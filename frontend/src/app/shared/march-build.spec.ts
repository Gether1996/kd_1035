import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ARMORY } from '../core/armory-testing';
import { CommanderEntry, IndexedCommander } from '../core/commander-index';
import { March } from '../core/kvk-api';
import { MarchBuild } from './march-build';

const pic = (name: string) => ({ name, icon: '' });
const entry = (slug: string, partners: string[]): CommanderEntry => ({
  slug,
  category: 'commanderi',
  title_sk: `Návod ${slug}`,
  title_cs: `Návod CZ ${slug}`,
  role: 'primary',
  partners: partners.map(pic),
  context_sk: '',
  context_cs: '',
});
const INDEX: IndexedCommander[] = [
  { ...pic('Attila'), entries: [entry('pary-pre-jazdu', ['Achilles'])] },
  { ...pic('Sun Tzu'), entries: [entry('pary-pre-f2p-a-zaciatok', ['Attila'])] },
];

const march = (id: number, primary: string, secondary: string): March => ({ id, position: id, kind: 'cavalry', primary, secondary });

@Component({
  imports: [MarchBuild],
  template: `@for (m of marches(); track m.id) {
    <app-march-build [march]="m" />
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Cards {
  readonly marches = signal([
    march(1, 'Attila', 'Achilles'),
    march(2, 'Attila', 'Subutai'),
    march(3, 'Sun Tzu', 'Attila'),
    march(4, 'Nobody', 'Attila'),
  ]);
}

describe('MarchBuild – the link to our guides', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function render(answer: (http: HttpTestingController) => void) {
    const fixture = TestBed.createComponent(Cards);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/armory/').flush(ARMORY);
    // one request however many cards
    answer(http);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const links = [...el.querySelectorAll('app-march-build')].map((card) => {
      const a = card.querySelector<HTMLAnchorElement>('a.mb__guide');
      return a ? [a.textContent?.trim(), a.getAttribute('href')] : null;
    });
    http.verify();
    return links;
  }

  it('links the pair to its guide, a known primary to the finder, nothing for a hidden or unknown one', async () => {
    const links = await render((http) => http.expectOne('/api/commanders/').flush(INDEX));
    expect(links).toEqual([
      ['Návod k páru', '/navody/commanderi/pary-pre-jazdu'],
      ['Páry pre Attila', '/navody?commander=attila#najdi-par'],
      null,
      null,
    ]);
  });

  it('links in the language of the page', async () => {
    await TestBed.inject(Router).navigateByUrl('/cz/marche');
    const links = await render((http) => http.expectOne('/api/commanders/').flush(INDEX));
    expect(links.slice(0, 2)).toEqual([
      ['Návod k páru', '/cz/navody/commanderi/pary-pre-jazdu'],
      ['Páry pro Attila', '/cz/navody?commander=attila#najdi-par'],
    ]);
  });

  it('shows no link and no error when the index fails', async () => {
    const links = await render((http) =>
      http.expectOne('/api/commanders/').flush('down', { status: 502, statusText: 'Bad Gateway' }),
    );
    expect(links).toEqual([null, null, null, null]);
  });
});
