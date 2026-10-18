import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Me, Player } from '../core/auth';
import { PendingApproval } from './pending-approval';

const NELLY: Player = {
  discord_id: '1',
  name: 'Nelly',
  avatar_url: '',
  ingame_name: 'Nelly',
  approved: false,
  terms_accepted: true,
  is_staff: false,
  is_superuser: false,
};

describe('PendingApproval', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  /** the card asks who is signed in again as it shows – every answer is the same player */
  async function render(user: Player): Promise<string> {
    const fixture = TestBed.createComponent(PendingApproval);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const me: Me = { login_enabled: true, user };
    http.match('/api/auth/me/').forEach((req) => req.flush(me));
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('.pending__text')?.textContent?.trim() ?? '';
  }

  it('promises the bot message to a player with Discord', async () => {
    expect(await render(NELLY)).toContain('napíše bot na Discorde');
  });

  it('says nothing about the bot or Discord to a player without Discord', async () => {
    const text = await render({ ...NELLY, discord_id: null, local: true });
    expect(text).toContain('táto stránka sa otvorí sama');
    expect(text).not.toMatch(/bot|Discord/);
  });
});
