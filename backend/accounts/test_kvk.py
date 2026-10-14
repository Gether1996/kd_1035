import io
import os
import shutil
import tempfile
import time
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image

from . import cleanup, discord_bot, private_images
from .models import MAX_MARCHES, TERMS_VERSION, KvkSettings, KvkSignup, March, Player, PlayerSettings
from .newcomers import NAME_GRACE, announce_new_players
from .reminder_views import iso
from .reminders import DiscordPaused
from .test_reminders import make_player


# the required armament bonuses and inscriptions of a new march
STATS = {'attack': 10, 'defense': 9, 'health': 8, 'white': 3, 'blue': 2, 'gold': 1}


def picture(fmt='JPEG', size=(1200, 2600), exif=True) -> SimpleUploadedFile:
    buffer = io.BytesIO()
    image = Image.new('RGB', size, (200, 160, 40))
    extra = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = 'PhoneMaker'  # Make
        data[0x8825] = {2: (48.0, 8.0, 0.0)}  # GPS
        extra['exif'] = data.tobytes()
    image.save(buffer, fmt, **extra)
    return SimpleUploadedFile(f'shot.{fmt.lower()}', buffer.getvalue(), content_type=f'image/{fmt.lower()}')


class KvkTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.media = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        override = override_settings(PRIVATE_MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        KvkSettings.objects.update_or_create(pk=1, defaults={'title_sk': '20.11. najbližšie KvK'})
        self.player = make_player()
        self.client = self.login(self.player.user)

    def login(self, user):
        client = Client(enforce_csrf_checks=True)
        client.force_login(user)
        client.token = client.get('/api/auth/me/').cookies['csrftoken'].value
        return client

    def call(self, method, url, data=None, client=None, **extra):
        client = client or self.client
        if method == 'post_file':
            return client.post(url, data, HTTP_X_CSRFTOKEN=client.token)
        import json

        body = json.dumps(data) if data is not None else ''
        return getattr(client, method)(url, body, content_type='application/json', HTTP_X_CSRFTOKEN=client.token, **extra)

    def sign_up(self, client=None, **data):
        body = {'ingame_name': 'Nelly', 'role': 'rally', 'kind': 'cavalry', 'primary': 'Attila', **data}
        return self.call('put', '/api/kvk/signup/', body, client)



class SignupTests(KvkTestCase):
    def test_state_signup_and_withdraw(self):
        state = self.client.get('/api/kvk/').json()
        self.assertEqual(state['title_sk'], '20.11. najbližšie KvK')
        self.assertEqual(state['signups'], {'rally': None, 'garrison': None})
        self.assertFalse(state['reviewer'])

        res = self.sign_up(note=' prvý rally ')
        self.assertEqual(res.status_code, 200, res.content)
        self.player.refresh_from_db()
        self.assertEqual(self.player.ingame_name, 'Nelly')
        self.assertEqual(res.json()['note'], 'prvý rally')
        self.assertNotIn('images', res.json())
        # a second PUT of the same role changes it
        self.sign_up(secondary='Takeda Shingen')
        self.assertEqual(KvkSignup.objects.get().secondary, 'Takeda Shingen')

        self.assertEqual(self.call('delete', '/api/kvk/signup/').status_code, 400)
        self.assertEqual(self.call('delete', '/api/kvk/signup/?role=rally').status_code, 204)
        self.assertFalse(KvkSignup.objects.exists())

    def test_rally_and_garrison_are_two_sign_ups_with_their_own_army(self):
        self.sign_up(primary='Attila')
        self.sign_up(role='garrison', primary='Takeda Shingen', note='mesto')
        signups = self.client.get('/api/kvk/').json()['signups']
        self.assertEqual((signups['rally']['primary'], signups['garrison']['primary']), ('Attila', 'Takeda Shingen'))
        # withdrawing the garrison keeps the rally
        self.assertEqual(self.call('delete', '/api/kvk/signup/?role=garrison').status_code, 204)
        self.assertEqual(list(KvkSignup.objects.values_list('role', flat=True)), ['rally'])

    def test_filled_in_like_a_march(self):
        # the form: troops, commanders with their skills, note (Gether 12. 10. 2026: exactly like a march)
        res = self.sign_up(secondary='Takeda Shingen', primary_skills='5111', gold=3)
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual((data['secondary'], data['primary_skills'], data['secondary_skills']), ('Takeda Shingen', '5111', '5555'))
        # counts are never typed: a new sign-up starts at 0
        self.assertEqual((data['attack'], data['gold'], data['gear'], data['inscriptions']), (None, 0, {}, []))
        self.assertEqual(self.sign_up(primary='').json()['primary'], ['required'])
        self.assertEqual(self.sign_up(primary='Nobody').json()['primary'], ['unknown'])
        self.assertEqual(self.sign_up(primary_skills='6111').status_code, 400)

        # then its build with the armament bonuses, like the build editor of a march
        build = {'role': 'rally', 'gear': {'weapon': {'item': 'sacred-dominion', 'crit': True}}, 'formation': 'delta'}
        self.assertEqual(self.call('patch', '/api/kvk/signup/', build).json()['attack'], ['required'])
        res = self.call('patch', '/api/kvk/signup/', {**build, 'inscriptions': ['delta-scroll-thrasher'], **STATS, 'attack': 12.5})
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual((data['attack'], data['damage'], data['gold'], data['formation']), (12.5, 0, 1, 'delta'))
        self.assertEqual(data['gear']['weapon'], {'item': 'sacred-dominion', 'crit': True, 'iconic': 0})
        self.assertEqual(self.call('patch', '/api/kvk/signup/', {'role': 'rally', 'formation': 'pincer'}).status_code, 400)
        # the form again keeps the build
        self.sign_up(note='zmena')
        saved = KvkSignup.objects.get()
        self.assertEqual((saved.formation, saved.gold, saved.note), ('delta', 1, 'zmena'))
        # a build needs the sign-up
        self.assertEqual(self.call('patch', '/api/kvk/signup/', {'role': 'garrison', **STATS}).status_code, 404)
        # no screenshots any more
        self.assertEqual(self.call('post_file', '/api/kvk/signup/images/', {'role': 'rally', 'kind': 'equipment'}).status_code, 404)

    def test_needs_a_role_and_a_name(self):
        self.assertEqual(self.sign_up(role='').status_code, 400)
        self.assertEqual(self.sign_up(role='both').status_code, 400)
        # cavalry, infantry or archers – no other march type
        self.assertEqual(self.sign_up(kind='').status_code, 400)
        self.assertEqual(self.sign_up(kind='garrison').status_code, 400)
        self.assertEqual(self.sign_up(kind='archer').json()['kind'], 'archer')
        self.assertEqual(self.sign_up(ingame_name='').status_code, 400)
        # anyone sees the heading
        self.assertEqual(Client().get('/api/kvk/').json()['title_sk'], '20.11. najbližšie KvK')

    def test_anonymous_and_password_admins_cannot_sign_up(self):
        anonymous = Client()
        self.assertEqual(anonymous.get('/api/kvk/').json()['player'], False)
        admin = self.login(User.objects.create_superuser('admin', password='x'))
        self.assertEqual(self.sign_up(client=admin).status_code, 403)


class ReviewTests(KvkTestCase):
    def test_reviewers_see_every_signup_others_do_not(self):
        self.sign_up()
        url = '/api/kvk/signups/'
        self.assertEqual(self.client.get(url).status_code, 403)

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        client = self.login(reviewer.user)
        data = client.get(url).json()
        self.assertEqual([s['player']['ingame_name'] for s in data['signups']], ['Nelly'])
        self.assertEqual(data['signups'][0]['player']['discord_id'], self.player.discord_id)
        # reviewers may not manage
        self.assertEqual(self.call('put', '/api/kvk/settings/', {'title_sk': 'X'}, client).status_code, 403)
        self.assertEqual(self.call('delete', f'/api/kvk/signups/{data["signups"][0]["id"]}/', client=client).status_code, 403)
        self.assertEqual(client.get('/api/kvk/reviewers/').status_code, 403)

    def test_superuser_sets_the_heading_withdraws_signups_and_picks_reviewers(self):
        admin_player = make_player('245662824171438090')
        admin_player.user.is_superuser = True
        admin_player.user.save()
        admin = self.login(admin_player.user)

        res = self.call('put', '/api/kvk/settings/', {'title_sk': ' 4.12. KvK ', 'title_cs': '4. 12. KvK'}, admin)
        self.assertEqual(res.json(), {'title_sk': '4.12. KvK', 'title_cs': '4. 12. KvK'})
        self.assertEqual(self.client.get('/api/kvk/').json()['title_cs'], '4. 12. KvK')

        # a sign-up stays until the player or the superuser withdraws it
        signup = self.sign_up().json()
        self.assertEqual(self.call('delete', f'/api/kvk/signups/{signup["id"]}/', client=admin).status_code, 204)
        self.assertFalse(KvkSignup.objects.exists())

        players = admin.get('/api/kvk/reviewers/').json()['players']
        self.assertIn(self.player.pk, [p['id'] for p in players])
        res = self.call('patch', f'/api/kvk/reviewers/{self.player.pk}/', {'reviewer': True}, admin)
        self.assertEqual(res.json()['reviewer'], True)
        self.assertTrue(self.client.get('/api/kvk/').json()['reviewer'])
        self.assertEqual(self.call('patch', f'/api/kvk/reviewers/{self.player.pk}/', {'reviewer': 'yes'}, admin).status_code, 400)


class RetentionTests(KvkTestCase):
    def test_sweep_deletes_the_old_screenshots(self):
        # nothing is uploaded since 12. 10. 2026 – every old file goes, a fresh one waits for the next sweep
        (self.media / 'kvk').mkdir()
        orphan = self.media / 'kvk' / 'orphan.webp'
        orphan.write_bytes(b'x')
        fresh = self.media / 'kvk' / 'fresh.webp'
        fresh.write_bytes(b'x')
        old = time.time() - 2 * private_images.SWEEP_GRACE_SECONDS
        os.utime(orphan, (old, old))
        self.assertEqual(cleanup.sweep_files(), 1)
        self.assertFalse(orphan.exists())
        self.assertTrue(fresh.exists())

class MarchTests(KvkTestCase):
    def setUp(self):
        super().setUp()
        from unittest import mock

        patcher = mock.patch(
            'accounts.army.march_commanders',
            return_value=[
                {'name': 'Attila', 'pick': True},
                {'name': 'Takeda Shingen', 'pick': True},
                {'name': 'Scipio Africanus', 'pick': True},
                # left out of the picker (a golden key)
                {'name': 'Cao Cao', 'pick': False},
            ],
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_add_up_to_ten_edit_and_delete_moves_the_rest_up(self):
        self.assertEqual(MAX_MARCHES, 10)
        # a new march needs its type and primary commander
        self.assertEqual(self.call('post', '/api/me/marches/', {'primary': 'Attila'}).json()['kind'], ['required'])
        self.assertEqual(self.call('post', '/api/me/marches/', {'kind': 'cavalry'}).json()['primary'], ['required'])
        for i in range(MAX_MARCHES):
            res = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS})
            self.assertEqual((res.status_code, res.json()['position']), (201, i + 1))
        self.assertEqual(self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS}).json()['detail'], 'limit')

        marches = self.client.get('/api/me/marches/').json()['marches']
        second = marches[1]['id']
        res = self.call('patch', f'/api/me/marches/{second}/', {'secondary': 'Takeda Shingen', 'kind': 'conquering'})
        self.assertEqual((res.json()['secondary'], res.json()['kind']), ('Takeda Shingen', 'conquering'))
        self.assertEqual(self.call('patch', f'/api/me/marches/{second}/', {'primary': 'Nobody'}).status_code, 400)
        self.assertEqual(self.call('patch', f'/api/me/marches/{second}/', {'kind': 'dragons'}).status_code, 400)

        first = marches[0]['id']
        self.assertEqual(self.call('delete', f'/api/me/marches/{first}/').status_code, 204)
        positions = [m['position'] for m in self.client.get('/api/me/marches/').json()['marches']]
        self.assertEqual(positions, list(range(1, MAX_MARCHES)))

    def test_a_commander_left_out_of_the_picker_stays_only_where_it_is_saved(self):
        self.assertEqual(self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Cao Cao', **STATS}).json()['primary'], ['unknown'])
        march = March.objects.create(player=self.player, position=1, kind='cavalry', primary='Cao Cao')
        url = f'/api/me/marches/{march.pk}/'
        # a march saved with him can still be edited
        self.assertEqual(self.call('patch', url, {'primary': 'Cao Cao', 'attack': 10}).status_code, 200)
        # but he can not be put into another slot or march
        self.assertEqual(self.call('patch', url, {'secondary': 'Cao Cao'}).status_code, 400)

    def test_armament_bonuses_are_whole_numbers_up_to_99_and_inscriptions_counted(self):
        # a new march comes with its type and commanders only – its bonuses are typed in the build editor right after
        march = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', 'gold': 'x', 'white': 5})
        self.assertEqual(march.status_code, 201, march.content)
        # counts sent along are ignored: a march counts the inscriptions clicked together (Gether 12. 10. 2026)
        self.assertEqual([march.json()[f] for f in ('attack', 'gold', 'blue', 'white')], [None, 0, 0, 0])
        url = f'/api/me/marches/{march.json()["id"]}/'
        # saving the build needs ATK, DEF and HP; All DMG may stay empty = 0
        self.assertEqual(self.call('patch', url, {'gear': {}, 'inscriptions': []}).json()['attack'], ['required'])
        res = self.call('patch', url, {'gear': {}, 'formation': '', 'inscriptions': [], **STATS, 'attack': 12})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([res.json()[f] for f in ('attack', 'defense', 'health', 'damage')], [12, 9, 8, 0])
        res = self.call('patch', url, {'defense': 8, 'health': 0, 'damage': 99})
        self.assertEqual([res.json()[f] for f in ('attack', 'defense', 'health', 'damage')], [12, 8, 0, 99])
        # one decimal (Gether 12. 10. 2026)
        res = self.call('patch', url, {'attack': 12.5, 'damage': '0.5'})
        self.assertEqual((res.json()['attack'], res.json()['damage']), (12.5, 0.5))
        self.assertEqual(self.call('patch', url, {'attack': 99.95}).status_code, 400)
        res = self.call('patch', url, {'formation': 'delta', 'inscriptions': ['delta-scroll-thrasher', 'delta-emblem-relentless', 'u-scroll-warcry']})
        self.assertEqual([res.json()[f] for f in ('gold', 'blue', 'white')], [1, 1, 1])
        # a change may not clear a required one (All DMG may)
        self.assertEqual(self.call('patch', url, {'health': None}).status_code, 400)
        self.assertEqual(self.call('patch', url, {'damage': None}).status_code, 200)
        for bad in ({'attack': 100}, {'defense': -1}, {'health': 9.55}, {'attack': 'x'}):
            self.assertEqual(self.call('patch', url, bad).status_code, 400, bad)
        self.assertEqual(self.client.get('/api/me/marches/').json()['marches'][0]['gold'], 1)

    def test_commander_skills_default_to_expertise(self):
        march = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila'}).json()
        self.assertEqual((march['primary_skills'], march['secondary_skills']), ('5555', '5555'))
        url = f'/api/me/marches/{march["id"]}/'
        self.assertEqual(self.call('patch', url, {'primary_skills': '5111'}).json()['primary_skills'], '5111')
        for bad in ('6111', '511', '51111', 'abcd', '0555'):
            self.assertEqual(self.call('patch', url, {'secondary_skills': bad}).status_code, 400, bad)

    def test_typed_counts_stay_until_the_inscriptions_change(self):
        march = March.objects.create(player=self.player, position=1, kind='cavalry', primary='Attila', attack=1, defense=1, health=1, gold=1, blue=3, white=6)
        url = f'/api/me/marches/{march.pk}/'
        # only the equipment: the counts typed in before stay
        res = self.call('patch', url, {'gear': {'weapon': {'item': 'sacred-dominion'}}, 'formation': '', 'inscriptions': []})
        self.assertEqual([res.json()[f] for f in ('gold', 'blue', 'white')], [1, 3, 6])
        res = self.call('patch', url, {'inscriptions': ['u-scroll-warcry']})
        self.assertEqual([res.json()[f] for f in ('gold', 'blue', 'white')], [0, 0, 1])

    def test_build_clicked_together(self):
        march = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS}).json()
        self.assertEqual((march['gear'], march['formation'], march['inscriptions']), ({}, '', []))
        url = f'/api/me/marches/{march["id"]}/'
        gear = {
            'weapon': {'item': 'sacred-dominion', 'crit': True, 'iconic': 3},
            'accessory1': {'item': 'ring-of-doom'},
            'accessory2': {'item': 'karuaks-war-drums', 'iconic': 5},
        }
        build = {'gear': gear, 'formation': 'delta', 'inscriptions': ['delta-scroll-thrasher', 'u-instrument-patronage']}
        res = self.call('patch', url, build)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['gear']['accessory1'], {'item': 'ring-of-doom', 'crit': False, 'iconic': 0})
        self.assertEqual(res.json()['inscriptions'], build['inscriptions'])
        # the other players see it with the march
        self.call('patch', '/api/me/marches/', {'public': True})
        other = self.login(make_player('42').user)
        self.assertEqual(other.get('/api/marches/').json()['players'][0]['marches'][0]['formation'], 'delta')

        for bad in (
            {'gear': {'weapon': {'item': 'ring-of-doom'}}},  # an accessory is no weapon
            {'gear': {'shield': {'item': 'sacred-dominion'}}},
            {'gear': {'weapon': {'item': 'nothing'}}},
            {'gear': {'weapon': {'item': 'sacred-dominion', 'iconic': 6}}},
            {'gear': {'weapon': {'item': 'sacred-dominion', 'crit': 'yes'}}},
            {'gear': {'accessory1': {'item': 'ring-of-doom'}, 'accessory2': {'item': 'ring-of-doom'}}},
            {'gear': []},
            {'gear': {'weapon': {'item': {'a': 1}}}},
            {'gear': {'weapon': {'item': ['sacred-dominion']}}},
            {'gear': {'weapon': 'sacred-dominion'}},
            {'formation': 'square'},
            # Thrasher is a Delta inscription
            {'formation': 'pincer'},
            {'formation': 'pincer', 'inscriptions': ['delta-scroll-thrasher']},
            {'inscriptions': ['delta-scroll-thrasher', 'delta-scroll-thrasher']},
            {'inscriptions': ['u-scroll-warcry'] * 9},
            # two of each armament at most
            {'inscriptions': ['u-scroll-warcry', 'u-scroll-ward', 'u-scroll-calm']},
        ):
            self.assertEqual(self.call('patch', url, bad).status_code, 400, bad)
        res = self.call('patch', url, {'formation': 'pincer', 'inscriptions': ['pincer-scroll-toppler', 'u-scroll-warcry']})
        self.assertEqual(res.status_code, 200, res.content)
        res = self.call('patch', url, {'gear': {}, 'formation': '', 'inscriptions': []})
        self.assertEqual((res.json()['gear'], res.json()['formation']), ({}, ''))

    def test_a_march_has_no_screenshot_and_reviewers_see_it_with_the_sign_up(self):
        march = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS}).json()
        self.assertNotIn('images', march)
        # the equipment is clicked together, its screenshot is gone (Gether 12. 10. 2026)
        res = self.call('post_file', f'/api/me/marches/{march["id"]}/images/', {'kind': 'equipment', 'file': picture()})
        self.assertEqual(res.status_code, 404)
        # files left from the old screenshots go with the daily sweep
        old = self.media / 'marches' / 'old.webp'
        old.parent.mkdir(parents=True, exist_ok=True)
        old.write_bytes(b'shot')
        stale = time.time() - 2 * private_images.SWEEP_GRACE_SECONDS
        os.utime(old, (stale, stale))
        cleanup.sweep_files()
        self.assertFalse(old.exists())

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        self.sign_up()
        data = self.login(reviewer.user).get('/api/kvk/signups/').json()
        self.assertEqual(data['signups'][0]['marches'][0]['primary'], 'Attila')

    def test_account_deletion_removes_marches(self):
        self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS})
        self.player.delete_account()
        self.assertFalse(March.objects.exists())

    def test_a_pair_the_evaluation_does_not_score_is_told_to_the_player_and_the_superuser(self):
        """Gether 14. 10. 2026: a red border on a march whose pair is filled in wrong – the others do not see it."""
        from guides.models import CommanderPair

        from .models import EvaluationSettings

        CommanderPair.objects.all().delete()
        CommanderPair.objects.create(primary='Attila', secondary='Takeda Shingen', points=100)
        CommanderPair.objects.create(primary='Scipio Africanus', secondary='Attila', points=0)
        self.call('patch', '/api/me/marches/', {'public': True})
        rows = [
            ('cavalry', 'Attila', 'Takeda Shingen', None),
            ('cavalry', 'Takeda Shingen', 'Attila', 'unknown'),  # the other order is a row of its own
            ('cavalry', 'Scipio Africanus', 'Attila', 'unknown'),  # 0 points
            ('cavalry', 'Attila', '', 'solo'),
            ('conquering', 'Attila', '', None),  # rally is not evaluated
        ]
        for kind, primary, secondary, _ in rows:
            res = self.call('post', '/api/me/marches/', {'kind': kind, 'primary': primary, **STATS})
            if secondary:
                res = self.call('patch', f"/api/me/marches/{res.json()['id']}/", {'secondary': secondary})
        expected = [problem for *_, problem in rows]
        self.assertEqual(res.json()['pair_problem'], None)
        self.assertEqual([m['pair_problem'] for m in self.client.get('/api/me/marches/').json()['marches']], expected)
        self.assertEqual(
            [m['pair_problem'] for m in self.client.get('/api/marches/').json()['players'][0]['marches']], expected
        )
        # another player: no word about it
        other = self.login(make_player('42').user)
        self.assertNotIn('pair_problem', other.get('/api/marches/').json()['players'][0]['marches'][1])
        # the superuser sees it
        admin = make_player('43')
        admin.user.is_superuser = True
        admin.user.save()
        marches = self.login(admin.user).get('/api/marches/').json()['players'][0]['marches']
        self.assertEqual([m['pair_problem'] for m in marches], expected)
        # the types the evaluation counts are its own setting: rally counted, cavalry not; a broken entry (the JSON is
        # editable in the admin) is left out, the lists still work
        kinds = ['conquering', ['cavalry'], {'a': 1}]
        EvaluationSettings.objects.update_or_create(pk=1, defaults={'data': {'marches': {'kinds': kinds}}})
        marches = self.client.get('/api/me/marches/').json()['marches']
        self.assertEqual([m['pair_problem'] for m in marches], [None, None, None, None, 'solo'])
        self.assertEqual(self.client.get('/api/marches/').status_code, 200)

    def test_a_formation_the_primary_should_not_lead_with_is_told_to_the_player_and_the_superuser(self):
        """Gether 14. 10. 2026: like the wrong pair – a red border for the player and the superadmin only."""
        from guides.models import CommanderFormation, CommanderPair

        CommanderPair.objects.all().delete()
        CommanderPair.objects.create(primary='Attila', secondary='Takeda Shingen', points=100)
        CommanderFormation.objects.all().delete()
        CommanderFormation.objects.create(commander='Attila', formations=['arch', 'delta'])
        self.call('patch', '/api/me/marches/', {'public': True})
        for position, (kind, formation) in enumerate(
            [('cavalry', 'wedge'), ('cavalry', 'delta'), ('cavalry', ''), ('conquering', 'wedge')], start=1
        ):
            March.objects.create(
                player=self.player, position=position, kind=kind, primary='Attila', secondary='Takeda Shingen',
                formation=formation, **STATS,
            )  # fmt: skip
        expected = [['arch', 'delta'], None, None, None]
        marches = self.client.get('/api/me/marches/').json()['marches']
        self.assertEqual([m['formation_problem'] for m in marches], expected)
        self.assertEqual([m['pair_problem'] for m in marches], [None] * 4)
        other = self.login(make_player('42').user)
        self.assertNotIn('formation_problem', other.get('/api/marches/').json()['players'][0]['marches'][0])
        admin = make_player('43')
        admin.user.is_superuser = True
        admin.user.save()
        marches = self.login(admin.user).get('/api/marches/').json()['players'][0]['marches']
        self.assertEqual([m['formation_problem'] for m in marches], expected)

    def test_public_marches_are_seen_by_every_signed_in_player(self):
        self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS})
        other = self.login(make_player('42').user)
        # private by default: only the owner (and R4) sees them
        self.assertEqual(self.client.get('/api/me/marches/').json()['public'], False)
        self.assertEqual(other.get('/api/marches/').json()['players'], [])
        mine = self.client.get('/api/marches/').json()['players']
        self.assertEqual([(p['me'], p['public']) for p in mine], [(True, False)])

        self.assertEqual(self.call('patch', '/api/me/marches/', {'public': 'yes'}).status_code, 400)
        self.assertEqual(self.call('patch', '/api/me/marches/', {'public': True}).json(), {'public': True})
        players = other.get('/api/marches/').json()['players']
        self.assertEqual([p['marches'][0]['primary'] for p in players], ['Attila'])
        self.assertEqual(Client().get('/api/marches/').status_code, 403)

        # back to R4 only
        self.call('patch', '/api/me/marches/', {'public': False})
        self.assertEqual(other.get('/api/marches/').json()['players'], [])
        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        data = self.login(reviewer.user).get('/api/marches/').json()
        self.assertTrue(data['reviewer'])
        self.assertEqual(len(data['players']), 1)


