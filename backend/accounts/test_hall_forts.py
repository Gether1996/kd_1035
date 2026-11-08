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
        [card] = payload['embeds']
        self.assertEqual(card['description'], 'Týždeň **26. 10. – 1. 11. 2026**\nNajviac zničených pevností za týždeň.')
        self.assertEqual(card['url'], 'https://kd1035.test/sien-slavy')
        self.assertEqual(card['footer'], {'text': 'Sieň slávy · KD 1035'})
        # one card (Gether 7. 11. 2026): the top 3 side by side, the 4th and 5th in their own row – with only two on
        # top, an empty field ends the row first
        blank = '\u200b'
        self.assertEqual(
            [(f['name'], f['value'], f['inline']) for f in card['fields']],
            [
                ('🥇 Nelly', '**200**', True),
                ('🥈 Bobo\\_\\*x\\*', '**3**', True),
                (blank, blank, False),
                ('5. Piaty', '**1**', True),
            ],
        )
        # the winner's Discord avatar on the right
        self.assertEqual(card['thumbnail']['url'], self.nelly.avatar_url)
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
        # a posted week wins over another one sent along
        saved = self.post(self.as_admin, '/api/hall/forts/archive/', {'week_from': '2026-11-02', 'week_to': '2026-11-08'})
        self.assertEqual(saved.status_code, 201)
        archive = saved.json()['archive'][0]
        self.assertEqual(
            (archive['label'], archive['week_from'], archive['week_to']),
            ('Ničitelia pevností', '2026-10-26', '2026-11-01'),
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
        [card] = payload['embeds']
        self.assertEqual(card['thumbnail']['url'], 'https://cdn.discordapp.com/avatars/1/abc123.png?size=256')
        # no week yet: the card without it; a number that is not digits as written
        self.assertEqual(card['description'], 'Najviac zničených pevností za týždeň.')
        self.assertEqual(card['fields'], [{'name': '🥇 Nelly', 'value': '**1.37B**', 'inline': True}])
        # a player without Discord: no avatar (Discord cannot show the site's picture)
        self.nelly.discord_id = None
        self.nelly.save()
        entry.refresh_from_db()
        self.assertNotIn('thumbnail', forts_payload([entry], HallFortsWeek.load())['embeds'][0])

    def test_five_places_three_and_two(self):
        from .hall import forts_payload

        for place in range(1, 6):
            self.put(self.as_admin, f'/api/hall/forts/{place}/', {'name': f'P{place}', 'count': str(100 - place)})
        entries = list(HallEntry.objects.select_related('player').filter(category='forts').order_by('place'))
        fields = forts_payload(entries, HallFortsWeek.load())['embeds'][0]['fields']
        # three inline, then two inline – Discord starts the 4th on a new row by itself
        self.assertEqual([f['name'] for f in fields], ['🥇 P1', '🥈 P2', '🥉 P3', '4. P4', '5. P5'])
        self.assertTrue(all(f['inline'] for f in fields))
        # a name alone: no avatar
        self.assertNotIn('thumbnail', forts_payload(entries, HallFortsWeek.load())['embeds'][0])
        # any number from 1 to 5 (Gether 7. 11. 2026: "môže byť 1 až 5, akýkoľvek počet"): one field each, no empty one
        for n in range(1, 6):
            fields = forts_payload(entries[:n], HallFortsWeek.load())['embeds'][0]['fields']
            self.assertEqual([f['name'] for f in fields], ['🥇 P1', '🥈 P2', '🥉 P3', '4. P4', '5. P5'][:n], n)
        # places left empty in between: the 4th or 5th still in its own row under the top
        for places, names in (
            ([0, 4], ['🥇 P1', '​', '5. P5']),
            ([0, 1, 3, 4], ['🥇 P1', '🥈 P2', '​', '4. P4', '5. P5']),
            ([2, 3], ['🥉 P3', '​', '4. P4']),
        ):
            fields = forts_payload([entries[i] for i in places], HallFortsWeek.load())['embeds'][0]['fields']
            self.assertEqual([f['name'] for f in fields], names, places)

    def test_archived_without_a_week_and_the_photos_go(self):
        self.put(self.as_admin, '/api/hall/forts/1/', {'player': self.nelly.pk, 'count': '200'})
        self.as_admin.post('/api/hall/forts/1/photo/', {'photo': jpeg()}, HTTP_X_CSRFTOKEN=self.as_admin.token)
        self.assertEqual(len(list(Path(self.media.name, 'hall').iterdir())), 1)
        saved = self.post(self.as_admin, '/api/hall/forts/archive/').json()
        self.assertEqual(saved['archive'][0]['label'], 'Ničitelia pevností')
        self.assertIsNone(saved['archive'][0]['week_from'])
        self.assertEqual(list(Path(self.media.name, 'hall').iterdir()), [])

    def test_the_archive_takes_the_week_of_the_picker(self):
        """8. 11. 2026: an archive got no week – it was shown in the picker but never saved"""
        self.put(self.as_admin, '/api/hall/forts/1/', {'name': 'CrazyFox CZE', 'count': '237'})
        saved = self.post(self.as_admin, '/api/hall/forts/archive/', {'week_from': '2026-11-02', 'week_to': '2026-11-08'})
        archive = saved.json()['archive'][0]
        self.assertEqual((archive['week_from'], archive['week_to']), ('2026-11-02', '2026-11-08'))
        # and the next week is offered after it
        self.assertEqual((saved.json()['forts_week']['from'], saved.json()['forts_week']['to']), ('2026-11-09', '2026-11-15'))
        # a week that is not Monday to Sunday is not taken (the saved one, here none, stays)
        self.put(self.as_admin, '/api/hall/forts/1/', {'name': 'X', 'count': '1'})
        HallFortsWeek.objects.update(week_from=None, week_to=None)
        saved = self.post(self.as_admin, '/api/hall/forts/archive/', {'week_from': '2026-11-03', 'week_to': '2026-11-09'})
        self.assertIsNone(saved.json()['archive'][0]['week_from'])
