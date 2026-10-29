import json
from datetime import UTC, datetime
from importlib import import_module
from unittest import mock

from django.apps import apps
from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from accounts import reminders
from accounts.models import EventReminder, Player

from . import discord, events
from .models import EVENING_BEFORE, EventRun, EventVariant, KingdomEvent
from .tests import PLAIN_STATIC

CALENDAR = '/api/events/'
LIST = '/api/events/manage/'
DAY = 24 * 60


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def make_gh(**kwargs):
    defaults = {'name_sk': '20 GH', 'starts_at': utc(2026, 10, 16), 'repeat_days': 14, 'duration_minutes': 2 * DAY}
    return KingdomEvent.objects.create(**{**defaults, **kwargs})


# Sunday 18 October 2026, 12:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 18, 10))
class RunVariantTests(TestCase):
    """20 GH runs as different contests (Gether, 18. 10. 2026): leadership gives each run its type and notes what
    the top reward takes, players see it in the calendar."""

    def setUp(self):
        self.gh = make_gh()
        self.training = EventVariant.objects.create(
            event=self.gh,
            name_sk='Training Day',
            max_reward_sk='8 100 minút speedov na tréning jednotiek',
            max_reward_cs='8 100 minut speedů na trénink jednotek',
        )

    def runs(self):
        response = self.client.get(CALENDAR, {'from': '2026-10-12', 'to': '2026-11-08'})
        return {o['start']: o for o in response.json()['occurrences'] if o['id'] == self.gh.pk}

    def put(self, data, method='put'):
        return getattr(self.client, method)(f'{LIST}{self.gh.pk}/run/', data, content_type='application/json')

    def test_a_new_type_guesses_its_icon(self, _now):
        self.assertEqual(self.training.icon, 'training-day')

    def test_the_calendar_shows_the_type_of_a_tagged_run_only(self, _now):
        EventRun.objects.create(event=self.gh, start=utc(2026, 10, 16), variant=self.training)
        with self.settings(**PLAIN_STATIC):
            runs = self.runs()
            tagged, other = runs['2026-10-16T00:00:00Z'], runs['2026-10-30T00:00:00Z']
            icon = '/static/kingdom/events/training-day.webp'
            self.assertEqual(
                tagged['variant'],
                {
                    'name_sk': 'Training Day',
                    'name_cs': '',
                    'icon': icon,
                    'max_reward_sk': '8 100 minút speedov na tréning jednotiek',
                    'max_reward_cs': '8 100 minut speedů na trénink jednotek',
                },
            )
            # the run's own art in the month and on the home page
            self.assertEqual(tagged['icon'], icon)
            self.assertIsNone(other['variant'])
            self.assertEqual(other['icon'], '/static/kingdom/events/gold-head.webp')

    def test_a_run_that_started_before_the_range_keeps_its_type(self, _now):
        EventRun.objects.create(event=self.gh, start=utc(2026, 10, 16), variant=self.training)
        response = self.client.get(CALENDAR, {'from': '2026-10-17', 'to': '2026-10-17'})
        self.assertEqual(response.json()['occurrences'][0]['variant']['name_sk'], 'Training Day')

    def test_only_a_superuser_sets_the_type(self, _now):
        data = {'start': '2026-10-16T00:00:00Z', 'variant': self.training.pk}
        self.assertEqual(self.put(data).status_code, 403)
        User.objects.create_user('player', password='x')
        self.client.login(username='player', password='x')
        self.assertEqual(self.put(data).status_code, 403)
        self.assertFalse(EventRun.objects.exists())

    def test_superuser_sets_changes_and_clears_the_type_of_a_run(self, _now):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))
        other = EventVariant.objects.create(event=self.gh, name_sk='Gathering Day')
        response = self.put({'start': '2026-10-16T02:00:00+02:00', 'variant': self.training.pk})
        self.assertEqual(response.json(), {'start': '2026-10-16T00:00:00Z', 'variant': self.training.pk})
        self.put({'start': '2026-10-16T00:00:00Z', 'variant': other.pk})
        self.assertEqual(list(EventRun.objects.values_list('start', 'variant')), [(utc(2026, 10, 16), other.pk)])
        response = self.put({'start': '2026-10-16T00:00:00Z'}, method='delete')
        self.assertEqual(response.json(), {'start': '2026-10-16T00:00:00Z', 'variant': None})
        self.assertFalse(EventRun.objects.exists())

    def test_the_type_needs_a_real_run_and_a_type_of_the_same_event(self, _now):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))
        foreign = EventVariant.objects.create(event=make_gh(name_sk='MGE'), name_sk='Training Day')
        for data, field in (
            ({'start': '2026-10-17T00:00:00Z', 'variant': self.training.pk}, 'start'),  # no run starts then
            ({'start': 'tomorrow', 'variant': self.training.pk}, 'start'),
            ({'start': '2026-10-16T00:00:00', 'variant': self.training.pk}, 'start'),  # no time zone
            ({'start': '2026-10-16T00:00:00Z', 'variant': foreign.pk}, 'variant'),
            ({'start': '2026-10-16T00:00:00Z', 'variant': True}, 'variant'),
            ({'start': '2026-10-16T00:00:00Z'}, 'variant'),
        ):
            response = self.put(data)
            self.assertEqual(response.status_code, 400, data)
            self.assertIn(field, response.json())
        self.assertFalse(EventRun.objects.exists())

    def test_the_editor_lists_the_types_of_each_event(self, _now):
        self.client.force_login(User.objects.create_superuser('gether', password='x'))
        with self.settings(**PLAIN_STATIC):
            rows = {e['id']: e for e in self.client.get(LIST).json()['events']}
        self.assertEqual(
            rows[self.gh.pk]['variants'],
            [
                {
                    'id': self.training.pk,
                    'name_sk': 'Training Day',
                    'name_cs': '',
                    'icon': '/static/kingdom/events/training-day.webp',
                    'max_reward_sk': '8 100 minút speedov na tréning jednotiek',
                    'max_reward_cs': '8 100 minut speedů na trénink jednotek',
                }
            ],
        )

    def test_a_type_of_another_event_is_refused_in_the_admin(self, _now):
        foreign = EventVariant.objects.create(event=make_gh(name_sk='MGE'), name_sk='Training Day')
        run = EventRun(event=self.gh, start=utc(2026, 10, 16), variant=foreign)
        with self.assertRaises(Exception):
            run.full_clean()


