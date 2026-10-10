import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReminderSettings, RemindersApi } from './reminders-api';

const SETTINGS: ReminderSettings = {
  discord: true,
  discord_available: true,
  lang: 'sk',
  last_delivery: null,
  events: [
    {
      id: 1,
      name_sk: 'Ruiny',
      name_cs: '',
      icon: null,
      next_start: '2026-10-10T18:00:00Z',
      running_until: null,
      repeat_days: 7,
      duration_minutes: 60,
      irregular: false,
      offered: [10, 60],
      offsets: [60, 10],
    },
  ],
};

describe('RemindersApi', () => {
  let api: RemindersApi;
  let http: HttpTestingController;

  function setup(platform = 'browser') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: platform }],
    });
    api = TestBed.inject(RemindersApi);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.verify());

  it('loads the settings in the browser', async () => {
    setup();
    const settings = TestBed.runInInjectionContext(() => api.settings());
    TestBed.tick();
    http.expectOne('/api/me/reminders/').flush(SETTINGS);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(settings.value()?.events[0].offsets).toEqual([60, 10]);
  });

  it('never calls the API while prerendering', () => {
    setup('server');
    const settings = TestBed.runInInjectionContext(() => api.settings());
    TestBed.tick();
    http.expectNone('/api/me/reminders/');
    expect(settings.hasValue()).toBe(false);
  });

  it('saves the times of an event, an empty list stops the reminders', async () => {
    setup();
    const save = api.setOffsets(1, [60, 25]);
    const put = http.expectOne('/api/me/reminders/1/');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ offsets: [60, 25] });
    put.flush({ ...SETTINGS.events[0], offsets: [60, 25] });
    expect(await save).toEqual([60, 25]);

    const stop = api.setOffsets(1, []);
    const del = http.expectOne('/api/me/reminders/1/');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    expect(await stop).toBeNull();
  });

  it('changes the channel and the language of the messages', async () => {
    setup();
    const update = api.update({ discord: false, lang: 'cs' });
    const patch = http.expectOne('/api/me/reminders/');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ discord: false, lang: 'cs' });
    patch.flush({ discord: false, lang: 'cs' });
    await update;
  });

  it('a test message says whether the bot can reach the player', async () => {
    setup();
    const answers: [object, number, string][] = [
      [{ ok: true }, 200, 'ok'],
      [{ ok: false, reason: 'blocked' }, 200, 'blocked'],
      [{ ok: false, reason: 'unavailable' }, 200, 'unavailable'],
      [{ detail: 'Throttled' }, 429, 'throttled'],
      [{ detail: 'Forbidden' }, 403, 'unavailable'],
    ];
    for (const [body, status, result] of answers) {
      const test = api.testDm();
      const post = http.expectOne('/api/me/reminders/test/');
      expect(post.request.method).toBe('POST');
      post.flush(body, { status, statusText: String(status) });
      expect(await test).toBe(result);
    }
  });

  it('a refused change rejects', async () => {
    setup();
    const save = api.setOffsets(1, [99999]);
    http.expectOne('/api/me/reminders/1/').flush({ offsets: ['invalid'] }, { status: 400, statusText: 'Bad Request' });
    await expect(save).rejects.toBeTruthy();
  });
});
