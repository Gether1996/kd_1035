import gzip
import json
import sqlite3
import tempfile
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import User
from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from accounts.models import EventReminder, Player
from guides.models import Guide

from . import backups, discord, events
from .admin import local_time, repeat_text
from .models import TWIN_EVENT_ERROR, Alliance, EventNotification, KingdomEvent, SocialLink

Status = EventNotification.Status


def utc(*args):
    return datetime(*args, tzinfo=UTC)


class ApiTests(TestCase):
    def test_health(self):
        self.assertEqual(self.client.get('/api/health/').json(), {'status': 'ok'})

    def test_alliances_hide_inactive(self):
        Alliance.objects.create(tag='OFF', name='Hidden', is_active=False)
        data = self.client.get('/api/alliances/').json()
        self.assertEqual([a['tag'] for a in data], ['CS35'])  # seeded by migration
        self.assertEqual(set(data[0]), {'id', 'tag', 'name', 'officers'})
        self.assertEqual([o['name'] for o in data[0]['officers']], ['Methiu von CzF', 'Gether', 'Hefarion'])

    def test_links_hide_inactive(self):
        # both links are seeded by migration
        SocialLink.objects.filter(platform='facebook').update(is_active=False)
        self.assertEqual(self.client.get('/api/links/').json(), [{'platform': 'discord', 'url': 'https://discord.gg/NhwP6y9ssM'}])


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', DISCORD_EVENT_ROLE_ID='42')
class DiscordTests(TestCase):
    def make(self, minutes_ago=1, **kwargs):
        return EventNotification.objects.create(
            title='MGE', send_at=timezone.now() - timedelta(minutes=minutes_ago), **kwargs
        )

    def test_sends_only_due_notifications(self):
        due = self.make()
        later = self.make(minutes_ago=-60)
        with mock.patch.object(discord, 'post') as post:
            self.assertEqual(discord.send_due(), 1)
        post.assert_called_once_with(due)
        due.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(due.status, EventNotification.Status.SENT)
        self.assertIsNotNone(due.sent_at)
        self.assertEqual(later.status, EventNotification.Status.PENDING)

    def test_failure_is_stored(self):
        n = self.make()
        with mock.patch.object(discord, 'post', side_effect=discord.DiscordError('boom')):
            discord.send_due()
        n.refresh_from_db()
        self.assertEqual((n.status, n.error), (EventNotification.Status.FAILED, 'boom'))

    def test_long_missed_notification_is_not_sent(self):
        n = self.make(minutes_ago=60 * 24)
        with mock.patch.object(discord, 'post') as post:
            discord.send_due()
        post.assert_not_called()
        n.refresh_from_db()
        self.assertEqual(n.status, EventNotification.Status.FAILED)

    def test_payload_pings_role(self):
        n = self.make()
        with mock.patch('urllib.request.urlopen') as urlopen:
            discord.post(n)
        request = urlopen.call_args.args[0]
        self.assertIn(b'"content": "<@&42>"', request.data)
        self.assertIn(b'"roles": ["42"]', request.data)

    @override_settings(DISCORD_WEBHOOK_URL='')
    def test_missing_webhook_is_an_error(self):
        with self.assertRaises(discord.DiscordError):
            discord.post(self.make())

    def test_reminder_cancelled_after_the_query_is_not_sent(self):
        first, second = self.make(minutes_ago=2), self.make()

        def cancel_second(notification):
            # the admin cancels the second one while the worker is posting the first
            EventNotification.objects.filter(pk=second.pk).update(status=Status.CANCELLED)

        with mock.patch.object(discord, 'post', side_effect=cancel_second) as post:
            self.assertEqual(discord.send_due(), 1)
        post.assert_called_once_with(first)
        second.refresh_from_db()
        self.assertEqual((second.status, second.sent_at), (Status.CANCELLED, None))


