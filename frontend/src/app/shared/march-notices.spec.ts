import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MarchNotices, NoticePlayer } from './march-notices';

const player = (id: number, change: Partial<NoticePlayer> = {}): NoticePlayer => ({
  id,
  name: `p${id}`,
  ingame_name: `P${id}`,
  avatar_url: '',
  marches: 1,
  text: `Ahoj P${id}, …\n\n1. march · jazda · Attila\n• Chýba sekundárny commander`,
  muted: false,
  told_at: null,
  last: null,
  ...change,
});

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('MarchNotices', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('previews the messages, ticks whom it may tell and queues them (Gether 14. 10. 2026)', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MarchNotices);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // nothing is asked before the button
    http.expectNone('/api/marches/notices/');
    el.querySelector<HTMLButtonElement>('.pill-btn')!.click();
    http.expectOne('/api/marches/notices/').flush({
      bot: true,
      players: [
        player(1, { marches: 2 }),
        player(2, { muted: true }),
        player(3, { told_at: '2026-10-14T10:00:00Z', last: { state: 'sent', at: '2026-10-14T10:00:00Z', error: '' } }),
        player(4, { last: { state: 'failed', at: '2026-10-14T10:00:00Z', error: 'DM zablokované' } }),
      ],
    });
    await settle();
    fixture.detectChanges();
    const checks = Array.from(el.querySelectorAll<HTMLInputElement>('.notice__check'));
    expect(checks.map((c) => c.checked)).toEqual([true, false, false, true]);
    expect(checks[1].disabled).toBe(true);
    expect(el.querySelector('.notice__name span')?.textContent).toBe('2 marche na opravu');
    expect(el.querySelector('.notice__text')?.textContent).toContain('Chýba sekundárny commander');
    expect(el.querySelector('.notice__error')?.textContent).toContain('DM zablokované');
    const send = el.querySelector<HTMLButtonElement>('.notices__actions .pill-btn')!;
    expect(send.textContent).toContain('Odoslať (2)');

    // untick the failed one, send the rest
    checks[3].click();
    fixture.detectChanges();
    send.click();
    const req = http.expectOne((r) => r.method === 'POST');
    expect(req.request.body).toEqual({ players: [1] });
    req.flush({ queued: 1 });
    await settle();
    http.expectOne('/api/marches/notices/').flush({ bot: true, players: [] });
    await settle();
    fixture.detectChanges();
    expect(el.textContent).toContain('Nikto nemá v marchoch chybu.');
  });

  it('says when the bot is not set up and sends nothing', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MarchNotices);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.pill-btn')!.click();
    http.expectOne('/api/marches/notices/').flush({ bot: false, players: [player(1)] });
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('.notices__warn')?.textContent).toContain('Bot nie je nastavený');
    expect(el.querySelector<HTMLButtonElement>('.notices__actions .pill-btn')!.disabled).toBe(true);
  });
});
