import io
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image

from . import cleanup, private_images
from .models import KvkImage, KvkRound, KvkSignup, March, MarchImage
from .test_reminders import make_player


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
        self.round = KvkRound.objects.create(title_sk='KvK 3')
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
        body = {'ingame_name': 'Nelly', 'rally': True, 'garrison': False, 'commanders': 'Attila + Takeda', **data}
        return self.call('put', '/api/kvk/signup/', body, client)

    def upload(self, kind='vip', file=None, client=None):
        return self.call('post_file', '/api/kvk/signup/images/', {'kind': kind, 'file': file or picture()}, client)


class SignupTests(KvkTestCase):
    def test_state_signup_and_withdraw(self):
        state = self.client.get('/api/kvk/').json()
        self.assertEqual(state['round']['title_sk'], 'KvK 3')
        self.assertIsNone(state['signup'])
        self.assertFalse(state['reviewer'])

        res = self.sign_up(note=' prvý rally ')
        self.assertEqual(res.status_code, 200, res.content)
        self.player.refresh_from_db()
        self.assertEqual(self.player.ingame_name, 'Nelly')
        self.assertEqual(res.json()['note'], 'prvý rally')
        self.assertFalse(res.json()['complete'])
        # a second PUT changes the same sign-up
        self.sign_up(garrison=True)
        self.assertEqual(KvkSignup.objects.get().garrison, True)

        self.assertEqual(self.call('delete', '/api/kvk/signup/').status_code, 204)
        self.assertFalse(KvkSignup.objects.exists())

    def test_needs_a_role_a_name_and_an_open_round(self):
        self.assertEqual(self.sign_up(rally=False).status_code, 400)
        self.assertEqual(self.sign_up(ingame_name='').status_code, 400)
        self.round.is_open = False
        self.round.save()
        self.assertEqual(self.sign_up().status_code, 409)
        self.assertIsNone(Client().get('/api/kvk/').json()['round'])

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

    def test_refuses_non_images_big_files_and_more_than_three_per_kind(self):
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
        for _ in range(3):
            self.assertEqual(self.upload(kind='equipment', file=picture('PNG', (800, 600), exif=False)).status_code, 201)
        self.assertEqual(self.upload(kind='equipment').json()['detail'], 'limit')

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

    def test_files_go_with_image_signup_round_and_account(self):
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
            self.round.delete()
        self.assertEqual(files(), [])

    def test_someone_elses_image_cannot_be_deleted(self):
        self.upload()
        image = KvkImage.objects.get()
        other = self.login(make_player('42').user)
        self.assertEqual(self.call('delete', f'/api/kvk/signup/images/{image.pk}/', client=other).status_code, 404)