class ApprovalTests(KvkTestCase):
    """A new player waits for the superadmin before adding marches and KvK sign-ups (Gether 12. 10. 2026)."""

    def setUp(self):
        super().setUp()
        self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS})
        self.call('patch', '/api/me/marches/', {'public': True})
        self.newbie = make_player('42', approved=False)
        self.new = self.login(self.newbie.user)

    def test_a_new_player_adds_nothing_and_sees_no_marches_of_others(self):
        self.assertFalse(self.new.get('/api/auth/me/').json()['user']['approved'])
        self.assertFalse(self.new.get('/api/kvk/').json()['approved'])
        res = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS}, self.new)
        self.assertEqual((res.status_code, res.json()), (403, {'detail': 'not_approved'}))
        res = self.sign_up(self.new)
        self.assertEqual((res.status_code, res.json()), (403, {'detail': 'not_approved'}))
        self.assertEqual(self.new.get('/api/marches/').json()['players'], [])

        # a march from before the approval was taken away: deleting works, changing does not
        march = March.objects.create(player=self.newbie, position=1, kind='archer', primary='Attila')
        self.newbie.marches_public = True
        self.newbie.save()
        self.assertEqual(self.call('patch', f'/api/me/marches/{march.pk}/', {'kind': 'cavalry'}, self.new).status_code, 403)
        # … others do not see it, the player sees only their own
        self.assertEqual([p['me'] for p in self.client.get('/api/marches/').json()['players']], [True])
        self.assertEqual([p['me'] for p in self.new.get('/api/marches/').json()['players']], [True])
        self.assertEqual(self.call('delete', f'/api/me/marches/{march.pk}/', client=self.new).status_code, 204)

    def test_the_superuser_approves_and_filters(self):
        admin_player = make_player('245662824171438090')
        admin_player.user.is_superuser = True
        admin_player.user.save()
        admin = self.login(admin_player.user)
        rows = {p['id']: p for p in admin.get('/api/kvk/reviewers/').json()['players']}
        self.assertEqual((rows[self.newbie.pk]['approved'], rows[self.player.pk]['approved']), (False, True))
        self.assertIn('created_at', rows[self.newbie.pk])
        # first and last sign-in, the marches and the KvK sign-ups for the filters (Gether 13. 10. 2026)
        before = self.player.marches.count()
        March.objects.create(player=self.player, position=before + 1, kind='cavalry', primary='Attila')
        KvkSignup.objects.create(player=self.player, role='rally', kind='cavalry', primary='Attila')
        KvkSignup.objects.create(player=self.player, role='garrison', kind='infantry', primary='Bai Qi')
        rows = {p['id']: p for p in admin.get('/api/kvk/reviewers/').json()['players']}
        row = rows[self.player.pk]
        self.assertEqual((row['marches'], row['kvk']), (before + 1, ['garrison', 'rally']))
        self.assertEqual((rows[self.newbie.pk]['marches'], rows[self.newbie.pk]['kvk']), (0, []))
        self.assertTrue(rows[admin_player.pk]['last_login'].endswith('Z'))

        url = f'/api/kvk/reviewers/{self.newbie.pk}/'
        self.assertEqual(self.call('patch', url, {}, admin).status_code, 400)
        self.assertEqual(self.call('patch', url, {'approved': 'yes'}, admin).status_code, 400)
        self.assertEqual(self.call('patch', url, {'approved': True}, self.client).status_code, 403)
        res = self.call('patch', url, {'approved': True}, admin)
        self.assertEqual(res.json(), {'id': self.newbie.pk, 'reviewer': False, 'approved': True, 'evaluator': False, 'evaluation_settings': False})
        self.assertEqual(self.sign_up(self.new).status_code, 200)
        self.assertEqual(len(self.new.get('/api/marches/').json()['players']), 1)
        # the superuser needs no approval
        admin_player.approved = False
        admin_player.save()
        self.assertTrue(admin.get('/api/auth/me/').json()['user']['approved'])
        self.assertEqual(self.sign_up(admin).status_code, 200)

    def test_the_superuser_switches_auto_approve(self):
        admin_player = make_player('245662824171438090')
        admin_player.user.is_superuser = True
        admin_player.user.save()
        admin = self.login(admin_player.user)
        url = '/api/kvk/reviewers/auto-approve/'
        self.assertFalse(admin.get('/api/kvk/reviewers/').json()['auto_approve'])
        self.assertEqual(self.call('put', url, {'auto_approve': True}, self.client).status_code, 403)
        self.assertEqual(self.call('put', url, {'auto_approve': 'yes'}, admin).status_code, 400)
        self.assertEqual(self.call('put', url, {'auto_approve': True}, admin).json(), {'auto_approve': True})
        self.assertTrue(admin.get('/api/kvk/reviewers/').json()['auto_approve'])
        # the players already waiting stay waiting
        self.assertFalse(Player.objects.get(pk=self.newbie.pk).approved)
        self.assertEqual(self.call('put', url, {'auto_approve': False}, admin).json(), {'auto_approve': False})
        self.assertFalse(PlayerSettings.load().auto_approve)

    def test_the_marches_list_says_when_they_changed(self):
        player = self.client.get('/api/marches/').json()['players'][0]
        self.assertEqual(player['updated_at'], iso(March.objects.get(player=self.player).updated_at))