class OccurrenceTests(SimpleTestCase):
    def event(self, **kwargs):
        return KingdomEvent(**{'name_sk': 'Ruiny', 'repeat_days': 7, **kwargs})

    def test_utc_basis_keeps_utc_hour_across_october_dst(self):
        # 2026-10-25 = last Sunday of October: Bratislava goes from UTC+2 to UTC+1
        event = self.event(starts_at=utc(2026, 10, 18, 18), time_basis='utc')
        got = list(events.occurrences(event, utc(2026, 10, 1), utc(2026, 11, 5)))
        self.assertEqual(got, [utc(2026, 10, 18, 18), utc(2026, 10, 25, 18), utc(2026, 11, 1, 18)])
        self.assertEqual([d.astimezone(events.LOCAL_TZ).hour for d in got], [20, 19, 19])

    def test_local_basis_keeps_bratislava_hour_across_october_dst(self):
        event = self.event(starts_at=utc(2026, 10, 18, 18), time_basis='local')
        got = list(events.occurrences(event, utc(2026, 10, 1), utc(2026, 11, 5)))
        self.assertEqual(got, [utc(2026, 10, 18, 18), utc(2026, 10, 25, 19), utc(2026, 11, 1, 19)])
        self.assertEqual([d.astimezone(events.LOCAL_TZ).hour for d in got], [20, 20, 20])

    def test_jumps_straight_to_the_window(self):
        daily = self.event(starts_at=utc(2026, 1, 1, 12), repeat_days=1)
        self.assertEqual(next(events.occurrences(daily, utc(2030, 6, 1, 12, 0, 1))), utc(2030, 6, 2, 12))
        self.assertEqual(next(events.occurrences(daily, utc(2030, 6, 1, 12))), utc(2030, 6, 1, 12))  # inclusive
        # 12:00 Bratislava = 11:00 UTC in winter, 10:00 UTC in summer
        local = self.event(starts_at=utc(2026, 1, 1, 11), repeat_days=1, time_basis='local')
        self.assertEqual(next(events.occurrences(local, utc(2030, 6, 1, 10))), utc(2030, 6, 1, 10))
        self.assertEqual(next(events.occurrences(local, utc(2030, 6, 1, 10, 1))), utc(2030, 6, 2, 10))
        # before the first start → the first start
        self.assertEqual(next(events.occurrences(daily, utc(2020, 1, 1))), utc(2026, 1, 1, 12))

    def test_until_includes_the_whole_local_day(self):
        # 21:30 UTC = 23:30 in Bratislava (summer time)
        event = self.event(starts_at=utc(2026, 9, 20, 21, 30), repeat_days=1, until=date(2026, 9, 22))
        got = list(events.occurrences(event, utc(2026, 9, 1), utc(2026, 12, 1)))
        self.assertEqual(got, [utc(2026, 9, 20, 21, 30), utc(2026, 9, 21, 21, 30), utc(2026, 9, 22, 21, 30)])
        self.assertEqual(list(events.occurrences(event, utc(2026, 9, 23))), [])  # unbounded end stops too

    def test_one_off_event(self):
        event = self.event(starts_at=utc(2026, 10, 20, 18), repeat_days=0)
        self.assertEqual(list(events.occurrences(event, utc(2026, 10, 1), utc(2026, 12, 1))), [utc(2026, 10, 20, 18)])
        self.assertEqual(list(events.occurrences(event, utc(2026, 10, 20, 18, 0, 1))), [])
        self.assertEqual(list(events.occurrences(event, utc(2026, 10, 1), utc(2026, 10, 20, 18))), [])

    def test_render_placeholders_and_keeps_unknown_braces(self):
        event = self.event(
            starts_at=utc(2026, 10, 20, 18),
            duration_minutes=90,
            message='{name}: {start} ({relative}) – {end} {foo} {0} {',
        )
        unix = int(utc(2026, 10, 20, 18).timestamp())
        self.assertEqual(
            events.render(event, utc(2026, 10, 20, 18)),
            f'Ruiny: <t:{unix}:F> (<t:{unix}:R>) – <t:{unix + 5400}:t> {{foo}} {{0}} {{',
        )