class ReviewTests(KvkTestCase):
    def test_reviewers_see_every_signup_others_do_not(self):
        self.sign_up()
        url = f'/api/kvk/rounds/{self.round.pk}/signups/'
        self.assertEqual(self.client.get(url).status_code, 403)

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        client = self.login(reviewer.user)
        data = client.get(url).json()
        self.assertEqual([s['player']['ingame_name'] for s in data['signups']], ['Nelly'])
        self.assertEqual(data['signups'][0]['player']['discord_id'], self.player.discord_id)
        self.assertEqual(client.get('/api/kvk/rounds/').json()['rounds'][0]['signups'], 1)
        # reviewers may not manage
        self.assertEqual(self.call('post', '/api/kvk/rounds/', {'title_sk': 'X'}, client).status_code, 403)
        self.assertEqual(self.call('patch', f'/api/kvk/rounds/{self.round.pk}/', {'is_open': False}, client).status_code, 403)
        self.assertEqual(client.get('/api/kvk/reviewers/').status_code, 403)

    def test_superuser_manages_rounds_and_reviewers(self):
        admin_player = make_player('245662824171438090')
        admin_player.user.is_superuser = True
        admin_player.user.save()
        admin = self.login(admin_player.user)

        res = self.call('post', '/api/kvk/rounds/', {'title_sk': 'KvK 4', 'title_cs': 'KvK 4'}, admin)
        self.assertEqual(res.status_code, 201)
        self.round.refresh_from_db()
        self.assertFalse(self.round.is_open)  # one open round at a time
        self.assertEqual(admin.get('/api/kvk/').json()['round']['title_sk'], 'KvK 4')

        res = self.call('patch', f'/api/kvk/rounds/{self.round.pk}/', {'is_open': True}, admin)
        self.assertTrue(res.json()['is_open'])
        self.assertEqual(KvkRound.objects.filter(is_open=True).count(), 1)

        players = admin.get('/api/kvk/reviewers/').json()['players']
        self.assertIn(self.player.pk, [p['id'] for p in players])
        res = self.call('patch', f'/api/kvk/reviewers/{self.player.pk}/', {'reviewer': True}, admin)
        self.assertEqual(res.json()['reviewer'], True)
        self.assertTrue(self.client.get('/api/kvk/').json()['reviewer'])
        self.assertEqual(self.call('patch', f'/api/kvk/reviewers/{self.player.pk}/', {'reviewer': 'yes'}, admin).status_code, 400)

        self.assertEqual(self.call('delete', f'/api/kvk/rounds/{self.round.pk}/', client=admin).status_code, 204)
        self.assertFalse(KvkRound.objects.filter(pk=self.round.pk).exists())

    def test_creating_a_round_ignores_is_open_and_closing_dates_the_round(self):
        admin = self.login(User.objects.create_superuser('admin', password='x'))
        res = self.call('post', '/api/kvk/rounds/', {'title_sk': 'KvK 5', 'is_open': True}, admin)
        self.assertEqual(res.status_code, 201)
        self.round.refresh_from_db()
        self.assertIsNotNone(self.round.closed_at)
        created = KvkRound.objects.get(title_sk='KvK 5')
        self.call('patch', f'/api/kvk/rounds/{created.pk}/', {'is_open': False}, admin)
        created.refresh_from_db()
        self.assertIsNotNone(created.closed_at)
        self.call('patch', f'/api/kvk/rounds/{created.pk}/', {'is_open': True}, admin)
        created.refresh_from_db()
        self.assertIsNone(created.closed_at)