@override_settings(DISCORD_ADMIN_IDS=['245662824171438090'], DISCORD_BOT_TOKEN='bot', SITE_URL='https://kd1035.eu')
class NewcomerTests(TestCase):
    def setUp(self):
        patcher = mock.patch('accounts.discord_bot.send_dm')
        self.send = patcher.start()
        self.addCleanup(patcher.stop)

    def newbie(self, **fields) -> Player:
        player = make_player('42', approved=False)
        Player.objects.filter(pk=player.pk).update(announced=False, **fields)
        return Player.objects.get(pk=player.pk)

    def test_the_superadmin_hears_about_each_new_player_once(self):
        make_player('41')  # from before the approval
        self.newbie(ingame_name='Nelly1035', lang='cs')
        self.assertEqual(announce_new_players(), 1)
        target, message = self.send.call_args.args
        self.assertEqual(target, '245662824171438090')
        embed = message['embeds'][0]
        self.assertEqual(embed['title'], 'Nový hráč na webe: Nelly1035')
        self.assertIn('Meno v hre: **Nelly1035**', embed['description'])
        self.assertIn('<@42> · nelly', embed['description'])
        self.assertIn('Web: CZ', embed['description'])
        self.assertIn('https://kd1035.eu/ucet#hraci', embed['description'])
        self.assertEqual(announce_new_players(), 0)
        self.assertEqual(self.send.call_count, 1)

    def test_the_message_waits_for_the_ingame_name(self):
        newbie = self.newbie()
        now = newbie.created_at + timedelta(minutes=1)
        self.assertEqual(announce_new_players(now), 0)
        self.send.assert_not_called()
        self.assertFalse(Player.objects.get(pk=newbie.pk).announced)
        Player.objects.filter(pk=newbie.pk).update(ingame_name='Nelly1035')
        self.assertEqual(announce_new_players(now + timedelta(seconds=30)), 1)
        self.assertEqual(self.send.call_args.args[1]['embeds'][0]['title'], 'Nový hráč na webe: Nelly1035')

    def test_without_an_ingame_name_the_message_goes_after_the_grace(self):
        newbie = self.newbie()
        self.assertEqual(announce_new_players(newbie.created_at + NAME_GRACE - timedelta(seconds=1)), 0)
        self.assertEqual(announce_new_players(newbie.created_at + NAME_GRACE), 1)
        embed = self.send.call_args.args[1]['embeds'][0]
        self.assertEqual(embed['title'], 'Nový hráč na webe: Nelly')
        self.assertIn('Meno v hre: zatiaľ nevyplnené', embed['description'])
        self.assertIn('Web: SK', embed['description'])

    def test_the_players_own_texts_are_not_markdown(self):
        self.newbie(ingame_name='*[x](https://evil.example)*', username='the_nelly')
        announce_new_players()
        description = self.send.call_args.args[1]['embeds'][0]['description']
        self.assertIn(r'Meno v hre: **\*\[x\]\(https\://evil.example\)\***', description)
        self.assertIn(r'· the\_nelly', description)
        self.assertNotIn('](https://evil', description)

    def test_discord_down_keeps_the_news_for_the_next_tick(self):
        newbie = self.newbie(ingame_name='Nelly1035')
        self.send.side_effect = discord_bot.BotError('429', temporary=True)
        with self.assertRaises(DiscordPaused):
            announce_new_players()
        self.assertFalse(Player.objects.get(pk=newbie.pk).announced)
        self.send.side_effect = discord_bot.BotError('blocked', blocked=True)
        self.assertEqual(announce_new_players(), 1)
        self.assertTrue(Player.objects.get(pk=newbie.pk).announced)

    @override_settings(DISCORD_BOT_TOKEN='')
    def test_without_a_bot_nothing_piles_up(self):
        newbie = self.newbie()  # just signed in without an in-game name: no waiting without a bot
        self.assertEqual(announce_new_players(), 1)
        self.send.assert_not_called()
        self.assertTrue(Player.objects.get(pk=newbie.pk).announced)

    @override_settings(DISCORD_ADMIN_IDS=['1', '2'])
    def test_an_admin_who_got_it_does_not_get_it_again(self):
        self.newbie(ingame_name='Nelly1035')
        self.send.side_effect = [None, discord_bot.BotError('429', temporary=True)]
        self.assertEqual(announce_new_players(), 1)
        self.assertEqual(announce_new_players(), 0)
        self.assertEqual([c.args[0] for c in self.send.call_args_list], ['1', '2'])


