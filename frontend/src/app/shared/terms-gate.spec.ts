import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Me } from '../core/auth';
import { TermsGate } from './terms-gate';

const me = (terms_accepted: boolean): Me => ({
  login_enabled: true,
  user: {
    discord_id: '1',
    name: 'Nelly',
    avatar_url: '',
    ingame_name: 'Nelly',
    approved: true,
    terms_accepted,
    is_staff: false,
    is_superuser: false,
  },
});

const tick = async (fixture: { detectChanges(): void }) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

describe('TermsGate', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('asks a signed-in player once, saves the agreement and closes', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TermsGate);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me(false));
    await tick(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(el.querySelector('.modal__title')?.textContent).toBe('Podmienky používania');
    expect(Array.from(el.querySelectorAll('.gate__links a'), (a) => a.getAttribute('href'))).toEqual([
      '/podmienky',
      '/ochrana-udajov',
    ]);
    // Esc does not close it
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);

    el.querySelector<HTMLButtonElement>('.gate__actions .pill-btn')!.click();
    const req = http.expectOne('/api/auth/terms/');
    expect(req.request.method).toBe('POST');
    req.flush(me(true));
    await tick(fixture);
    expect(dialog.open).toBe(false);
    http.verify();
  });

  it('stays closed for a player who agreed and for visitors', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TermsGate);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me(true));
    await tick(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('dialog')!.open).toBe(false);
    http.verify();
  });
});
