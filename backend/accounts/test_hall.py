import io
import json
import tempfile
from pathlib import Path

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image

from .models import HallEntry
from .test_reminders import make_player


def jpeg(size=(1600, 1200)) -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new('RGB', size, (200, 40, 40)).save(buffer, 'JPEG')
    return SimpleUploadedFile('me.jpg', buffer.getvalue(), content_type='image/jpeg')


class Hall(TestCase):
    """Nelly (approved), Eve (waits for approval), the superadmin"""

    def setUp(self):
        cache.clear()
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        override = override_settings(PRIVATE_MEDIA_ROOT=self.media.name)
        override.enable()
        self.addCleanup(override.disable)
        self.nelly = make_player('1')
        self.nelly.ingame_name = 'Nelly'
        self.nelly.save()
        self.eve = make_player('2', approved=False)
        admin = make_player('3')
        admin.user.is_superuser = True
        admin.user.save()
        self.as_nelly, self.as_eve, self.as_admin = (self.login(p) for p in (self.nelly, self.eve, admin))

    def login(self, player):
        client = Client(enforce_csrf_checks=True)
        client.force_login(player.user)
        client.token = client.get('/api/auth/me/').cookies['csrftoken'].value
        return client

    def put(self, client, url, data):
        return client.put(url, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=client.token)

    def test_the_superadmin_fills_it_in_approved_players_see_it(self):
        saved = self.put(self.as_admin, '/api/hall/forts/1/', {'player': self.nelly.pk, 'note_sk': '48 pevností', 'count': 48})
        self.assertEqual((saved.status_code, saved.json()['count']), (200, 48))
        self.put(self.as_admin, '/api/hall/mascot/2/', {'name': 'Bobo'})
        entries = self.as_nelly.get('/api/hall/').json()['entries']
        self.assertEqual(
            [(e['category'], e['place'], e['name'], e['note']['cs']) for e in entries],
            [('forts', 1, 'Nelly', '48 pevností'), ('mascot', 2, 'Bobo', '')],
        )
        # what the editor needs stays the superadmin's
        self.assertNotIn('player', entries[0])
        self.assertEqual(self.as_eve.get('/api/hall/').status_code, 403)
        self.assertEqual(Client().get('/api/hall/').status_code, 403)
        self.assertEqual(self.put(self.as_nelly, '/api/hall/kp/1/', {'name': 'Ja'}).status_code, 403)

    def test_places_and_names_are_checked(self):
        self.assertEqual(self.put(self.as_admin, '/api/hall/mascot/3/', {'name': 'X'}).status_code, 404)
        # one champion per category – the fort destroyers and the KP have a top 3
        self.assertEqual(self.put(self.as_admin, '/api/hall/rally/2/', {'name': 'X'}).status_code, 404)
        self.assertEqual(self.put(self.as_admin, '/api/hall/kp/3/', {'name': 'X'}).status_code, 200)
        self.assertEqual(self.put(self.as_admin, '/api/hall/forts/3/', {'name': 'X'}).status_code, 200)
        # the zero corner holds three
        self.assertEqual(self.put(self.as_admin, '/api/hall/zero/3/', {'name': 'X'}).status_code, 200)
        self.assertEqual(self.put(self.as_admin, '/api/hall/zero/4/', {'name': 'X'}).status_code, 404)
        self.assertEqual(self.put(self.as_admin, '/api/hall/nope/1/', {'name': 'X'}).status_code, 404)
        self.assertEqual(self.put(self.as_admin, '/api/hall/kp/1/', {'name': ' '}).status_code, 400)

    def test_the_photo_is_private_small_and_goes_with_the_place(self):
        self.put(self.as_admin, '/api/hall/mascot/1/', {'player': self.nelly.pk})
        uploaded = self.as_admin.post(
            '/api/hall/mascot/1/photo/', {'photo': jpeg()}, HTTP_X_CSRFTOKEN=self.as_admin.token
        ).json()
        url = uploaded['photo']
        self.assertTrue(url.startswith(f'/api/hall/photos/{uploaded["id"]}/'))
        served = self.as_nelly.get(url)
        self.assertEqual((served.status_code, served['Content-Type']), (200, 'image/webp'))
        with Image.open(io.BytesIO(b''.join(served.streaming_content))) as image:
            self.assertEqual(max(image.size), 900)
        self.assertEqual(self.as_eve.get(url).status_code, 403)
        not_image = SimpleUploadedFile('x.jpg', b'nope', content_type='image/jpeg')
        refused = self.as_admin.post('/api/hall/mascot/1/photo/', {'photo': not_image}, HTTP_X_CSRFTOKEN=self.as_admin.token)
        self.assertEqual(refused.status_code, 400)
        # the account goes – the place and its photo too
        self.nelly.delete_account()
        self.assertFalse(HallEntry.objects.exists())
        self.assertEqual(list((Path(self.media.name) / 'hall').iterdir()), [])