class SignupBuildTests(KvkTestCase):
    def test_the_build_patch_changes_only_the_build(self):
        self.sign_up(note='večer')
        res = self.call(
            'patch',
            '/api/kvk/signup/',
            {'role': 'rally', 'primary': '', 'primary_skills': '1111', 'note': 'x', 'kind': 'archer', 'attack': 12.5},
        )
        self.assertEqual(res.status_code, 200, res.content)
        saved = KvkSignup.objects.get()
        self.assertEqual((saved.primary, saved.primary_skills, saved.note, saved.kind), ('Attila', '5555', 'večer', 'cavalry'))
        self.assertEqual(float(saved.attack), 12.5)


class UnapprovedTests(KvkTestCase):
    """An un-approved player keeps their marches and sign-ups; only the superuser sees them (Gether 12. 10. 2026)."""

    def test_only_the_superuser_sees_an_unapproved_players_things(self):
        self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS})
        self.call('patch', '/api/me/marches/', {'public': True})
        self.sign_up()
        Player.objects.filter(pk=self.player.pk).update(approved=False)

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        r4 = self.login(reviewer.user)
        other = self.login(make_player('44').user)
        admin_player = make_player('245662824171438090', approved=False)
        admin_player.user.is_superuser = True
        admin_player.user.save()
        admin = self.login(admin_player.user)

        self.assertEqual(other.get('/api/marches/').json()['players'], [])
        self.assertEqual(r4.get('/api/marches/').json()['players'], [])
        self.assertEqual(r4.get('/api/kvk/signups/').json()['signups'], [])
        players = admin.get('/api/marches/').json()['players']
        self.assertEqual([(p['id'], p['approved']) for p in players], [(self.player.pk, False)])
        signups = admin.get('/api/kvk/signups/').json()['signups']
        self.assertEqual([s['player']['approved'] for s in signups], [False])
        # nothing was deleted; approved again, everyone sees it again
        Player.objects.filter(pk=self.player.pk).update(approved=True)
        self.assertEqual(len(r4.get('/api/kvk/signups/').json()['signups']), 1)
        self.assertEqual(len(other.get('/api/marches/').json()['players']), 1)


