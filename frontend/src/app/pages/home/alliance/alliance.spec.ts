import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Alliance, Officer } from '../../../core/api';
import { AllianceSection } from './alliance';

const officer = (name: string, extra: Partial<Officer> = {}): Officer => ({
  name,
  title_sk: 'R4',
  title_cs: 'R4',
  focus_sk: '',
  focus_cs: '',
  discord_id: '',
  discord_username: '',
  ...extra,
});
const DATA: Alliance[] = [
  {
    id: 1,
    tag: 'CS35',
    name: 'CZ/SK Legends',
    officers: [
      officer('Methiu von CzF', { title_sk: 'Vodca', title_cs: 'Vůdce', focus_sk: 'Migrácia, KvK', focus_cs: 'Migrace, KvK' }),
      officer('Gether', { focus_sk: 'Web a eventy' }),
      officer('Hefarion'),
    ],
  },
];

describe('AllianceSection (home)', () => {
  let fixture: ComponentFixture<AllianceSection>;
  const el = () => fixture.nativeElement as HTMLElement;
  const officers = () =>
    [...el().querySelectorAll('.officer')].map((o) => [
      o.querySelector('strong')?.textContent,
      o.querySelector('.officer__focus')?.textContent ?? null,
    ]);

  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // reduced motion: no scroll effects
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.unstubAllGlobals();
  });

  async function render(url: string) {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(AllianceSection);
    fixture.detectChanges();
    TestBed.tick(); // the API requests start in an effect
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/alliances/').flush(DATA);
    http.match(() => true).forEach((req) => req.flush([])); // links and status are not needed here
    await fixture.whenStable();
  }

  it('shows what to contact an officer about only when it is filled in', async () => {
    await render('/');
    expect(officers()).toEqual([
      ['Methiu von CzF', 'Migrácia, KvK'],
      ['Gether', 'Web a eventy'],
      ['Hefarion', null],
    ]);
  });

  it('uses the Czech text, falling back to the Slovak one', async () => {
    await render('/cz');
    expect(officers()).toEqual([
      ['Methiu von CzF', 'Migrace, KvK'],
      ['Gether', 'Web a eventy'],
      ['Hefarion', null],
    ]);
  });
});