class TrainingDayMigrationTests(TestCase):
    training_day = staticmethod(import_module('kingdom.migrations.0019_training_day').training_day)

    def test_20_gh_gets_training_day_and_its_run_of_16_october(self):
        gh = make_gh(starts_at=utc(2026, 10, 2))  # 16. 10. is its second run
        moved = make_gh(name_sk='20 GH', starts_at=utc(2026, 10, 17), is_active=False)
        self.training_day(apps, None)
        self.training_day(apps, None)  # once only
        variant = EventVariant.objects.get(event=gh)
        self.assertEqual(
            (variant.name_sk, variant.icon, variant.max_reward_sk, variant.max_reward_cs),
            (
                'Training Day',
                'training-day',
                '8 100 minút speedov na tréning jednotiek',
                '8 100 minut speedů na trénink jednotek',
            ),
        )
        self.assertEqual(list(EventRun.objects.values_list('event', 'start')), [(gh.pk, utc(2026, 10, 16))])
        # a 20 GH whose date was moved gets the type, but no run is tagged
        self.assertTrue(EventVariant.objects.filter(event=moved).exists())


class NowOrNeverMigrationTests(TestCase):
    now_or_never = staticmethod(import_module('kingdom.migrations.0020_now_or_never').now_or_never)

    def test_20_gh_gets_now_or_never_and_its_run_of_30_october(self):
        gh = make_gh(starts_at=utc(2026, 10, 16))
        tagged = make_gh(name_sk='20 GH', starts_at=utc(2026, 10, 2))
        other = tagged.variants.create(name_sk='Training Day')
        EventRun.objects.create(event=tagged, start=utc(2026, 10, 30), variant=other)
        self.now_or_never(apps, None)
        self.now_or_never(apps, None)  # once only
        variant = EventVariant.objects.get(event=gh)
        self.assertEqual((variant.name_sk, variant.icon, variant.max_reward_sk), ('Now Or Never', 'now-or-never', ''))
        self.assertEqual(EventRun.objects.get(event=gh).variant, variant)
        # a run the superadmin already tagged keeps its type
        self.assertEqual(EventRun.objects.get(event=tagged).variant, other)

    def test_now_or_never_gets_its_max_reward_unless_one_was_entered(self):
        max_reward = import_module('kingdom.migrations.0021_now_or_never_max_reward').max_reward
        empty = make_gh().variants.create(name_sk='Now Or Never')
        entered = make_gh().variants.create(name_sk='Now Or Never', max_reward_sk='50 000 min')
        max_reward(apps, None)
        empty.refresh_from_db()
        entered.refresh_from_db()
        self.assertEqual((empty.max_reward_sk, empty.max_reward_cs), ('48 000 minút speedov', '48 000 minut speedů'))
        self.assertEqual(entered.max_reward_sk, '50 000 min')


