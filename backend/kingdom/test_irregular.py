from datetime import UTC, datetime
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from accounts.models import EventReminder, Player
from guides.models import Guide

from . import event_icons
from .models import EVENING_BEFORE, EventNotification, KingdomEvent
from .tests import PLAIN_STATIC

LIST = '/api/events/manage/'


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def date_url(event):
    return f'{LIST}{event.pk}/date/'


# Thursday 8 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 8, 12))
@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook')
class IrregularDateTests(TestCase):
    """Gether gives irregular events their next date straight in the calendar (/kalendar)."""

    def setUp(self):
        self.silk = KingdomEvent.objects.create(
            name_sk='Silk Road',
            starts_at=utc(2026, 10, 1, 18),  # 20:00 in Bratislava, over: waiting for a date
            irregular=True,
            time_basis=KingdomEvent.TimeBasis.LOCAL,
            reminders=[60],
        )
        self.boss = User.objects.create_superuser('gether', password='x')
        self.client.force_login(self.boss)

    def put(self, event, start):
        return self.client.put(date_url(event), {'start': start}, content_type='application/json')

    def test_superusers_only(self, _now):
        self.client.logout()
        detail = f'{LIST}{self.silk.pk}/'
        for user in (None, User.objects.create_user('r4', password='x', is_staff=True)):
            if user:
                self.client.force_login(user)
            self.assertEqual(self.client.get(LIST).status_code, 403)
            self.assertEqual(self.client.post(LIST, {'name_sk': 'X'}).status_code, 403)
            self.assertEqual(self.client.get(detail).status_code, 403)
            self.assertEqual(self.client.patch(detail, {}, content_type='application/json').status_code, 403)
            self.assertEqual(self.client.delete(detail).status_code, 403)
            self.assertEqual(self.put(self.silk, '2026-10-25T19:00:00Z').status_code, 403)
            self.assertEqual(self.client.delete(date_url(self.silk)).status_code, 403)
        self.assertEqual(KingdomEvent.objects.get(pk=self.silk.pk).starts_at, utc(2026, 10, 1, 18))

    def test_list_has_every_event_and_what_the_editor_needs(self, _now):
        KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 10, 18), repeat_days=7)
        KingdomEvent.objects.create(name_sk='Staré', starts_at=utc(2026, 10, 1), irregular=True, is_active=False)
        am = KingdomEvent.objects.create(
            name_sk='Alliance Mobilization', starts_at=utc(2026, 10, 5), duration_minutes=7 * 24 * 60, irregular=True
        )
        Guide.objects.create(category='eventy', slug='am', title_sk='AM návod', html_sk='<p>x</p>')
        Guide.objects.create(category='vybava', slug='gear', title_sk='Výbava', html_sk='<p>x</p>')
        data = self.client.get(LIST).json()
        # active first by the next date (the running AM first), waiting ones after them, inactive at the end
        self.assertEqual(
            [e['name_sk'] for e in data['events']], ['Alliance Mobilization', 'Ruiny', 'Silk Road', 'Staré']
        )
        first = data['events'][0]
        self.assertEqual(
            {k: first[k] for k in ('id', 'next_start', 'starts_at', 'time_basis', 'usual_time', 'duration_minutes')},
            {
                'id': am.pk,
                'next_start': '2026-10-05T00:00:00Z',
                'starts_at': '2026-10-05T00:00:00Z',
                'time_basis': 'utc',
                'usual_time': '00:00',
                'duration_minutes': 10080,
            },
        )
        silk = data['events'][2]
        self.assertEqual((silk['next_start'], silk['usual_time'], silk['players']), (None, '20:00', 0))
        self.assertEqual([g['title_sk'] for g in data['guides']], ['AM návod'])  # event guides only
        self.assertIn(
            {'slug': 'ceroli', 'label': 'Ceroli / Karuak', 'url': '/static/kingdom/events/ceroli.webp'}, data['icons']
        )
        self.assertEqual(data['reminder_choices'], [1440, EVENING_BEFORE, 180, 60, 30, 15, 0])
        self.assertTrue(data['webhook'])

    def test_set_move_and_cancel_a_date(self, _now):
        response = self.put(self.silk, '2026-10-25T19:00:00Z')  # Sunday 20:00 in Bratislava (winter time)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['next_start'], '2026-10-25T19:00:00Z')
        # the Discord reminder is planned like after a save in the admin (within the 48 h horizon only)
        self.assertFalse(EventNotification.objects.exists())
        response = self.put(self.silk, '2026-10-09T18:00:00+02:00')  # moved to tomorrow 18:00 local
        self.assertEqual(response.json()['next_start'], '2026-10-09T16:00:00Z')
        self.assertEqual(
            list(EventNotification.objects.values_list('send_at', 'status')),
            [(utc(2026, 10, 9, 15), EventNotification.Status.PENDING)],
        )
        # the calendar shows it from now on
        occurrences = self.client.get('/api/events/').json()['occurrences']
        self.assertEqual([o['start'] for o in occurrences], ['2026-10-09T16:00:00Z'])

        response = self.client.delete(date_url(self.silk))
        self.assertEqual((response.status_code, response.json()['next_start']), (200, None))
        self.assertFalse(EventNotification.objects.filter(status=EventNotification.Status.PENDING).exists())
        self.assertEqual(self.client.get('/api/events/').json()['occurrences'], [])
        # the usual hour stays for the next date
        self.assertEqual(response.json()['usual_time'], '18:00')
        # nothing to cancel any more
        self.assertEqual(self.client.delete(date_url(self.silk)).status_code, 200)

    def test_bad_dates_are_refused(self, _now):
        for start in ('', 'zajtra', '2026-10-25 19:00', '2026-02-30T19:00:00Z', '2026-10-08T11:00:00Z', '2028-01-01T00:00:00Z'):
            with self.subTest(start):
                self.assertEqual(self.put(self.silk, start).status_code, 400)
        self.assertEqual(self.client.put(date_url(self.silk), [1], content_type='application/json').status_code, 400)
        self.assertEqual(KingdomEvent.objects.get(pk=self.silk.pk).starts_at, utc(2026, 10, 1, 18))

    def test_only_active_irregular_events(self, _now):
        weekly = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 10, 18), repeat_days=7)
        self.assertEqual(self.put(weekly, '2026-10-25T19:00:00Z').status_code, 404)
        KingdomEvent.objects.filter(pk=self.silk.pk).update(is_active=False)
        self.assertEqual(self.put(self.silk, '2026-10-25T19:00:00Z').status_code, 404)


