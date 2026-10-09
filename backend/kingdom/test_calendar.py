from datetime import UTC, datetime
from unittest import mock

from django.test import TestCase, override_settings

from guides.models import Guide

from .models import KingdomEvent

URL = '/api/events/'
DAY = 24 * 60


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def make_event(**kwargs):
    defaults = {'name_sk': 'Ruiny', 'starts_at': utc(2026, 10, 10, 18), 'repeat_days': 7, 'duration_minutes': 60}
    return KingdomEvent.objects.create(**{**defaults, **kwargs})


# Thursday 8 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 8, 12))
class EventCalendarTests(TestCase):
    def get(self, **params):
        return self.client.get(URL, params)

    def starts(self, response, event=None):
        return [o['start'] for o in response.json()['occurrences'] if event is None or o['id'] == event.pk]

    def test_default_is_the_current_month_with_whole_weeks(self, _now):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        # October 2026: Thursday 1 → Saturday 31, so Monday 28 September → Sunday 1 November
        self.assertEqual((response.json()['from'], response.json()['to']), ('2026-09-28', '2026-11-01'))
        self.assertEqual(response['Cache-Control'], 'public, max-age=300')
        self.assertNotIn('Cookie', response.get('Vary', ''))

    def test_range_days_are_local_and_inclusive(self, _now):
        event = make_event(starts_at=utc(2026, 10, 3, 22, 30), repeat_days=1, duration_minutes=0)  # 00:30 local
        response = self.get(**{'from': '2026-10-05', 'to': '2026-10-06'})
        # 00:30 on the 5th in Bratislava is the evening of the 4th in UTC
        self.assertEqual(self.starts(response, event), ['2026-10-04T22:30:00Z', '2026-10-05T22:30:00Z'])
        # after the switch to winter time 22:30 UTC is 23:30 – 1 November still belongs to the range
        month = self.starts(self.get(**{'from': '2026-10-01', 'to': '2026-11-01'}))
        self.assertEqual((month[0], month[-1], len(month)), ('2026-10-03T22:30:00Z', '2026-11-01T22:30:00Z', 30))

    def test_bad_ranges_are_rejected(self, _now):
        for params in (
            {'from': '2026-10-01'},
            {'to': '2026-10-31'},
            {'from': '2026-10-01', 'to': 'tomorrow'},
            {'from': '2026-02-30', 'to': '2026-03-02'},
            {'from': '20261001', 'to': '20261031'},
            {'from': '2026-10-31', 'to': '2026-10-01'},
            {'from': '2026-10-01', 'to': '2026-12-02'},  # 63 days
        ):
            with self.subTest(params):
                self.assertEqual(self.get(**params).status_code, 400)
        self.assertEqual(self.get(**{'from': '2026-10-01', 'to': '2026-12-01'}).status_code, 200)  # 62 days
        self.assertEqual(self.get(**{'from': '2026-10-08', 'to': '2026-10-08'}).status_code, 200)

    def test_only_active_events_shown_on_the_web(self, _now):
        visible = make_event()
        make_event(name_sk='Neaktívny', is_active=False)
        make_event(name_sk='Skrytý', show_on_web=False)
        names = {o['name_sk'] for o in self.get().json()['occurrences']}
        self.assertEqual(names, {visible.name_sk})

    def test_running_multi_day_event_counts(self, _now):
        # MGE from Monday 5 October 00:00 UTC for 6 days, every 8 weeks
        mge = make_event(name_sk='MGE', starts_at=utc(2026, 10, 5), repeat_days=56, duration_minutes=6 * DAY)
        response = self.get(**{'from': '2026-10-08', 'to': '2026-10-31'})
        self.assertEqual(self.starts(response, mge), ['2026-10-05T00:00:00Z'])
        occurrence = response.json()['occurrences'][0]
        self.assertEqual(occurrence['end'], '2026-10-11T00:00:00Z')
        # ended the day before the range → left out; an event without a duration has no end
        self.assertEqual(self.starts(self.get(**{'from': '2026-10-12', 'to': '2026-10-31'}), mge), [])
        make_event(name_sk='Bez konca', starts_at=utc(2026, 10, 9, 18), repeat_days=0, duration_minutes=0)
        endless = [o for o in self.get().json()['occurrences'] if o['name_sk'] == 'Bez konca']
        self.assertEqual([o['end'] for o in endless], [None])

    def test_sorted_by_start_and_capped(self, _now):
        late = make_event(name_sk='Neskoro', starts_at=utc(2026, 10, 1, 20), repeat_days=1)
        early = make_event(name_sk='Skoro', starts_at=utc(2026, 10, 1, 6), repeat_days=1)
        starts = self.starts(self.get())
        self.assertEqual(starts, sorted(starts))
        self.assertEqual([o['id'] for o in self.get().json()['occurrences'][:2]], [early.pk, late.pk])
        with mock.patch('kingdom.views.MAX_OCCURRENCES', 5):
            self.assertEqual(len(self.starts(self.get())), 5)

    def test_irregular_events_with_and_without_a_date(self, _now):
        waiting = make_event(name_sk='Silk Road', starts_at=utc(2026, 10, 1, 18), repeat_days=0, irregular=True)
        planned = make_event(name_sk='Shadow Legion', starts_at=utc(2026, 10, 9, 18), repeat_days=0, irregular=True)
        make_event(name_sk='Skrytý', starts_at=utc(2026, 10, 1, 18), repeat_days=0, irregular=True, show_on_web=False)
        data = self.get().json()
        # every irregular event, the next date first; a waiting one has no date
        self.assertEqual(
            data['irregular'],
            [
                {
                    'id': planned.pk,
                    'name_sk': 'Shadow Legion',
                    'name_cs': '',
                    'icon': '/static/kingdom/events/shadow-legion.webp',
                    'offered': [10, 60],
                    'guide': None,
                    'start': '2026-10-09T18:00:00Z',
                    'end': '2026-10-09T19:00:00Z',
                },
                {
                    'id': waiting.pk,
                    'name_sk': 'Silk Road',
                    'name_cs': '',
                    'icon': '/static/kingdom/events/silk-road.webp',
                    'offered': [10, 60],
                    'guide': None,
                    'start': None,
                    'end': None,
                },
            ],
        )
        # the past start of a waiting event is only a placeholder → not in the calendar
        self.assertEqual([(o['id'], o['irregular']) for o in data['occurrences']], [(planned.pk, True)])

        # running right now: in the calendar, and with its date in the list
        KingdomEvent.objects.filter(pk=waiting.pk).update(starts_at=utc(2026, 10, 8, 11, 30))
        data = self.get().json()
        self.assertEqual(
            [(e['id'], e['start']) for e in data['irregular']],
            [(waiting.pk, '2026-10-08T11:30:00Z'), (planned.pk, '2026-10-09T18:00:00Z')],
        )
        self.assertEqual([o['id'] for o in data['occurrences']], [waiting.pk, planned.pk])

    def test_guide_only_when_published(self, _now):
        guide = Guide.objects.create(
            category='eventy', slug='mge', title_sk='MGE návod', title_cs='MGE návod CZ', html_sk='<p>x</p>'
        )
        make_event(guide=guide)
        self.assertEqual(
            self.get().json()['occurrences'][0]['guide'],
            {'category': 'eventy', 'slug': 'mge', 'title_sk': 'MGE návod', 'title_cs': 'MGE návod CZ'},
        )
        Guide.objects.filter(pk=guide.pk).update(is_published=False)
        self.assertIsNone(self.get().json()['occurrences'][0]['guide'])

    def test_exposes_nothing_private(self, _now):
        make_event(message='Tajný text', mention_role_id='123456', reminders=[60], player_reminders=[15, 60])
        make_event(name_sk='Silk Road', starts_at=utc(2026, 10, 1, 18), repeat_days=0, irregular=True)
        data = self.get().json()
        self.assertEqual(set(data), {'from', 'to', 'occurrences', 'irregular'})
        self.assertEqual(
            set(data['occurrences'][0]),
            {'id', 'name_sk', 'name_cs', 'icon', 'start', 'end', 'repeat_days', 'irregular', 'offered', 'guide'},
        )
        self.assertEqual(
            set(data['irregular'][0]), {'id', 'name_sk', 'name_cs', 'icon', 'offered', 'guide', 'start', 'end'}
        )
        self.assertNotIn('Tajný', str(data))
        self.assertNotIn('123456', str(data))

    def test_public_for_signed_in_users_too(self, _now):
        from django.contrib.auth.models import User

        self.client.force_login(User.objects.create_user('discord_1'))
        make_event()
        self.assertEqual(self.get().status_code, 200)


@override_settings(SITE_URL='https://kd1035.test')
class CalendarSitemapTests(TestCase):
    def test_sitemap_lists_the_calendar_in_both_languages(self):
        xml = self.client.get('/sitemap.xml').content.decode()
        self.assertIn('<loc>https://kd1035.test/kalendar</loc>', xml)
        self.assertIn('<loc>https://kd1035.test/cz/kalendar</loc>', xml)