class RetentionTests(KvkTestCase):
    def test_closed_round_signup_can_be_withdrawn_and_is_pruned_after_60_days(self):
        from datetime import timedelta

        from django.utils import timezone

        self.sign_up()
        self.upload()
        self.round.is_open = False
        self.round.closed_at = timezone.now()
        self.round.save()
        state = self.client.get('/api/kvk/').json()
        self.assertIsNone(state['round'])
        self.assertIsNone(state['signup'])
        self.assertEqual(state['older'][0]['round']['title_sk'], 'KvK 3')
        # the player may still delete a screenshot of the closed round
        image = KvkImage.objects.get()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.call('delete', f'/api/kvk/signup/images/{image.pk}/').status_code, 204)

        self.assertEqual(cleanup.prune_kvk(timezone.now() + timedelta(days=59)), 0)
        self.assertEqual(cleanup.prune_kvk(timezone.now() + timedelta(days=61)), 1)
        self.assertFalse(KvkSignup.objects.exists())

    def test_an_older_signup_can_be_withdrawn_while_a_new_round_is_open(self):
        self.sign_up()
        self.round.is_open = False
        self.round.save()
        new = KvkRound.objects.create(title_sk='KvK 4')
        self.sign_up()
        state = self.client.get('/api/kvk/').json()
        self.assertEqual(state['signup']['round'], new.pk)
        self.assertEqual([o['round']['id'] for o in state['older']], [self.round.pk])

        self.assertEqual(self.call('delete', '/api/kvk/signup/?round=x').status_code, 400)
        self.assertEqual(self.call('delete', f'/api/kvk/signup/?round={self.round.pk}').status_code, 204)
        self.assertEqual(list(KvkSignup.objects.values_list('round_id', flat=True)), [new.pk])
        # someone else's round id deletes nothing of theirs
        other = make_player('42')
        KvkSignup.objects.create(round=self.round, player=other, rally=True)
        self.assertEqual(self.call('delete', f'/api/kvk/signup/?round={self.round.pk}').status_code, 204)
        self.assertTrue(KvkSignup.objects.filter(player=other).exists())

    def test_sweep_deletes_only_old_orphans(self):
        import os
        import time

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
            'accounts.march_views.commander_index',
            return_value=[{'name': 'Attila'}, {'name': 'Takeda Shingen'}, {'name': 'Scipio Africanus'}],
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_add_up_to_seven_edit_and_delete_moves_the_rest_up(self):
        # a new march needs its type and primary commander
        self.assertEqual(self.call('post', '/api/me/marches/', {'primary': 'Attila'}).json()['kind'], ['required'])
        self.assertEqual(self.call('post', '/api/me/marches/', {'kind': 'cavalry'}).json()['primary'], ['required'])
        for i in range(7):
            res = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila'})
            self.assertEqual((res.status_code, res.json()['position']), (201, i + 1))
        self.assertEqual(self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila'}).json()['detail'], 'limit')

        marches = self.client.get('/api/me/marches/').json()['marches']
        second = marches[1]['id']
        res = self.call('patch', f'/api/me/marches/{second}/', {'secondary': 'Takeda Shingen', 'kind': 'conquering'})
        self.assertEqual((res.json()['secondary'], res.json()['kind']), ('Takeda Shingen', 'conquering'))
        self.assertEqual(self.call('patch', f'/api/me/marches/{second}/', {'primary': 'Nobody'}).status_code, 400)
        self.assertEqual(self.call('patch', f'/api/me/marches/{second}/', {'kind': 'dragons'}).status_code, 400)

        first = marches[0]['id']
        self.assertEqual(self.call('delete', f'/api/me/marches/{first}/').status_code, 204)
        positions = [m['position'] for m in self.client.get('/api/me/marches/').json()['marches']]
        self.assertEqual(positions, [1, 2, 3, 4, 5, 6])

    def test_screenshots_private_and_deleted_with_the_march(self):
        march = self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila'}).json()
        upload_url = f'/api/me/marches/{march["id"]}/images/'
        res = self.call('post_file', upload_url, {'kind': 'equipment', 'file': picture()})
        self.assertEqual(res.status_code, 201, res.content)
        url = res.json()['url']
        self.assertTrue(url.startswith('/api/marches/images/'))
        self.assertEqual(self.client.get(url).status_code, 200)
        other = self.login(make_player('42').user)
        self.assertEqual(other.get(url).status_code, 404)
        self.assertEqual(self.call('post_file', upload_url, {'kind': 'equipment', 'file': picture()}, other).status_code, 404)
        self.assertEqual(self.call('post_file', upload_url, {'kind': 'vip', 'file': picture()}).status_code, 400)
        # one screenshot of each kind
        self.assertEqual(self.call('post_file', upload_url, {'kind': 'equipment', 'file': picture()}).json()['detail'], 'limit')

        reviewer = make_player('43')
        reviewer.kvk_reviewer = True
        reviewer.save()
        self.assertEqual(self.login(reviewer.user).get(url).status_code, 200)

        # the reviewers see the marches with the sign-up
        self.sign_up()
        data = self.login(reviewer.user).get(f'/api/kvk/rounds/{self.round.pk}/signups/').json()
        self.assertEqual(data['signups'][0]['marches'][0]['primary'], 'Attila')

        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.call('delete', f'/api/me/marches/{march["id"]}/').status_code, 204)
        self.assertFalse(MarchImage.objects.exists())
        self.assertEqual(list((self.media / 'marches').iterdir()), [])

    def test_account_deletion_removes_marches(self):
        self.call('post', '/api/me/marches/', {'kind': 'cavalry', 'primary': 'Attila'})
        self.player.delete_account()
        self.assertFalse(March.objects.exists())
