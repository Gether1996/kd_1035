import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Me } from '../../core/auth';
import { Scroll } from '../../core/scroll';
import { Account } from './account';
import { Reminders } from './reminders/reminders';

// the reminders section of a signed-in player has its own tests
@Component({ selector: 'app-reminders', template: '' })
class NoReminders {}

describe('Account', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // no parallax in the page header
        { provide: Scroll, useValue: { scrolled: signal(false), reducedMotion: true } },
      ],
    });
    TestBed.overrideComponent(Account, { remove: { imports: [Reminders] }, add: { imports: [NoReminders] } });
  });

  async function render(me: Me) {
    const fixture = TestBed.createComponent(Account);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me/').flush(me);
    // admin content for SEO (links) is not under test
    TestBed.tick();
    http.match(() => true).forEach((req) => req.flush('down', { status: 500, statusText: 'Server Error' }));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const privacyLink = (el: HTMLElement) => el.querySelector('.card__privacy');

  it('links the login card to the privacy page', async () => {
    const el = await render({ login_enabled: true, user: null });
    expect(el.querySelector('#account-login')).not.toBeNull();
    expect(privacyLink(el)?.getAttribute('href')).toBe('/ochrana-udajov');
    expect(privacyLink(el)?.textContent).toContain('Čo o tebe ukladáme');
  });

  it('links the signed-in card to the privacy page', async () => {
    const el = await render({
      login_enabled: true,
      user: { discord_id: '1', name: 'Nelly', avatar_url: '', ingame_name: '', is_staff: false, is_superuser: false },
    });
    expect(el.querySelector('#account-name')?.textContent).toContain('Nelly');
    expect(privacyLink(el)?.getAttribute('href')).toBe('/ochrana-udajov');
  });
});