class RepeatTextTests(SimpleTestCase):
    def test_slovak_plurals(self):
        expected = {
            0: 'jednorazovo',
            1: 'denne',
            2: 'každé 2 dni',
            3: 'každé 3 dni',
            4: 'každé 4 dni',
            5: 'každých 5 dní',
            7: 'týždenne',
            10: 'každých 10 dní',
            14: 'každé 2 týždne',
            28: 'každé 4 týždne',
            56: 'každých 8 týždňov',
        }
        self.assertEqual({days: repeat_text(days) for days in expected}, expected)


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', DISCORD_EVENT_ROLE_ID='42')
class PlanRemindersTests(TestCase):
    now = utc(2026, 10, 7, 12)

    def make(self, **kwargs):
        defaults = {
            'name_sk': 'Ruiny',
            'message': 'Začiatok {start}',
            'starts_at': utc(2026, 10, 8, 18),  # tomorrow, weekly
            'repeat_days': 7,
            'reminders': [60, 0],
        }
        return KingdomEvent.objects.create(**{**defaults, **kwargs})

    def test_plans_reminders_within_horizon_once(self):
        event = self.make()
        self.assertEqual(events.plan_reminders(now=self.now), 2)
        self.assertEqual(events.plan_reminders(now=self.now), 0)
        self.assertEqual(events.plan_reminders(now=self.now + timedelta(hours=1)), 0)
        rows = list(event.notifications.order_by('send_at'))
        self.assertEqual([n.send_at for n in rows], [utc(2026, 10, 8, 17), utc(2026, 10, 8, 18)])
        self.assertEqual([n.offset_minutes for n in rows], [60, 0])
        for n in rows:
            self.assertEqual((n.status, n.title, n.event_start), (Status.PENDING, 'Ruiny', utc(2026, 10, 8, 18)))
            self.assertEqual(n.message, f'Začiatok <t:{int(utc(2026, 10, 8, 18).timestamp())}:F>')
        # next week's occurrence is outside the 48 h horizon
        self.assertFalse(event.notifications.filter(occurrence_start=utc(2026, 10, 15, 18)).exists())

    def test_reminder_whose_time_passed_is_skipped(self):
        event = self.make(starts_at=self.now + timedelta(hours=3), reminders=[1440, 0])
        self.assertEqual(events.plan_reminders(now=self.now), 1)
        self.assertEqual(event.notifications.get().offset_minutes, 0)

    def test_unique_reminder_per_occurrence(self):
        event = self.make()
        events.plan_reminders(now=self.now)
        with self.assertRaises(IntegrityError), transaction.atomic():
            EventNotification.objects.create(
                title='x', send_at=self.now, event=event, occurrence_start=utc(2026, 10, 8, 18), offset_minutes=0
            )
        # manual notifications (no event) are not restricted
        EventNotification.objects.create(title='a', send_at=self.now)
        EventNotification.objects.create(title='b', send_at=self.now)

    def test_cancelled_reminder_is_not_recreated(self):
        event = self.make()
        events.plan_reminders(now=self.now)
        event.notifications.filter(offset_minutes=60).update(status=Status.CANCELLED)
        events.replan(event, now=self.now)
        events.plan_reminders(now=self.now)
        self.assertEqual(event.notifications.count(), 2)
        self.assertEqual(event.notifications.get(offset_minutes=60).status, Status.CANCELLED)
        with mock.patch.object(discord, 'post') as post:
            discord.send_due(now=utc(2026, 10, 8, 17, 1))
        post.assert_not_called()

    def test_replan_after_time_change_keeps_history(self):
        event = self.make(reminders=[1440, 180, 60, 0])
        self.assertEqual(events.plan_reminders(now=self.now), 4)
        for offset, status in [(1440, Status.SENT), (180, Status.FAILED), (60, Status.CANCELLED)]:
            event.notifications.filter(offset_minutes=offset).update(status=status)
        due = {'send_at': self.now - timedelta(minutes=1), 'occurrence_start': self.now, 'offset_minutes': 0}
        past_pending = EventNotification.objects.create(title='Ruiny', event=event, **due)
        event.starts_at = utc(2026, 10, 8, 20)
        event.save()
        self.assertEqual(events.replan(event, now=self.now), 4)
        old = event.notifications.filter(occurrence_start=utc(2026, 10, 8, 18))
        self.assertEqual(
            sorted(old.values_list('offset_minutes', 'status')),
            [(60, Status.CANCELLED), (180, Status.FAILED), (1440, Status.SENT)],
        )
        new = event.notifications.filter(occurrence_start=utc(2026, 10, 8, 20))
        self.assertEqual(sorted(new.values_list('offset_minutes', flat=True)), [0, 60, 180, 1440])
        self.assertEqual(new.filter(status=Status.PENDING).count(), 4)
        self.assertTrue(EventNotification.objects.filter(pk=past_pending.pk).exists())  # about to be sent

    def test_inactive_expired_or_silent_events_plan_nothing(self):
        self.make(is_active=False)
        self.make(notify_discord=False)
        self.make(starts_at=utc(2026, 9, 3, 18), until=date(2026, 10, 1))
        self.make(starts_at=utc(2026, 10, 1, 18), repeat_days=0)
        self.assertEqual(events.plan_reminders(now=self.now), 0)
        self.assertFalse(EventNotification.objects.exists())

    @override_settings(DISCORD_WEBHOOK_URL='')
    def test_without_webhook_nothing_is_planned(self):
        event = self.make()
        self.assertEqual(events.plan_reminders(now=self.now), 0)
        self.assertEqual(events.replan(event, now=self.now), 0)
        self.assertFalse(EventNotification.objects.exists())


