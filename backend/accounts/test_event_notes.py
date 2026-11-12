"""The superadmin's notes to events in the calendar's dialog (Gether 12. 11. 2026: "viaceré poznámky … nech si to drží aj
históriu, lebo každý raz píšem email s poradím hráčov")."""

import sqlite3
from datetime import UTC, datetime

from django.contrib.auth.models import User
from django.test import TestCase

from kingdom.models import KingdomEvent
from kingdom.snapshot import remove_players

from .models import EventNote, Player


def utc(*args):
    return datetime(*args, tzinfo=UTC)


class EventNoteApiTests(TestCase):
    def setUp(self):
        self.event = KingdomEvent.objects.create(
            name_sk='20 GH', starts_at=utc(2026, 10, 16), repeat_days=14, duration_minutes=2 * 24 * 60
        )
        self.url = f'/api/events/manage/{self.event.pk}/notes/'
        self.admin = User.objects.create_superuser('gether', password='x')

    def test_only_the_superadmin_reads_and_writes_them(self):
        EventNote.objects.create(event=self.event, text='1. Smrťák')
        self.assertEqual(self.client.get(self.url).status_code, 403)
        user = User.objects.create_user('discord_1', password='x')
        Player.objects.create(user=user, discord_id='1', username='hrac', approved=True, kvk_reviewer=True)
        self.client.force_login(user)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, {'text': 'x'}, content_type='application/json').status_code, 403)
        note = EventNote.objects.get()
        self.assertEqual(self.client.delete(f'/api/events/manage/notes/{note.pk}/').status_code, 403)
        self.assertEqual(EventNote.objects.count(), 1)

    def test_every_run_keeps_its_note_newest_run_first(self):
        self.client.force_login(self.admin)
        first = self.client.post(
            self.url, {'text': '  1. Smrťák\n2. Gether  ', 'run_start': '2026-10-30T00:00:00Z'}, content_type='application/json'
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()['text'], '1. Smrťák\n2. Gether')
        self.client.post(self.url, {'text': 'Všeobecne'}, content_type='application/json')
        self.client.post(
            self.url, {'text': '1. Gether', 'run_start': '2026-11-13T01:00:00+01:00'}, content_type='application/json'
        )
        notes = self.client.get(self.url).json()['notes']
        self.assertEqual(
            [(n['run_start'], n['text']) for n in notes],
            [('2026-11-13T00:00:00Z', '1. Gether'), ('2026-10-30T00:00:00Z', '1. Smrťák\n2. Gether'), (None, 'Všeobecne')],
        )
        self.assertEqual(EventNote.objects.get(text='1. Gether').author, self.admin)
        # another event has its own
        other = KingdomEvent.objects.create(name_sk='MGE', starts_at=utc(2026, 10, 16))
        self.assertEqual(self.client.get(f'/api/events/manage/{other.pk}/notes/').json(), {'notes': []})

    def test_edit_and_delete(self):
        self.client.force_login(self.admin)
        note = EventNote.objects.create(event=self.event, text='1. Smrťák', run_start=utc(2026, 10, 30))
        url = f'/api/events/manage/notes/{note.pk}/'
        answer = self.client.patch(url, {'text': '1. Smrťák\n2. Gether'}, content_type='application/json')
        self.assertEqual(answer.json()['text'], '1. Smrťák\n2. Gether')
        # the run stays when only the text changes
        self.assertEqual(answer.json()['run_start'], '2026-10-30T00:00:00Z')
        self.assertEqual(self.client.patch(url, {'text': '   '}, content_type='application/json').status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(EventNote.objects.exists())
        self.assertEqual(self.client.delete(url).status_code, 404)

    def test_empty_or_too_long_text_is_refused(self):
        self.client.force_login(self.admin)
        self.assertEqual(self.client.post(self.url, {'text': ''}, content_type='application/json').status_code, 400)
        long = 'x' * 20_001
        self.assertEqual(self.client.post(self.url, {'text': long}, content_type='application/json').status_code, 400)
        self.assertEqual(self.client.get('/api/events/manage/9999/notes/').status_code, 404)


class EventNoteSnapshotTests(TestCase):
    def test_the_git_snapshot_drops_them(self):
        """they name players – the public repo never gets them (accounts_* rows are removed)"""
        conn = sqlite3.connect(':memory:')
        conn.executescript(
            'CREATE TABLE auth_user (id INTEGER PRIMARY KEY, username TEXT);'
            'CREATE TABLE accounts_eventnote (id INTEGER PRIMARY KEY, text TEXT);'
            "INSERT INTO accounts_eventnote (text) VALUES ('1. Smrťák');"
        )
        remove_players(conn)
        self.assertEqual(conn.execute('SELECT COUNT(*) FROM accounts_eventnote').fetchone()[0], 0)
