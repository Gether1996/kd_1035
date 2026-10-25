import json
import time
from unittest import mock

from django.core.cache import cache
from django.test import Client, TestCase
from .forum_views import COOKIE
from .models import ForumPost, ForumThread
from .test_reminders import make_player


class Forum(TestCase):
    """Nelly and Bob (approved), Eve (waits for approval), the superadmin"""

    def setUp(self):
        cache.clear()
        self.nelly = make_player('1')
        self.bob = make_player('2')
        self.eve = make_player('3', approved=False)
        admin = make_player('4')
        admin.user.is_superuser = True
        admin.user.save()
        self.as_nelly, self.as_bob, self.as_eve, self.as_admin = (
            self.login(p) for p in (self.nelly, self.bob, self.eve, admin)
        )

    def login(self, player):
        client = Client(enforce_csrf_checks=True)
        client.force_login(player.user)
        client.token = client.get('/api/auth/me/').cookies['csrftoken'].value
        return client

    def send(self, client, method, url, data=None):
        # a person had the form open for a few seconds and left the hidden field empty
        data = {'website': '', 'elapsed': 5000, **(data or {})}
        return getattr(client, method)(url, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=client.token)

    def thread(self, client=None, title='Kto ide na rally?', body='Ahoj'):
        return self.send(client or self.as_nelly, 'post', '/api/forum/', {'title': title, 'body': body})

    def later(self, client, minutes=6):
        """the 5-minute pause of this browser is over"""
        with mock.patch('accounts.forum_views.time.time', return_value=time.time() + minutes * 60):
            return client.get('/api/forum/').json()['wait']

    def test_a_thread_and_a_reply_without_names(self):
        created = self.thread()
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()['mine'])
        tid = created.json()['id']
        reply = self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': '  Ja!  '})
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.json()['alias'], 2)

        data = self.as_bob.get(f'/api/forum/{tid}/').json()
        self.assertEqual([(p['body'], p['alias'], p['mine']) for p in data['posts']], [('Ahoj', 1, False), ('Ja!', 2, True)])
        self.assertFalse(data['thread']['mine'])
        # nothing in the answers or the database tells who wrote it
        text = json.dumps(data) + json.dumps(self.as_bob.get('/api/forum/').json())
        for name in ('nelly', 'Nelly', 'author', 'player', 'user'):
            self.assertNotIn(f'"{name}"', text)
        fields = {f.name for model in (ForumThread, ForumPost) for f in model._meta.get_fields()}
        self.assertFalse(fields & {'author', 'player', 'user'})
        # Bob keeps his number in the thread
        with mock.patch('accounts.forum_views.time.time', return_value=time.time() + 360):
            again = self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': 'Znova ja'})
        self.assertEqual(again.json()['alias'], 2)
        listed = self.as_nelly.get('/api/forum/').json()['threads'][0]
        self.assertEqual((listed['posts'], listed['mine']), (3, True))

    def test_only_newer_posts_with_after(self):
        tid = self.thread().json()['id']
        first = ForumPost.objects.get().pk
        self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': 'Druhý'})
        posts = self.as_nelly.get(f'/api/forum/{tid}/?after={first}').json()['posts']
        self.assertEqual([p['body'] for p in posts], ['Druhý'])

    def test_open_to_everyone(self):
        """a player waiting for the approval and a visitor who is not signed in read and write too"""
        self.assertEqual(self.thread(self.as_eve).status_code, 201)
        visitor = Client(enforce_csrf_checks=True)
        visitor.token = visitor.get('/api/auth/me/').cookies['csrftoken'].value
        self.assertEqual(len(visitor.get('/api/forum/').json()['threads']), 1)
        created = self.thread(visitor, title='Ahoj', body='Som tu nový')
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()['mine'])
        self.assertEqual(self.send(visitor, 'delete', f"/api/forum/{created.json()['id']}/").status_code, 204)
        # without the CSRF token nothing
        visitor.token = 'x'
        self.assertEqual(self.thread(visitor, title='Bez tokenu').status_code, 403)

    def test_bots_are_kept_out(self):
        bob = lambda **data: self.send(self.as_bob, 'post', '/api/forum/', {'title': 'Lacné gemy', 'body': 'x', **data})
        self.assertEqual(bob(website='https://spam.example').json(), {'detail': 'invalid'})
        self.assertEqual(bob(elapsed=500).json(), {'detail': 'invalid'})
        self.assertEqual(bob(elapsed='5000').json(), {'detail': 'invalid'})
        # no links from a visitor who is not signed in; a player may share one
        visitor = Client(enforce_csrf_checks=True)
        visitor.token = visitor.get('/api/auth/me/').cookies['csrftoken'].value
        for text in ('pozri https://x.y', 'www.gemy.sk', 'discord.gg/abc', 'lacne-gemy.com'):
            self.assertEqual(self.thread(visitor, body=text).json(), {'detail': 'links'}, text)
        self.assertEqual(bob(body='https://rok.lilith.com').status_code, 201)

    def test_the_whole_forum_has_a_ceiling(self):
        with mock.patch('accounts.forum_views.BUSY_THREADS', 1):
            self.thread()
            self.assertEqual(self.thread(self.as_bob).json(), {'detail': 'busy'})
        with mock.patch('accounts.forum_views.ForumIpThrottle.rate', '1/hour'):
            cache.clear()
            self.assertEqual(self.thread(self.as_bob).status_code, 201)
            self.assertEqual(self.thread(self.as_eve).json(), {'detail': 'busy'})

    def test_one_message_per_five_minutes(self):
        tid = self.thread().json()['id']
        again = self.send(self.as_nelly, 'post', f'/api/forum/{tid}/', {'body': 'Ešte'})
        self.assertEqual(again.status_code, 429)
        self.assertEqual(again.json()['detail'], 'cooldown')
        self.assertTrue(290 < again.json()['wait'] <= 301)
        self.assertEqual(self.thread(title='Druhé').status_code, 429)
        self.assertGreater(self.as_nelly.get(f'/api/forum/{tid}/').json()['wait'], 0)
        # another player is not held up
        self.assertEqual(self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': 'Ja'}).status_code, 201)
        self.assertEqual(self.later(self.as_nelly), 0)
        with mock.patch('accounts.forum_views.time.time', return_value=time.time() + 360):
            self.assertEqual(self.send(self.as_nelly, 'post', f'/api/forum/{tid}/', {'body': 'Ešte'}).status_code, 201)

    def test_the_pause_is_the_browsers_own(self):
        """the time of the last message is only in the browser's cookie – another browser of the same player writes"""
        self.thread()
        other = self.login(self.nelly)
        self.assertEqual(self.thread(other, title='Z mobilu').status_code, 201)
        # a cookie of another account in the same browser counts for nothing
        self.as_bob.cookies[COOKIE] = self.as_nelly.cookies[COOKIE].value
        self.assertEqual(self.thread(self.as_bob, title='Bob').status_code, 201)
        # an unsigned cookie claims nothing
        self.as_bob.cookies[COOKIE] = '{"u": %d, "p": [1, 2, 3], "t": [1]}' % self.nelly.user.pk
        self.assertFalse(any(t['mine'] for t in self.as_bob.get('/api/forum/').json()['threads']))

    def test_the_superadmin_writes_without_a_pause(self):
        tid = self.thread(self.as_admin).json()['id']
        self.assertEqual(self.send(self.as_admin, 'post', f'/api/forum/{tid}/', {'body': 'A'}).status_code, 201)

    def test_empty_or_long_texts_are_refused(self):
        self.assertEqual(self.thread(title='  ').status_code, 400)
        self.assertEqual(self.thread(body='x' * 1001).status_code, 400)
        self.assertFalse(ForumThread.objects.exists())

    def test_deleting_posts(self):
        tid = self.thread().json()['id']
        self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': 'Bob'})
        bobs = ForumPost.objects.get(body='Bob').pk
        self.assertEqual(self.send(self.as_nelly, 'delete', f'/api/forum/posts/{bobs}/').status_code, 403)
        deleted = self.send(self.as_bob, 'delete', f'/api/forum/posts/{bobs}/')
        self.assertEqual(deleted.json(), {'thread_deleted': False})
        # the last message goes – the thread goes with it
        nellys = ForumPost.objects.get().pk
        self.assertEqual(self.send(self.as_admin, 'delete', f'/api/forum/posts/{nellys}/').json(), {'thread_deleted': True})
        self.assertFalse(ForumThread.objects.exists())

    def test_only_the_author_or_the_superadmin_deletes_a_thread(self):
        tid = self.thread().json()['id']
        self.send(self.as_bob, 'post', f'/api/forum/{tid}/', {'body': 'Bob'})
        self.assertEqual(self.send(self.as_bob, 'delete', f'/api/forum/{tid}/').status_code, 403)
        self.assertEqual(self.send(self.as_eve, 'delete', f'/api/forum/{tid}/').status_code, 403)
        self.assertEqual(self.send(self.as_nelly, 'delete', f'/api/forum/{tid}/').status_code, 204)

    def test_another_browser_cannot_delete_my_posts(self):
        tid = self.thread().json()['id']
        mine = ForumPost.objects.get().pk
        other = self.login(self.nelly)
        self.assertEqual(self.send(other, 'delete', f'/api/forum/posts/{mine}/').status_code, 403)
        self.assertEqual(self.send(other, 'delete', f'/api/forum/{tid}/').status_code, 403)
        self.assertFalse(other.get(f'/api/forum/{tid}/').json()['posts'][0]['mine'])

    def test_a_deleted_account_leaves_the_posts(self):
        """nothing links them to the account"""
        self.thread()
        self.nelly.delete_account()
        self.assertEqual(ForumPost.objects.count(), 1)
