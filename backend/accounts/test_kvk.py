import io
import os
import shutil
import tempfile
import time
from pathlib import Path

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image

from . import cleanup, private_images
from .models import MAX_MARCHES, KvkImage, KvkSettings, KvkSignup, March
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

    def upload(self, kind='equipment', file=None, client=None, role='rally'):
        body = {'role': role, 'kind': kind, 'file': file or picture()}
        return self.call('post_file', '/api/kvk/signup/images/', body, client)


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
        self.assertFalse(res.json()['complete'])
        # a second PUT of the same role changes it
        self.sign_up(secondary='Takeda Shingen')
        self.assertEqual(KvkSignup.objects.get().secondary, 'Takeda Shingen')

        self.assertEqual(self.call('delete', '/api/kvk/signup/').status_code, 400)
        self.assertEqual(self.call('delete', '/api/kvk/signup/?role=rally').status_code, 204)
        self.assertFalse(KvkSignup.objects.exists())

    def test_rally_and_garrison_are_two_sign_ups_with_their_own_army(self):
        self.sign_up(primary='Attila')
        self.sign_up(role='garrison', primary='Takeda Shingen', note='mesto')
        self.upload(kind='armaments', role='garrison')
        signups = self.client.get('/api/kvk/').json()['signups']
        self.assertEqual((signups['rally']['primary'], signups['garrison']['primary']), ('Attila', 'Takeda Shingen'))
        self.assertEqual([i['kind'] for i in signups['garrison']['images']], ['armaments'])
        self.assertEqual(signups['rally']['images'], [])
        # a screenshot needs one of the player's sign-ups
        self.assertEqual(self.upload(role='nothing').status_code, 409)
        # withdrawing the garrison keeps the rally
        self.assertEqual(self.call('delete', '/api/kvk/signup/?role=garrison').status_code, 204)
        self.assertEqual(list(KvkSignup.objects.values_list('role', flat=True)), ['rally'])

    def test_filled_in_like_a_march(self):
        res = self.sign_up(secondary='Takeda Shingen', attack=12, gold=3)
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual((data['primary'], data['secondary'], data['attack'], data['defense'], data['gold']), ('Attila', 'Takeda Shingen', 12, None, 3))
        # the primary commander is required and must be one of the roster; bonuses have two digits
        self.assertEqual(self.sign_up(primary='').json()['primary'], ['required'])
        self.assertEqual(self.sign_up(primary='Nobody').json()['primary'], ['unknown'])
        self.assertEqual(self.sign_up(attack=100).status_code, 400)
        # a screenshot of the equipment and of the armaments makes it complete
        self.upload()
        self.assertFalse(self.client.get('/api/kvk/').json()['signups']['rally']['complete'])
        self.upload(kind='armaments')
        self.assertTrue(self.client.get('/api/kvk/').json()['signups']['rally']['complete'])
        self.assertEqual(self.upload(kind='vip').status_code, 400)

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


class ImageTests(KvkTestCase):
    def setUp(self):
        super().setUp()
        self.sign_up()

    def test_upload_strips_metadata_and_makes_a_thumbnail(self):
        res = self.upload()
        self.assertEqual(res.status_code, 201, res.content)
        image = KvkImage.objects.get()
        stored = Image.open(self.media / image.path)
        self.assertEqual(stored.format, 'WEBP')
        for key in ('exif', 'xmp', 'icc_profile'):
            self.assertNotIn(key, stored.info)
        self.assertNotIn(b'PhoneMaker', (self.media / image.path).read_bytes())
        self.assertEqual(max(stored.size), private_images.MAX_SIDE)
        self.assertLessEqual(max(Image.open(self.media / image.thumb).size), private_images.THUMB_SIDE)
        self.assertNotIn(str(self.media), res.json()['url'])

    def test_refuses_non_images_big_files_and_a_second_one_of_a_kind(self):
        fake = SimpleUploadedFile('shot.png', b'<?php echo 1; ?>', content_type='image/png')
        self.assertEqual(self.upload(file=fake).json()['detail'], 'not_image')
        gif = io.BytesIO()
        Image.new('RGB', (10, 10)).save(gif, 'GIF')
        self.assertEqual(self.upload(file=SimpleUploadedFile('a.gif', gif.getvalue())).json()['detail'], 'not_image')
        self.assertEqual(self.upload(kind='selfie').status_code, 400)
        original = private_images.MAX_BYTES
        private_images.MAX_BYTES = 100
        try:
            self.assertEqual(self.upload().json()['detail'], 'too_big')
        finally:
            private_images.MAX_BYTES = original
        first = self.upload(kind='equipment', file=picture('PNG', (800, 600), exif=False))
        self.assertEqual(first.status_code, 201)
        # a second one of the same kind replaces the first – a refused one keeps it
        self.assertEqual(self.upload(kind='equipment', file=fake).status_code, 400)
        self.assertEqual(list(KvkImage.objects.values_list('pk', flat=True)), [first.json()['id']])
        second = self.upload(kind='equipment')
        self.assertEqual(second.status_code, 201)
        self.assertEqual(list(KvkImage.objects.values_list('pk', flat=True)), [second.json()['id']])

    def test_only_owner_reviewers_and_superuser_see_the_file(self):
        url = self.upload().json()['url']
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(url)['Cache-Control'], 'private, max-age=600')
        other = self.login(make_player('42').user)
        self.assertEqual(other.get(url).status_code, 404)
        self.assertEqual(Client().get(url).status_code, 404)

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        self.assertEqual(self.login(reviewer.user).get(url + '?thumb=1').status_code, 200)
        self.assertEqual(self.login(User.objects.create_superuser('admin', password='x')).get(url).status_code, 200)

    def test_files_go_with_image_signup_and_account(self):
        self.upload()
        self.upload(kind='armaments')
        files = lambda: sorted(p.name for p in (self.media / 'kvk').iterdir())  # noqa: E731
        self.assertEqual(len(files()), 4)

        first = KvkImage.objects.first()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.call('delete', f'/api/kvk/signup/images/{first.pk}/').status_code, 204)
        self.assertEqual(len(files()), 2)

        with self.captureOnCommitCallbacks(execute=True):
            self.player.delete_account()
        self.assertEqual(files(), [])

        player = make_player('44')
        client = self.login(player.user)
        self.sign_up(client=client)
        self.upload(client=client)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.call('delete', '/api/kvk/signup/?role=rally', client=client).status_code, 204)
        self.assertEqual(files(), [])

    def test_someone_elses_image_cannot_be_deleted(self):
        self.upload()
        image = KvkImage.objects.get()
        other = self.login(make_player('42').user)
        self.assertEqual(self.call('delete', f'/api/kvk/signup/images/{image.pk}/', client=other).status_code, 404)


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
    def test_sweep_deletes_only_old_orphans(self):
        self.sign_up()
        self.upload()
        orphan = self.media / 'kvk' / 'orphan.webp'
        orphan.write_bytes(b'x')
        fresh = self.media / 'kvk' / 'fresh.webp'
        fresh.write_bytes(b'x')
        old = time.time() - 2 * private_images.SWEEP_GRACE_SECONDS
        os.utime(orphan, (old, old))
        image = KvkImage.objects.get()
        os.utime(self.media / image.path, (old, old))
        self.assertEqual(cleanup.sweep_files(), 1)
        self.assertFalse(orphan.exists())
        self.assertTrue(fresh.exists())
        self.assertTrue((self.media / image.path).exists())


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