class EventValidationTests(TestCase):
    def event(self, **kwargs):
        return KingdomEvent(**{'name_sk': 'Ruiny', 'starts_at': utc(2026, 10, 8, 18), **kwargs})

    def test_cancelled_status_is_valid(self):
        EventNotification(title='MGE', send_at=timezone.now(), status=Status.CANCELLED).full_clean()

    def test_role_ids_are_digits_only(self):
        self.event(mention_role_id='123456789012345678').full_clean()
        with self.assertRaises(ValidationError) as ctx:
            self.event(mention_role_id='@Eventy').full_clean()
        self.assertIn('mention_role_id', ctx.exception.error_dict)
        with self.assertRaises(ValidationError) as ctx:
            EventNotification(title='MGE', send_at=timezone.now(), mention_role_id='12 34').full_clean()
        self.assertIn('mention_role_id', ctx.exception.error_dict)

    def test_reminders_only_from_the_offered_choices(self):
        with self.assertRaises(ValidationError) as ctx:
            self.event(reminders=[60, 45]).full_clean()
        self.assertIn('reminders', ctx.exception.error_dict)

    def test_message_must_fit_after_expanding_times(self):
        self.event(message='{start} ' * 200).full_clean()
        with self.assertRaises(ValidationError) as ctx:
            self.event(message='{start}' * 400).full_clean()  # 2 800 chars → 6 400 on Discord
        self.assertIn('message', ctx.exception.error_dict)

    def test_end_placeholder_needs_a_duration(self):
        with self.assertRaises(ValidationError) as ctx:
            self.event(message='do {end}', duration_minutes=0).full_clean()
        self.assertIn('message', ctx.exception.error_dict)

    def test_until_not_before_start(self):
        with self.assertRaises(ValidationError) as ctx:
            self.event(repeat_days=1, until=date(2026, 10, 1)).full_clean()
        self.assertIn('until', ctx.exception.error_dict)

    def test_second_active_event_with_the_same_name_and_start(self):
        original = self.event()
        original.save()
        original.full_clean()  # itself is no twin
        with self.assertRaises(ValidationError) as ctx:
            self.event().full_clean()
        self.assertEqual(ctx.exception.message_dict, {NON_FIELD_ERRORS: [TWIN_EVENT_ERROR]})
        # an inactive copy, another start or another name is fine; an inactive original does not block
        self.event(is_active=False).full_clean()
        self.event(starts_at=utc(2026, 10, 8, 19)).full_clean()
        self.event(name_sk='Ruiny 2').full_clean()
        original.is_active = False
        original.save()
        self.event().full_clean()


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', DISCORD_EVENT_ROLE_ID='42', SITE_URL='')
class EventPayloadTests(TestCase):
    def setUp(self):
        self.event = KingdomEvent.objects.create(
            name_sk='Ruiny', starts_at=utc(2026, 10, 8, 18), repeat_days=7, reminders=[60], mention_role_id='777777'
        )

    def test_event_reminder_has_discord_timestamps_and_event_role(self):
        events.plan_reminders(now=utc(2026, 10, 7, 12))
        n = self.event.notifications.get()
        with mock.patch('urllib.request.urlopen') as urlopen:
            discord.post(n)
        payload = json.loads(urlopen.call_args.args[0].data)
        unix = int(utc(2026, 10, 8, 18).timestamp())
        self.assertEqual(payload['embeds'][0]['fields'], [{'name': 'Začiatok', 'value': f'<t:{unix}:F> · <t:{unix}:R>'}])
        self.assertEqual(payload['content'], '<@&777777>')
        self.assertEqual(payload['allowed_mentions'], {'parse': [], 'roles': ['777777']})

    def test_role_fallback_order(self):
        n = EventNotification(title='MGE', send_at=timezone.now(), event=self.event, mention_role_id='111111')
        self.assertEqual(discord.mention_role_id(n), '111111')
        n.mention_role_id = ''
        self.assertEqual(discord.mention_role_id(n), '777777')
        self.event.mention_role_id = ''
        self.assertEqual(discord.mention_role_id(n), '42')
        n.event = None
        self.assertEqual(discord.mention_role_id(n), '42')
        n.mention_role = False
        self.assertEqual(discord.mention_role_id(n), '')
        self.assertEqual(discord.build_payload(n)['content'], '')

    def test_manual_notification_without_start_has_no_fields(self):
        payload = discord.build_payload(EventNotification(title='MGE', send_at=timezone.now()))
        self.assertNotIn('fields', payload['embeds'][0])

    def test_long_texts_are_truncated(self):
        n = EventNotification(title='x' * 300, message='y' * 5000, send_at=timezone.now())
        embed = discord.build_payload(n)['embeds'][0]
        self.assertEqual((len(embed['title']), len(embed['description'])), (256, 4096))

    @override_settings(SITE_URL='https://kd1035.test')
    def test_links_published_event_guide(self):
        self.event.guide = Guide.objects.create(category='eventy', title_sk='Ruiny', slug='ruiny-test', html_sk='<p>x</p>')
        n = EventNotification(title='Ruiny', send_at=timezone.now(), event=self.event)
        self.assertEqual(discord.build_payload(n)['embeds'][0]['url'], 'https://kd1035.test/navody/eventy/ruiny-test')


# admin pages link static files; the dev container has no collectstatic manifest
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}



@override_settings(STORAGES=PLAIN_STATIC)
class AllianceAdminTests(TestCase):
    """One main alliance, always (seeded by migration)."""

    def setUp(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))
        self.alliance = Alliance.objects.get()

    def test_list_opens_the_alliance(self):
        response = self.client.get('/admin/kingdom/alliance/')
        self.assertRedirects(response, f'/admin/kingdom/alliance/{self.alliance.pk}/change/')

    def test_cannot_add_another_or_delete_it(self):
        self.assertEqual(self.client.get('/admin/kingdom/alliance/add/').status_code, 403)
        self.assertEqual(self.client.get(f'/admin/kingdom/alliance/{self.alliance.pk}/delete/').status_code, 403)
        self.assertNotContains(self.client.get(f'/admin/kingdom/alliance/{self.alliance.pk}/change/'), 'deletelink')

