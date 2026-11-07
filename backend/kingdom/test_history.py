from datetime import timedelta
from importlib import import_module
from unittest import mock

from django.apps import apps
from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from . import history
from .models import EventDate, EventNotification, EventRun, EventVariant, KingdomEvent
from .test_irregular import LIST, date_url, utc


# Thursday 8 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 8, 12))
@override_settings(DISCORD_WEBHOOK_URL='')
class EventDateHistoryTests(TestCase):
    """Every date an irregular event gets is remembered (Gether 7. 11. 2026) – the next one guessed from the gaps."""

    def setUp(self):
        self.silk = KingdomEvent.objects.create(
            name_sk='Silk Road',
            starts_at=utc(2026, 10, 1, 18),  # no date yet (event_templates.NOT_PLANNED)
            irregular=True,
            duration_minutes=60,
            time_basis=KingdomEvent.TimeBasis.LOCAL,
        )
        self.client.force_login(User.objects.create_superuser('gether', password='x'))

    def dates(self, event=None):
        return list(EventDate.objects.filter(event=event or self.silk).order_by('start').values_list('start', 'end'))

    def put(self, start):
        return self.client.put(date_url(self.silk), {'start': start}, content_type='application/json')

    def test_a_date_set_is_remembered_a_moved_future_one_is_not(self, _now):
        # no date: nothing
        self.assertEqual(self.dates(), [])
        self.assertEqual(self.put('2026-10-20T18:00:00Z').status_code, 200)
        self.assertEqual(self.dates(), [(utc(2026, 10, 20, 18), utc(2026, 10, 20, 19))])
        # moved before it happened: a correction, the first one goes
        self.put('2026-10-21T18:00:00Z')
        self.assertEqual(self.dates(), [(utc(2026, 10, 21, 18), utc(2026, 10, 21, 19))])
        # cancelled before it happened: gone too
        self.client.delete(date_url(self.silk))
        self.assertEqual(self.dates(), [])

    def test_a_date_that_happened_stays_when_the_next_is_set(self, now):
        self.silk.starts_at = utc(2026, 10, 9, 18)
        self.silk.save()
        # a week later the game announces the next one
        now.return_value = utc(2026, 10, 15, 12)
        self.put('2026-10-23T18:00:00Z')
        self.assertEqual([start for start, _ in self.dates()], [utc(2026, 10, 9, 18), utc(2026, 10, 23, 18)])
        # set in the Django admin (the model's save): the same
        self.silk.starts_at = utc(2026, 11, 6, 18)
        now.return_value = utc(2026, 10, 25, 12)
        self.silk.save()
        self.assertEqual(len(self.dates()), 3)
        # regular events keep no history
        regular = KingdomEvent.objects.create(name_sk='MGE', starts_at=utc(2026, 10, 5), repeat_days=7)
        regular.starts_at = utc(2026, 10, 12)
        regular.save()
        self.assertEqual(self.dates(regular), [])

    def test_the_usual_gap_and_a_guess_of_the_next_date(self, now):
        self.assertEqual(history.summary(self.silk), {'dates': [], 'every_days': None, 'guess': None})
        for start in (utc(2026, 8, 14, 18), utc(2026, 9, 11, 18)):
            EventDate.objects.create(event=self.silk, start=start)
        # two dates: the gap and a first guess, moved past today by the same gap
        self.assertEqual(
            history.summary(self.silk),
            {
                'dates': ['2026-09-11T18:00:00Z', '2026-08-14T18:00:00Z'],
                'every_days': 28,
                'guess': '2026-10-09T18:00:00Z',
            },
        )
        # the usual gap is the median: one odd gap does not move it
        for start in (utc(2026, 7, 17, 18), utc(2026, 6, 5, 18)):
            EventDate.objects.create(event=self.silk, start=start)
        summary = history.summary(self.silk)
        self.assertEqual((summary['every_days'], summary['guess']), (28, '2026-10-09T18:00:00Z'))
        now.return_value = utc(2026, 10, 12)
        self.assertEqual(history.summary(self.silk)['guess'], '2026-11-06T18:00:00Z')

    def test_the_calendar_editor_gets_it_for_irregular_events_only(self, _now):
        EventDate.objects.create(event=self.silk, start=utc(2026, 9, 11, 18))
        KingdomEvent.objects.create(name_sk='MGE', starts_at=utc(2026, 10, 5), repeat_days=7)
        rows = {e['name_sk']: e for e in self.client.get(LIST).json()['events']}
        self.assertEqual(rows['Silk Road']['history'], {'dates': ['2026-09-11T18:00:00Z'], 'every_days': None, 'guess': None})
        self.assertIsNone(rows['MGE']['history'])

    def test_the_migration_fills_in_what_is_left(self, _now):
        variant = EventVariant.objects.create(event=self.silk, name_sk='A')
        EventRun.objects.create(event=self.silk, start=utc(2026, 8, 14, 18), variant=variant)
        EventNotification.objects.create(
            title='Silk Road', message='x', send_at=utc(2026, 9, 11, 17), event=self.silk, occurrence_start=utc(2026, 9, 11, 18)
        )
        EventDate.objects.all().delete()
        import_module('kingdom.migrations.0025_backfill_event_dates').backfill(apps, None)
        # the date it has now is the placeholder (no date) – left out
        self.assertEqual(self.dates(), [(utc(2026, 8, 14, 18), utc(2026, 8, 14, 19)), (utc(2026, 9, 11, 18), utc(2026, 9, 11, 19))])
        # twice: nothing more
        import_module('kingdom.migrations.0025_backfill_event_dates').backfill(apps, None)
        self.assertEqual(len(self.dates()), 2)

    def test_placeholder(self, _now):
        self.assertTrue(history.placeholder(self.silk))
        self.silk.starts_at = utc(2026, 10, 1, 18) + timedelta(days=3)
        self.assertFalse(history.placeholder(self.silk))
