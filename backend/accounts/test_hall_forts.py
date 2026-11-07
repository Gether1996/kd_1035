import json
from pathlib import Path
from unittest import mock

from django.test import override_settings

from kingdom.discord import UNCERTAIN, DiscordError

from .models import HallEntry, HallFortsWeek
from .test_hall import HallBase, jpeg


@override_settings(DISCORD_HALL_WEBHOOK_URL='https://discord.test/api/webhooks/9/hall', SITE_URL='https://kd1035.test')
class FortsWeekTests(HallBase):
    """The fort destroyers of a week (Gether 7. 11. 2026): up to 5, the week's dates, posted once to the channel "sieň
    slávy" with @everyone – then locked until archived; archiving keeps the week and empties the category."""

    def post(self, client, url, data=None):
        return client.post(url, json.dumps(data or {}), content_type='application/json', HTTP_X_CSRFTOKEN=client.token)

    def week(self):
        return self.as_admin.get('/api/hall/').json()['forts_week']

    def fill(self):
        self.put(self.as_admin, '/api/hall/forts/1/', {'player': self.nelly.pk, 'count': '200'})
        self.put(self.as_admin, '/api/hall/forts/2/', {'name': 'Bobo_*x*', 'count': '3'})
        self.put(self.as_admin, '/api/hall/forts/5/', {'name': 'Piaty', 'count': '1'})

    def test_five_places_and_a_week(self):
        self.assertEqual(self.as_admin.get('/api/hall/').json()['places']['forts'], 5)
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/5/', {'name': 'Piaty'}).status_code, 200)
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/6/', {'name': 'Šiesty'}).status_code, 404)
        self.assertEqual(self.week(), {'from': None, 'to': None, 'published_at': None, 'webhook': True})
        saved = self.put(self.as_admin, '/api/hall/forts/week/', {'week_from': '2026-10-26', 'week_to': '2026-11-01'})
        self.assertEqual(saved.json()['from'], '2026-10-26')
        # the players see the week, not whether it was posted
        self.assertEqual(self.as_nelly.get('/api/hall/').json()['forts_week'], {'from': '2026-10-26', 'to': '2026-11-01'})
        for bad in (
            {'week_from': '2026-11-01', 'week_to': '2026-10-26'},
            {'week_from': '2026-10-01', 'week_to': '2026-11-15'},
            # a whole week, Monday to Sunday only
            {'week_from': '2026-10-27', 'week_to': '2026-11-02'},
            {'week_from': '2026-10-26', 'week_to': '2026-10-30'},
            {'week_from': '2026-10-26', 'week_to': None},
            {'week_from': 'x', 'week_to': '2026-11-01'},
        ):
            self.assertEqual(self.put(self.as_admin, '/api/hall/forts/week/', bad).status_code, 400, bad)
        none = {'week_from': None, 'week_to': None}
        self.assertEqual(self.put(self.as_nelly, '/api/hall/forts/week/', none).status_code, 403)

    def test_posted_once_then_locked_until_archived(self):
        self.fill()
        with mock.patch('accounts.hall.send') as send:
            # no week yet
            self.assertEqual(self.post(self.as_admin, '/api/hall/forts/publish/').json(), {'detail': 'week'})
            self.put(self.as_admin, '/api/hall/forts/week/', {'week_from': '2026-10-26', 'week_to': '2026-11-01'})
            self.assertEqual(self.post(self.as_nelly, '/api/hall/forts/publish/').status_code, 403)
            posted = self.post(self.as_admin, '/api/hall/forts/publish/')
            self.assertEqual(posted.status_code, 200)
            self.assertIsNotNone(posted.json()['published_at'])
            payload, url = send.call_args.args
        self.assertEqual(url, 'https://discord.test/api/webhooks/9/hall')
        self.assertEqual((payload['content'], payload['allowed_mentions']), ('@everyone', {'parse': ['everyone']}))
        head, *cards = payload['embeds']
        self.assertEqual(head['description'], 'Týždeň **26. 10. – 1. 11. 2026**\nNajviac zničených pevností za týždeň.')
        self.assertEqual(head['url'], 'https://kd1035.test/sien-slavy')
        # a card per place: the medal or the number with the name (plain text), the number in bold, the stripe colour
        self.assertEqual(
            [(c['author']['name'], c.get('description'), c['color']) for c in cards],
            [
                ('🥇 Nelly', '**200** pevností', 0xF5C451),
                ('🥈 Bobo_*x*', '**3** pevnosti', 0xC9D1DC),
                ('5. Piaty', '**1** pevnosť', 0x2F5CAA),
            ],
        )
        # the Discord avatar of a player of the website – next to the name and large on the head card; a name alone has none
        avatar = self.nelly.avatar_url
        self.assertEqual((cards[0]['author']['icon_url'], head['thumbnail']['url']), (avatar, avatar))
        self.assertNotIn('icon_url', cards[1]['author'])
        self.assertEqual(cards[-1]['footer'], {'text': 'Sieň slávy · KD 1035'})
        # locked: no second post, no edits of the forts – other categories as before
        with mock.patch('accounts.hall.send') as send:
            self.assertEqual(self.post(self.as_admin, '/api/hall/forts/publish/').status_code, 409)
            send.assert_not_called()
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/1/', {'name': 'X'}).status_code, 409)
        self.assertEqual(self.as_admin.delete('/api/hall/forts/1/', HTTP_X_CSRFTOKEN=self.as_admin.token).status_code, 409)
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/', {'entries': [{'name': 'X'}]}).status_code, 409)
        none = {'week_from': None, 'week_to': None}
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/week/', none).status_code, 409)
        photo = self.as_admin.post('/api/hall/forts/1/photo/', {'photo': jpeg()}, HTTP_X_CSRFTOKEN=self.as_admin.token)
        self.assertEqual(photo.status_code, 409)
        self.assertEqual(self.put(self.as_admin, '/api/hall/rally/1/', {'name': 'Maroš'}).status_code, 200)

        # archived: into Sieň legiend with the week, the category empty and open again, the next week offered
        self.assertEqual(self.post(self.as_nelly, '/api/hall/forts/archive/').status_code, 403)
        saved = self.post(self.as_admin, '/api/hall/forts/archive/')
        self.assertEqual(saved.status_code, 201)
        archive = saved.json()['archive'][0]
        self.assertEqual(
            (archive['label'], archive['week_from'], archive['week_to']),
            ('Týždeň 26. 10. – 1. 11. 2026', '2026-10-26', '2026-11-01'),
        )
        self.assertEqual(
            [(e['place'], e['name'], e['count']) for e in archive['entries']],
            [(1, 'Nelly', '200'), (2, 'Bobo_*x*', '3'), (5, 'Piaty', '1')],
        )
        self.assertEqual(
            saved.json()['forts_week'], {'from': '2026-11-02', 'to': '2026-11-08', 'published_at': None, 'webhook': True}
        )
        self.assertFalse(HallEntry.objects.filter(category='forts').exists())
        self.assertTrue(HallEntry.objects.filter(category='rally').exists())
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/1/', {'name': 'Nový'}).status_code, 200)

    def test_nothing_to_post_or_archive_no_webhook_discord_down(self):
        self.put(self.as_admin, '/api/hall/forts/week/', {'week_from': '2026-10-26', 'week_to': '2026-11-01'})
        self.assertEqual(self.post(self.as_admin, '/api/hall/forts/publish/').json(), {'detail': 'empty'})
        self.assertEqual(self.post(self.as_admin, '/api/hall/forts/archive/').status_code, 400)
        self.fill()
        with override_settings(DISCORD_HALL_WEBHOOK_URL=''):
            refused = self.post(self.as_admin, '/api/hall/forts/publish/')
            self.assertEqual((refused.status_code, refused.json()), (503, {'detail': 'no_webhook'}))
            self.assertFalse(self.week()['webhook'])
        for error, uncertain in ((DiscordError('Discord odpovedal 404'), False), (DiscordError(f'{UNCERTAIN} (Timeout)'), True)):
            with mock.patch('accounts.hall.send', side_effect=error):
                failed = self.post(self.as_admin, '/api/hall/forts/publish/')
            self.assertEqual((failed.status_code, failed.json()), (502, {'detail': 'discord', 'uncertain': uncertain}))
            # not locked – it can be tried again
            self.assertIsNone(self.week()['published_at'])

    def test_the_avatar_is_discords_never_the_photo_of_the_hall(self):
        from .hall import forts_payload

        self.nelly.avatar = 'abc123'
        self.nelly.save()
        self.put(self.as_admin, '/api/hall/forts/1/', {'player': self.nelly.pk, 'count': '1.37B'})
        self.as_admin.post('/api/hall/forts/1/photo/', {'photo': jpeg()}, HTTP_X_CSRFTOKEN=self.as_admin.token)
        entry = HallEntry.objects.select_related('player').get(category='forts')
        self.assertTrue(entry.photo)
        payload = forts_payload([entry], HallFortsWeek.load())
        head, card = payload['embeds']
        self.assertEqual(card['author']['icon_url'], f'https://cdn.discordapp.com/avatars/1/abc123.png?size=128')
        self.assertEqual(head['thumbnail']['url'], 'https://cdn.discordapp.com/avatars/1/abc123.png?size=256')
        # no week yet: the head without it; a number that is not digits as written
        self.assertEqual(head['description'], 'Najviac zničených pevností za týždeň.')
        self.assertEqual(card['description'], '**1.37B**')
        # a player without Discord: no avatar (Discord cannot show the site's picture)
        self.nelly.discord_id = None
        self.nelly.save()
        entry.refresh_from_db()
        self.assertNotIn('thumbnail', forts_payload([entry], HallFortsWeek.load())['embeds'][0])

    def test_archived_without_a_week_and_the_photos_go(self):
        self.put(self.as_admin, '/api/hall/forts/1/', {'player': self.nelly.pk, 'count': '200'})
        self.as_admin.post('/api/hall/forts/1/photo/', {'photo': jpeg()}, HTTP_X_CSRFTOKEN=self.as_admin.token)
        self.assertEqual(len(list(Path(self.media.name, 'hall').iterdir())), 1)
        saved = self.post(self.as_admin, '/api/hall/forts/archive/').json()
        self.assertTrue(saved['archive'][0]['label'].startswith('Ničitelia pevností '))
        self.assertIsNone(saved['archive'][0]['week_from'])
        self.assertEqual(list(Path(self.media.name, 'hall').iterdir()), [])