@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', STORAGES=PLAIN_STATIC)
class KingdomEventAdminTests(TestCase):
    url = '/admin/kingdom/kingdomevent/'

    def setUp(self):
        self.admin = User.objects.create_superuser('boss', password='x')
        self.client.force_login(self.admin)

    def form_data(self, start, **kwargs):
        local = timezone.localtime(start)
        return {
            'name_sk': 'Ruiny',
            'name_cs': '',
            'message': '{name} {start}',
            'guide': '',
            'starts_at_0': local.strftime('%Y-%m-%d'),
            'starts_at_1': local.strftime('%H:%M:%S'),
            'duration_minutes': '60',
            'repeat_days': '7',
            'until': '',
            'time_basis': 'utc',
            'notify_discord': 'on',
            'reminders': ['60', '0'],
            'mention_role': 'on',
            'mention_role_id': '',
            'show_on_web': 'on',
            'is_active': 'on',
            'player_reminders': '10, 60',
            **kwargs,
        }

    def soon(self):
        return (timezone.now() + timedelta(hours=3)).replace(second=0, microsecond=0)

    def test_superuser_only(self):
        staff = User.objects.create_user('r4', password='x', is_staff=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_saving_plans_reminders_visible_by_event(self):
        start = self.soon()
        response = self.client.post(f'{self.url}add/', self.form_data(start))
        self.assertEqual(response.status_code, 302)
        event = KingdomEvent.objects.get()
        self.assertEqual(event.reminders, [60, 0])
        self.assertEqual(
            sorted(event.notifications.values_list('send_at', 'status')),
            [(start - timedelta(hours=1), Status.PENDING), (start, Status.PENDING)],
        )
        EventNotification.objects.create(title='MGE', send_at=start)  # manual one, filtered out
        listing = self.client.get(f'/admin/kingdom/eventnotification/?event__id__exact={event.pk}')
        self.assertEqual(listing.context['cl'].result_count, 2)

    def test_editing_the_time_replans(self):
        start = self.soon()
        self.client.post(f'{self.url}add/', self.form_data(start))
        event = KingdomEvent.objects.get()
        later = start + timedelta(hours=2)
        self.client.post(f'{self.url}{event.pk}/change/', self.form_data(later))
        self.assertEqual(
            sorted(event.notifications.values_list('send_at', flat=True)), [later - timedelta(hours=1), later]
        )

    @override_settings(DISCORD_WEBHOOK_URL='')
    def test_without_webhook_warns_and_plans_nothing(self):
        response = self.client.post(f'{self.url}add/', self.form_data(self.soon()), follow=True)
        self.assertContains(response, 'Webhook nie je nastavený – pripomienky sa neplánujú.')
        self.assertFalse(EventNotification.objects.exists())

    def test_reminder_required_when_discord_is_on(self):
        response = self.client.post(f'{self.url}add/', self.form_data(self.soon(), reminders=[]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(KingdomEvent.objects.exists())

    def test_list_editable_is_active_replans(self):
        self.client.post(f'{self.url}add/', self.form_data(self.soon()))
        event = KingdomEvent.objects.get()
        self.assertEqual(event.notifications.count(), 2)
        response = self.client.post(
            self.url,
            {
                'form-TOTAL_FORMS': '1',
                'form-INITIAL_FORMS': '1',
                'form-0-id': str(event.pk),
                'form-0-show_on_web': 'on',
                '_save': 'Uložiť',
            },
        )
        self.assertEqual(response.status_code, 302)
        event.refresh_from_db()
        self.assertFalse(event.is_active)
        self.assertTrue(event.notify_discord)  # only shown in the list, not editable there
        self.assertFalse(event.notifications.exists())

    def test_preview_lists_next_five_occurrences(self):
        event = KingdomEvent.objects.create(
            name_sk='Ruiny', starts_at=self.soon(), repeat_days=1, reminders=[60, 0], time_basis='local'
        )
        response = self.client.get(f'{self.url}{event.pk}/change/')
        self.assertContains(response, 'Najbližšie termíny')
        dates = events.upcoming(event)
        self.assertEqual(len(dates), 5)
        for start in dates:
            self.assertContains(response, local_time(start))
            self.assertContains(response, local_time(start - timedelta(hours=1)))
        self.assertContains(response, ' UTC')

    def test_player_times_typed_as_text(self):
        start = self.soon()
        response = self.client.post(f'{self.url}add/', self.form_data(start, player_reminders='1440, 10 60,10'))
        self.assertEqual(response.status_code, 302)
        event = KingdomEvent.objects.get()
        self.assertEqual(event.player_reminders, [10, 60, 1440])  # sorted, duplicates dropped
        self.assertContains(self.client.get(f'{self.url}{event.pk}/change/'), 'value="10, 60, 1440"')

        bad = {
            'abc': 'celé minúty',
            '-5': 'celé minúty',
            '10.5': 'celé minúty',
            '10081': '10080',
            '1, 2, 3, 4, 5, 6, 7': 'Najviac 6',
        }
        for text, error in bad.items():
            with self.subTest(text):
                data = self.form_data(start, player_reminders=text)
                response = self.client.post(f'{self.url}{event.pk}/change/', data)
                self.assertContains(response, error)
        event.refresh_from_db()
        self.assertEqual(event.player_reminders, [10, 60, 1440])

        # empty = players only type their own times
        self.client.post(f'{self.url}{event.pk}/change/', self.form_data(start, player_reminders=''))
        event.refresh_from_db()
        self.assertEqual(event.player_reminders, [])

    def test_new_event_offers_ten_and_sixty_minutes(self):
        response = self.client.get(f'{self.url}add/')
        self.assertContains(response, 'value="10, 60"')
        self.assertEqual(KingdomEvent(name_sk='x', starts_at=self.soon()).player_reminders, [10, 60])

    def test_cancel_action(self):
        self.client.post(f'{self.url}add/', self.form_data(self.soon()))
        rows = EventNotification.objects.all()
        response = self.client.post(
            '/admin/kingdom/eventnotification/',
            {'action': 'cancel', '_selected_action': [str(n.pk) for n in rows]},
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(set(rows.values_list('status', flat=True)), {Status.CANCELLED})

    def test_changelist_repeat_labels_and_players(self):
        def player(discord_id):
            user = User.objects.create_user(f'discord_{discord_id}')
            return Player.objects.create(user=user, discord_id=discord_id, username=f'p{discord_id}')

        labels = {2: 'každé 2 dni', 3: 'každé 3 dni', 5: 'každých 5 dní', 14: 'každé 2 týždne'}
        rows = {
            days: KingdomEvent.objects.create(name_sk=f'E{days}', starts_at=self.soon(), repeat_days=days)
            for days in labels
        }
        players = [player(str(10**17 + i)) for i in range(3)]
        for p in players:
            EventReminder.objects.create(player=p, event=rows[2], offsets=[60])
        EventReminder.objects.create(player=players[0], event=rows[3], offsets=[10])

        response = self.client.get(self.url)
        for label in labels.values():
            self.assertContains(response, f'<td class="field-repeat_label">{label}</td>', html=True)
        counts = {e.pk: e.players_count for e in response.context['cl'].result_list}
        self.assertEqual(counts, {rows[2].pk: 3, rows[3].pk: 1, rows[5].pk: 0, rows[14].pk: 0})
        link = f'/admin/accounts/eventreminder/?event__id__exact={rows[2].pk}'
        self.assertContains(response, f'<a href="{link}" title="Pripomienky hráčov">3</a>', html=True)
        self.assertEqual(self.client.get(link).context['cl'].result_count, 3)
        # the date sits above the time (each unbroken), "posielať na Discord" only shown (switching it on needs
        # the reminders)
        self.assertContains(response, '<span style="white-space:nowrap">')
        self.assertNotContains(response, 'name="form-0-notify_discord"')
        self.assertContains(response, 'name="form-0-is_active"')

    def test_save_as_new_plans_the_copy_and_refuses_a_duplicate(self):
        start = self.soon()
        self.client.post(f'{self.url}add/', self.form_data(start))
        original = KingdomEvent.objects.get()
        change = f'{self.url}{original.pk}/change/'
        self.assertContains(self.client.get(change), 'name="_saveasnew"')

        # an unchanged active copy would send every reminder twice – through "Uložiť ako nový" and through Add
        error = 'Aktívny event s rovnakým názvom a prvým začiatkom už existuje – zmeň názov alebo čas.'
        self.assertContains(self.client.post(change, self.form_data(start, _saveasnew='Uložiť ako nový')), error)
        self.assertContains(self.client.post(f'{self.url}add/', self.form_data(start)), error)
        self.assertEqual(KingdomEvent.objects.count(), 1)

        later = start + timedelta(hours=1)
        response = self.client.post(change, self.form_data(later, _saveasnew='Uložiť ako nový'))
        self.assertEqual(response.status_code, 302)
        copy = KingdomEvent.objects.exclude(pk=original.pk).get()
        self.assertEqual(
            sorted(copy.notifications.values_list('send_at', flat=True)), [later - timedelta(hours=1), later]
        )
        self.assertEqual(original.notifications.count(), 2)

        # an inactive draft with the same name and start sends nothing, the original itself still saves
        draft = self.form_data(start, _saveasnew='Uložiť ako nový')
        del draft['is_active']
        self.assertEqual(self.client.post(change, draft).status_code, 302)
        self.assertEqual(self.client.post(change, self.form_data(start)).status_code, 302)
        self.assertEqual(KingdomEvent.objects.count(), 3)

    def list_save(self, *rows):
        """Saves the list's checkboxes: rows = (event, aktívny) pairs, "zobraziť na webe" stays ticked."""
        data = {'form-TOTAL_FORMS': str(len(rows)), 'form-INITIAL_FORMS': str(len(rows)), '_save': 'Uložiť'}
        for i, (event, active) in enumerate(rows):
            data |= {f'form-{i}-id': str(event.pk), f'form-{i}-show_on_web': 'on'}
            if active:
                data[f'form-{i}-is_active'] = 'on'
        return self.client.post(self.url, data)

    def test_list_checkbox_does_not_switch_on_a_twin(self):
        start = self.soon()
        self.client.post(f'{self.url}add/', self.form_data(start))
        original = KingdomEvent.objects.get()
        draft = self.form_data(start, _saveasnew='Uložiť ako nový')  # an unchanged copy saved as inactive
        del draft['is_active']
        self.client.post(f'{self.url}{original.pk}/change/', draft)
        copy = KingdomEvent.objects.exclude(pk=original.pk).get()

        # ticking "aktívny" in the list goes through the list's own form, not KingdomEventForm
        response = self.list_save((original, True), (copy, True))
        self.assertContains(response, TWIN_EVENT_ERROR)
        copy.refresh_from_db()
        self.assertFalse(copy.is_active)
        self.assertFalse(copy.notifications.exists())
        self.assertEqual(original.notifications.count(), 2)

        # two inactive twins switched on in one save pass the database check, so the list compares them
        self.assertEqual(self.list_save((original, False), (copy, False)).status_code, 302)
        response = self.list_save((original, True), (copy, True))
        self.assertContains(response, TWIN_EVENT_ERROR)
        self.assertFalse(KingdomEvent.objects.filter(is_active=True).exists())

        # one of them is fine
        self.assertEqual(self.list_save((original, False), (copy, True)).status_code, 302)
        self.assertEqual(list(KingdomEvent.objects.filter(is_active=True)), [copy])
        self.assertEqual(copy.notifications.count(), 2)


@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', STORAGES=PLAIN_STATIC)
class EventNotificationAdminTests(TestCase):
    url = '/admin/kingdom/eventnotification/'

    def setUp(self):
        self.client.force_login(User.objects.create_superuser('boss', password='x'))

    def make(self, status, minutes_ago=1, **kwargs):
        send_at = timezone.now() - timedelta(minutes=minutes_ago)
        return EventNotification.objects.create(title=f'MGE {status}', send_at=send_at, status=status, **kwargs)

    def act(self, action, rows):
        return self.client.post(
            self.url, {'action': action, '_selected_action': [str(n.pk) for n in rows]}, follow=True
        )

    def form_data(self, send_at, **kwargs):
        local = timezone.localtime(send_at)
        return {
            'title': 'Ruiny',
            'message': '',
            'send_at_0': local.strftime('%Y-%m-%d'),
            'send_at_1': local.strftime('%H:%M:%S'),
            'event_start_0': '',
            'event_start_1': '',
            'mention_role': 'on',
            'mention_role_id': '',
            **kwargs,
        }

    def test_send_now_skips_sent_and_cancelled(self):
        yesterday = timezone.now() - timedelta(days=1)
        rows = {status: self.make(status) for status in Status}
        rows[Status.SENT].sent_at = yesterday
        rows[Status.SENT].save()
        with mock.patch.object(discord, 'post') as post:
            response = self.act('send_now', rows.values())
        self.assertEqual({c.args[0].pk for c in post.call_args_list}, {rows[Status.PENDING].pk, rows[Status.FAILED].pk})
        self.assertContains(response, 'Odoslané: 2')
        self.assertContains(response, 'Preskočené (odoslané alebo zrušené): 2')
        statuses = dict(EventNotification.objects.values_list('pk', 'status'))
        self.assertEqual(
            [statuses[rows[s].pk] for s in Status], [Status.SENT, Status.SENT, Status.SENT, Status.CANCELLED]
        )
        rows[Status.SENT].refresh_from_db()
        self.assertEqual(rows[Status.SENT].sent_at, yesterday)

    def test_reschedule_leaves_sent_alone_and_warns_about_old_times(self):
        yesterday = timezone.now() - timedelta(days=1)
        sent = self.make(Status.SENT, sent_at=yesterday)
        failed = self.make(Status.FAILED, error='boom')
        cancelled = self.make(Status.CANCELLED, minutes_ago=7 * 60)  # the worker would call it missed
        pending = self.make(Status.PENDING)
        response = self.act('reschedule', [sent, failed, cancelled, pending])
        self.assertContains(response, 'Znova naplánované: 2')
        self.assertContains(response, 'Preskočené (odoslané alebo už naplánované): 2')
        self.assertContains(response, 'Čas odoslania je starší ako 6 h – uprav ho, inak ju worker označí ako zmeškanú.')
        for n in (sent, failed, cancelled, pending):
            n.refresh_from_db()
        self.assertEqual((sent.status, sent.sent_at), (Status.SENT, yesterday))
        self.assertEqual((failed.status, failed.error), (Status.PENDING, ''))
        self.assertEqual((cancelled.status, pending.status), (Status.PENDING, Status.PENDING))

        failed.status = Status.FAILED
        failed.save()
        self.assertNotContains(self.act('reschedule', [failed]), 'starší ako 6 h')

    def test_reschedule_skips_a_copy_that_is_already_planned(self):
        # cancelled, then saved as a new one with the same title and time
        cancelled = self.make(Status.CANCELLED)
        copy = EventNotification.objects.create(title=cancelled.title, send_at=cancelled.send_at)
        twin = 'Preskočené – rovnaká pripomienka je už naplánovaná na ten istý čas: 1'
        self.assertContains(self.act('reschedule', [cancelled]), twin)
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.status, Status.CANCELLED)

        # two cancelled copies selected together: only the first one goes back
        copy.status = Status.CANCELLED
        copy.save()
        response = self.act('reschedule', [cancelled, copy])
        self.assertContains(response, 'Znova naplánované: 1')
        self.assertContains(response, twin)
        self.assertEqual(EventNotification.objects.filter(status=Status.PENDING).count(), 1)

    def test_save_as_new_and_duplicate_guard(self):
        start = (timezone.now() + timedelta(hours=3)).replace(second=0, microsecond=0)
        event = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=start, reminders=[60])
        events.plan_reminders()
        generated = event.notifications.get()
        change = f'{self.url}{generated.pk}/change/'
        self.assertContains(self.client.get(change), 'name="_saveasnew"')

        # the same title at the same time would go out twice – through "Uložiť ako nový" and through Add
        error = 'Rovnaká pripomienka je už naplánovaná na tento čas – zmeň čas.'
        self.assertContains(self.client.post(change, self.form_data(generated.send_at, _saveasnew='x')), error)
        self.assertContains(self.client.post(f'{self.url}add/', self.form_data(generated.send_at)), error)
        self.assertEqual(EventNotification.objects.count(), 1)
        self.assertEqual(self.client.post(change, self.form_data(generated.send_at)).status_code, 302)  # itself

        later = generated.send_at + timedelta(minutes=30)
        response = self.client.post(change, self.form_data(later, _saveasnew='Uložiť ako nový'))
        self.assertEqual(response.status_code, 302)
        copy = EventNotification.objects.exclude(pk=generated.pk).get()
        # a plain notification: no event link, so a later edit of the event does not replan it
        self.assertEqual(
            (copy.status, copy.send_at, copy.event, copy.occurrence_start, copy.offset_minutes),
            (Status.PENDING, later, None, None, None),
        )

        # a sent or cancelled one with the same title and time does not block a new one
        EventNotification.objects.filter(pk__in=[generated.pk, copy.pk]).update(status=Status.CANCELLED)
        self.assertEqual(self.client.post(f'{self.url}add/', self.form_data(later)).status_code, 302)


class WorkerTests(TestCase):
    def test_first_round_deletes_expired_sessions(self):
        from django.contrib.sessions.models import Session
        from django.core.management import call_command

        now = timezone.now()
        Session.objects.create(session_key='a' * 32, session_data='', expire_date=now - timedelta(days=1))
        Session.objects.create(session_key='b' * 32, session_data='', expire_date=now + timedelta(days=1))

        class Stop(Exception):
            pass

        worker = 'kingdom.management.commands.run_worker'
        with (
            mock.patch(f'{worker}.close_old_connections'),  # would drop the test transaction
            mock.patch(f'{worker}.plan_reminders', return_value=0),
            mock.patch(f'{worker}.send_due'),
            mock.patch(f'{worker}.send_personal_reminders') as personal,
            mock.patch(f'{worker}.prune_sent') as prune,
            mock.patch(f'{worker}.backup_due', return_value=False),
            mock.patch('time.sleep', side_effect=Stop),
            self.assertRaises(Stop),
        ):
            call_command('run_worker')
        self.assertEqual(list(Session.objects.values_list('session_key', flat=True)), ['b' * 32])
        personal.assert_called_once_with()
        prune.assert_called_once_with()


class BackupTests(TransactionTestCase):
    # reloads the alliance seeded by migration 0002 – every TransactionTestCase flushes the database after itself
    serialized_rollback = True

    def test_backup_prune_and_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with override_settings(MEDIA_ROOT=folder / 'media'):
                first = backups.create_backup(folder, keep=2)
                self.assertTrue(first.name.endswith('.sqlite3.gz'))
                with gzip.open(first) as f, open(folder / 'check.sqlite3', 'wb') as out:
                    out.write(f.read())
                tables = sqlite3.connect(folder / 'check.sqlite3').execute(
                    "SELECT name FROM sqlite_master WHERE name='kingdom_alliance'"
                ).fetchall()
                self.assertEqual(len(tables), 1)

                self.assertFalse(backups.backup_due(folder, interval_days=7))
                for i in range(3):
                    (folder / f'kd1035_2000-01-0{i + 1}_000000.sqlite3.gz').write_bytes(b'')
                backups.prune(folder, keep=2)
                self.assertEqual(len(list(folder.glob('kd1035_*.sqlite3.gz'))), 2)

                Alliance.objects.all().delete()
                backups.restore_backup(first)
                self.assertTrue(Alliance.objects.filter(tag='CS35').exists())


class SnapshotTests(TransactionTestCase):
    serialized_rollback = True  # see BackupTests

    def test_export_import_and_outdated_guard(self):
        from django.contrib.sessions.backends.db import SessionStore

        from . import snapshot

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with override_settings(
                SNAPSHOT_PATH=folder / 'snapshot' / 'db.sqlite3', SNAPSHOT_BASE_PATH=folder / 'snapshot_base'
            ):
                SessionStore().create()
                self.assertTrue(snapshot.export_snapshot())
                path = folder / 'snapshot' / 'db.sqlite3'
                conn = sqlite3.connect(path)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM django_session').fetchone()[0], 0)
                self.assertEqual(conn.execute('SELECT COUNT(*) FROM kingdom_alliance').fetchone()[0], 1)
                conn.close()

                # same data → the committed file stays byte-identical
                before = path.read_bytes()
                SessionStore().create()
                self.assertFalse(snapshot.export_snapshot())
                self.assertEqual(path.read_bytes(), before)

                # a pulled snapshot that was not imported must not be overwritten
                snapshot.write_base('something-else')
                with self.assertRaises(snapshot.SnapshotOutdated):
                    snapshot.export_snapshot()

                Alliance.objects.all().delete()
                snapshot.import_snapshot()
                self.assertTrue(Alliance.objects.filter(tag='CS35').exists())
                self.assertEqual(snapshot.read_base(), snapshot.file_hash(path))
                self.assertFalse(snapshot.export_snapshot())


class EventTemplateTests(TestCase):
    def test_creates_valid_inactive_drafts_once(self):
        from io import StringIO

        from django.core.management import call_command

        from .event_templates import TEMPLATES

        Guide.objects.create(
            category='eventy', slug='more-than-gems', title_sk='MTG', html_sk='<p>x</p>', is_published=True
        )
        call_command('seed_event_templates', stdout=StringIO())
        self.assertEqual(KingdomEvent.objects.count(), len(TEMPLATES))
        self.assertFalse(KingdomEvent.objects.filter(is_active=True).exists())  # nothing goes out before Gether checks
        for event in KingdomEvent.objects.all():
            event.full_clean()
        mtg = KingdomEvent.objects.get(name_sk='More Than Gems')
        self.assertEqual(mtg.guide.slug, 'more-than-gems')
        self.assertEqual(events.upcoming(mtg, 2, now=utc(2026, 10, 8)), [utc(2026, 10, 10), utc(2026, 11, 7)])
        self.assertEqual(KingdomEvent.objects.get(name_sk='MGE – Jazda').name_cs, 'MGE – Jízda')

        # an edited or renamed draft is never overwritten, a deleted one comes back
        KingdomEvent.objects.filter(name_sk='Esmeralda').delete()
        KingdomEvent.objects.filter(name_sk='Wheel of Fortune').update(repeat_days=21)
        call_command('seed_event_templates', stdout=StringIO())
        self.assertEqual(KingdomEvent.objects.count(), len(TEMPLATES))
        self.assertEqual(KingdomEvent.objects.get(name_sk='Wheel of Fortune').repeat_days, 21)