class TermsTests(KvkTestCase):
    """A player agrees to the terms of use before adding marches and sign-ups; the version and the time are saved."""

    def test_the_player_agrees_first(self):
        newbie = make_player('42', terms=False)
        client = self.login(newbie.user)
        self.assertFalse(client.get('/api/auth/me/').json()['user']['terms_accepted'])
        res = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila', **STATS}, client)
        self.assertEqual((res.status_code, res.json()), (403, {'detail': 'terms'}))
        self.assertEqual(self.sign_up(client).json(), {'detail': 'terms'})

        self.assertEqual(Client(enforce_csrf_checks=True).post('/api/auth/terms/').status_code, 403)
        res = self.call('post', '/api/auth/terms/', client=client)
        self.assertTrue(res.json()['user']['terms_accepted'])
        newbie.refresh_from_db()
        self.assertEqual(newbie.terms_version, TERMS_VERSION)
        self.assertIsNotNone(newbie.terms_accepted_at)
        self.assertEqual(self.sign_up(client).status_code, 200)

        # new terms: asked again
        Player.objects.filter(pk=newbie.pk).update(terms_version='2026-01-01')
        self.assertFalse(client.get('/api/auth/me/').json()['user']['terms_accepted'])


class GoldGearIconicMigrationTests(TestCase):
    """accounts/0026: saved gold equipment without an iconic level gets I (Gether 13. 10. 2026)."""

    def test_gold_pieces_without_iconic_get_one(self):
        from importlib import import_module

        from django.apps import apps

        player = make_player()
        gear = {
            'weapon': {'item': 'dragons-breath-bow', 'crit': False, 'iconic': 0},
            'helmet': {'item': 'lance-of-the-hellish-wasteland', 'crit': True, 'iconic': 3},
        }
        march = March.objects.create(player=player, position=1, kind='archer', primary='Qin Shi Huang', gear=gear)
        epic = March.objects.create(
            player=player, position=2, kind='archer', primary='Qin Shi Huang',
            gear={'weapon': {'item': 'heart-of-the-saint', 'crit': False, 'iconic': 0}},
        )  # fmt: skip
        signup = KvkSignup.objects.create(
            player=player, role='rally', kind='archer', primary='Qin Shi Huang',
            gear={'weapon': {'item': 'dragons-breath-bow', 'crit': False, 'iconic': 0}},
        )  # fmt: skip
        import_module('accounts.migrations.0026_gold_gear_iconic_one').iconic_one(apps, None)
        march.refresh_from_db()
        epic.refresh_from_db()
        signup.refresh_from_db()
        self.assertEqual(march.gear['weapon']['iconic'], 1)
        # a level set by the player stays, an epic item cannot be awakened
        self.assertEqual(march.gear['helmet']['iconic'], 3)
        self.assertEqual(epic.gear['weapon']['iconic'], 0)
        self.assertEqual(signup.gear['weapon']['iconic'], 1)