# Thursday 8 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 8, 12))
@override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook')
class ManageEventTests(TestCase):
    """Superusers create, edit and delete events in the calendar with the same rules as the admin."""

    NEW = {
        'name_sk': 'Ruiny',
        'name_cs': 'Ruiny CZ',
        'starts_at': '2026-10-09T18:00:00Z',
        'duration_minutes': 120,
        'repeat_days': 7,
        'time_basis': 'local',
        'reminders': [60],
        'player_reminders': [15, 60],
    }

    def setUp(self):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))

    def send(self, method, url, data):
        return getattr(self.client, method)(url, data, content_type='application/json')

    def test_create_plans_reminders_and_guesses_the_icon(self, _now):
        response = self.send('post', LIST, {**self.NEW, 'name_sk': 'Ark of Osiris'})
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual((data['icon'], data['icon_url']), ('ark', '/static/kingdom/events/ark.webp'))
        self.assertEqual(
            (data['next_start'], data['usual_time'], data['players']), ('2026-10-09T18:00:00Z', '20:00', 0)
        )
        self.assertEqual((data['is_active'], data['show_on_web'], data['guide']), (True, True, None))
        # the reminder an hour before tomorrow's start is within the 48 h horizon
        event = KingdomEvent.objects.get(pk=data['id'])
        self.assertEqual(list(event.notifications.values_list('send_at', flat=True)), [utc(2026, 10, 9, 17)])

    def test_the_admin_rules_apply(self, _now):
        KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 9, 18))
        cases = [
            ({}, 'non_field_errors'),  # an active twin (same name and start)
            ({'name_sk': 'A', 'irregular': True}, 'repeat_days'),
            ({'name_sk': 'A', 'reminders': [], 'notify_discord': True}, 'reminders'),
            ({'name_sk': 'A', 'reminders': [7]}, 'reminders'),
            ({'name_sk': 'A', 'player_reminders': [1, 2, 3, 4, 5, 6, 7]}, 'player_reminders'),
            ({'name_sk': 'A', 'message': 'koniec {end}', 'duration_minutes': 0}, 'message'),
            ({'name_sk': 'A', 'until': '2026-10-01'}, 'until'),
            ({'name_sk': 'A', 'icon': 'nope'}, 'icon'),
            ({'name_sk': ''}, 'name_sk'),
        ]
        for change, field in cases:
            with self.subTest(change):
                response = self.send('post', LIST, {**self.NEW, **change})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
        self.assertEqual(KingdomEvent.objects.count(), 1)

    def test_edit_replans_only_when_the_schedule_changes(self, _now):
        from .events import replan

        event = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 9, 18), reminders=[60])
        url = f'{LIST}{event.pk}/'
        replan(event)
        note = event.notifications.get()
        note.title = 'Upravená ručne'
        note.save()
        # web-only change: the planned reminder (with its manual edit) stays
        response = self.send('patch', url, {'show_on_web': False, 'icon': 'wheel'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(event.notifications.get().title, 'Upravená ručne')
        self.assertEqual(response.json()['icon_url'], '/static/kingdom/events/wheel.webp')
        # moved by an hour: planned again
        response = self.send('patch', url, {'starts_at': '2026-10-09T19:00:00Z'})
        self.assertEqual(response.json()['next_start'], '2026-10-09T19:00:00Z')
        self.assertEqual(list(event.notifications.values_list('send_at', 'title')), [(utc(2026, 10, 9, 18), 'Ruiny')])
        # switched off: nothing pending
        self.send('patch', url, {'is_active': False})
        self.assertFalse(event.notifications.filter(status=EventNotification.Status.PENDING).exists())

    def test_delete_takes_the_players_choices_along(self, _now):
        event = KingdomEvent.objects.create(name_sk='Ruiny', starts_at=utc(2026, 10, 9, 18))
        user = User.objects.create_user('discord_1')
        player = Player.objects.create(user=user, discord_id='123456789012345678', username='nelly')
        EventReminder.objects.create(player=player, event=event, offsets=[10])
        self.assertEqual(self.client.get(f'{LIST}{event.pk}/').json()['players'], 1)
        self.assertEqual(self.client.delete(f'{LIST}{event.pk}/').status_code, 204)
        self.assertFalse(KingdomEvent.objects.exists())
        self.assertFalse(EventReminder.objects.exists())
        self.assertEqual(self.client.get(f'{LIST}{event.pk}/').status_code, 404)


class EventIconTests(TestCase):
    def test_new_events_get_an_icon_from_their_name(self):
        for name, icon in (
            ('MGE – Jazda', 'mge'),
            ('Ark of Osiris', 'ark'),
            ('Hunt for History', 'hammer'),
            ("Holy Knight's Treasure", 'egg'),
            ('20 GH', 'gold-head'),
            ('Karuak Boss', 'ceroli'),
            ('Silk Road', 'silk-road'),
            ('Shadow Legion', 'shadow-legion'),
            ('Alliance Mobilization', 'alliance-mobilization'),
            ('Pevnosť', ''),
        ):
            with self.subTest(name):
                event = KingdomEvent.objects.create(name_sk=name, starts_at=utc(2026, 10, 10, 18))
                self.assertEqual(event.icon, icon)
        # a chosen icon (or none) is kept on later saves
        event.icon = 'wheel'
        event.save()
        self.assertEqual(KingdomEvent.objects.get(pk=event.pk).icon, 'wheel')

    def test_every_icon_file_exists_and_unknown_ones_give_no_url(self):
        for slug in event_icons.ICONS:
            with self.subTest(slug):
                self.assertTrue(event_icons.icon_path(slug).exists())
        self.assertEqual(event_icons.icon_url('mge'), '/static/kingdom/events/mge.webp')
        self.assertIsNone(event_icons.icon_url('../secret'))
        self.assertIsNone(event_icons.icon_url(''))

    @override_settings(STORAGES=PLAIN_STATIC)
    def test_admin_offers_the_icons(self):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))
        page = self.client.get('/admin/kingdom/kingdomevent/add/').content.decode()
        self.assertIn('value="ceroli"', page)
        self.assertIn('bez ikony', page)