@override_settings(SITE_URL='https://kd1035.test')
class RunTypeInMessagesTests(TestCase):
    """The reminder the day before is when a player decides whether to hold speedups, so the bot DM and the channel
    say which contest the run is and what the top reward takes."""

    def setUp(self):
        self.gh = make_gh(reminders=[EVENING_BEFORE], message='{name} {relative}', notify_discord=True)
        self.training = EventVariant.objects.create(
            event=self.gh,
            name_sk='Training Day',
            max_reward_sk='8 100 minút speedov na tréning jednotiek',
            max_reward_cs='8 100 minut speedů na trénink jednotek',
        )
        self.start = utc(2026, 10, 16)

    def tag(self):
        EventRun.objects.create(event=self.gh, start=self.start, variant=self.training)

    def dm(self, lang, start=None):
        return reminders.discord_message(self.gh, start or self.start, lang)['embeds'][0]

    def test_the_dm_names_the_type_and_the_max_reward(self):
        self.tag()
        embed = self.dm('sk')
        self.assertEqual(embed['title'], '20 GH · Training Day')
        self.assertEqual(
            embed['description'].split('\n')[1], 'Na max. odmenu: 8 100 minút speedov na tréning jednotiek'
        )
        # an empty Czech name falls back to the Slovak one
        embed = self.dm('cs')
        self.assertEqual(embed['title'], '20 GH · Training Day')
        self.assertEqual(
            embed['description'].split('\n')[1], 'Na max. odměnu: 8 100 minut speedů na trénink jednotek'
        )

        self.gh.name_cs = '20 GH CZ'
        self.training.name_cs = 'Training Day CZ'
        self.training.max_reward_cs = ''
        self.training.save()
        embed = self.dm('cs')
        self.assertEqual(embed['title'], '20 GH CZ · Training Day CZ')
        self.assertEqual(
            embed['description'].split('\n')[1], 'Na max. odměnu: 8 100 minút speedov na tréning jednotiek'
        )

    def test_a_type_without_a_max_reward_adds_no_line(self):
        self.training.max_reward_sk = self.training.max_reward_cs = ''
        self.training.save()
        self.tag()
        for lang in ('sk', 'cs'):
            embed = self.dm(lang)
            self.assertEqual(embed['title'], '20 GH · Training Day')
            self.assertNotIn('odm', embed['description'])

    def test_the_dm_of_an_untyped_run_is_unchanged(self):
        self.tag()  # 16. 10. only – the run of 30. 10. has no type
        start = utc(2026, 10, 30)
        unix = int(start.timestamp())
        expected = {
            'embeds': [
                {
                    'title': '20 GH',
                    'color': reminders.GOLD,
                    'footer': {'text': 'KD 1035 · pripomienku si nastavil na webe v časti Pripomienky eventov'},
                    'description': f'Začiatok: <t:{unix}:F> (<t:{unix}:R>)\n'
                    '[Zmeniť pripomienky](https://kd1035.test/pripomienky)',
                }
            ]
        }
        self.assertEqual(json.dumps(reminders.discord_message(self.gh, start, 'sk')), json.dumps(expected))

    @override_settings(DISCORD_BOT_TOKEN='bot-secret-token')
    def test_a_type_set_after_the_reminder_was_picked_reaches_the_dm(self):
        user = User.objects.create_user('discord_80351110224678912')
        player = Player.objects.create(user=user, discord_id='80351110224678912', username='nelly', approved=True)
        reminder = EventReminder.objects.create(player=player, event=self.gh, offsets=[EVENING_BEFORE])
        EventReminder.objects.filter(pk=reminder.pk).update(updated_at=utc(2026, 10, 1))
        KingdomEvent.objects.filter(pk=self.gh.pk).update(updated_at=utc(2026, 10, 1))
        self.tag()
        with mock.patch('accounts.discord_bot.send_dm') as send_dm:
            # 18:00 in Bratislava the evening before
            self.assertEqual(reminders.send_personal_reminders(now=utc(2026, 10, 15, 16)), 1)
        self.assertEqual(send_dm.call_args.args[1]['embeds'][0]['title'], '20 GH · Training Day')

    @override_settings(DISCORD_WEBHOOK_URL='https://discord.test/hook', DISCORD_EVENT_ROLE_ID='42', SITE_URL='')
    def test_the_channel_adds_the_type_set_after_the_notification_was_planned(self):
        events.plan_reminders(now=utc(2026, 10, 15, 12))
        notification = self.gh.notifications.get()
        unix = int(self.start.timestamp())
        start = {'name': 'Začiatok', 'value': f'<t:{unix}:F> · <t:{unix}:R>'}
        untyped = {
            'username': 'Kingdom 1035',
            'content': '<@&42>',
            'allowed_mentions': {'parse': [], 'roles': ['42']},
            'embeds': [
                {
                    'title': '20 GH',
                    'description': f'20 GH <t:{unix}:R>',
                    'color': discord.GOLD,
                    'timestamp': notification.send_at.isoformat(),
                    'footer': {'text': 'KD 1035 · CZ/SK'},
                    'fields': [start],
                }
            ],
        }
        self.assertEqual(json.dumps(discord.build_payload(notification)), json.dumps(untyped))

        self.tag()
        payload = discord.build_payload(notification)
        self.assertEqual(
            payload['embeds'][0]['fields'],
            [
                start,
                {'name': 'Typ', 'value': 'Training Day'},
                {'name': 'Max. odmena', 'value': '8 100 minút speedov na tréning jednotiek'},
            ],
        )
        # the title as written by the notification, the ping untouched
        self.assertEqual(payload['embeds'][0]['title'], '20 GH')
        for key in ('username', 'content', 'allowed_mentions'):
            self.assertEqual(payload[key], untyped[key])

        self.training.max_reward_sk = ''
        self.training.save()
        fields = discord.build_payload(notification)['embeds'][0]['fields']
        self.assertEqual(fields, [start, {'name': 'Typ', 'value': 'Training Day'}])
