import io
from importlib import import_module

from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY, get_user_model
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from accounts.kvk_views import store_image
from accounts.models import March, MarchImage, Player

# a made-up Discord ID: the snapshot leaves discord_* users and every accounts_* row out (kingdom/snapshot.py)
DISCORD_ID = '999000111'
USERNAME = f'discord_{DISCORD_ID}'
DAY = 24 * 60 * 60
# --marches: a full set of marches, long names included
SAMPLE_MARCHES = [
    ('cavalry', 'Arthur Pendragon', 'Ivan IV'),
    ('cavalry', 'Attila', 'Achilles'),
    ('archer', 'Qin Shi Huang', 'Zhuge Liang'),
    ('infantry', 'Bai Qi', 'Liu Che'),
    ('conquering', 'William Marshal', 'David IV'),
    ('garrison', "K'inich Janaab' Pakal", 'Nebuchadnezzar II'),
    ('engineering', 'Gonzalo de Cordoba', ''),
]


class Command(BaseCommand):
    help = (
        'Local development only: a test player signed in with Discord for screenshots of /ucet, /pripomienky or '
        'the calendar. Prints only the session key – SESSION=$(… test_session) – and --delete removes it again.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--superuser', action='store_true', help='Staff + superuser (manages events).')
        parser.add_argument('--delete', action='store_true', help='Delete the test player and its sessions.')
        parser.add_argument(
            '--marches', action='store_true', help='Seven public marches with screenshots (screenshots of /marche).'
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('test_session is for local development only (DJANGO_DEBUG=1).')
        user = get_user_model().objects.filter(username=USERNAME).first()
        if options['delete']:
            if user:
                self.drop_sessions(user)
                player = Player.objects.filter(user=user).first()
                if player:
                    player.delete_account()  # also its reminders and the admin history about it
                else:
                    user.delete()
            self.stderr.write('Test player deleted.')
            return

        if user is None:
            user = get_user_model()(username=USERNAME)
            user.set_unusable_password()
        user.first_name = 'Test Player'
        user.is_staff = user.is_superuser = options['superuser']
        user.save()
        player, _ = Player.objects.update_or_create(
            user=user,
            defaults={'discord_id': DISCORD_ID, 'username': 'testplayer', 'global_name': 'Test Player'},
        )
        if options['marches']:
            self.seed_marches(player)
        self.drop_sessions(user)

        session = import_module(settings.SESSION_ENGINE).SessionStore()
        session[SESSION_KEY] = str(user.pk)
        session[BACKEND_SESSION_KEY] = 'django.contrib.auth.backends.ModelBackend'
        session[HASH_SESSION_KEY] = user.get_session_auth_hash()
        session.set_expiry(DAY)
        session.create()
        role = 'superuser' if options['superuser'] else 'player'
        self.stderr.write(f'Test {role} {USERNAME} signed in for a day (sessionid cookie below).')
        self.stdout.write(session.session_key)

    @staticmethod
    def seed_marches(player):
        player.marches.all().delete()
        player.ingame_name = 'Test Player'
        player.marches_public = True
        player.save()
        for position, (kind, primary, secondary) in enumerate(SAMPLE_MARCHES, start=1):
            march = March.objects.create(player=player, position=position, kind=kind, primary=primary, secondary=secondary)
            for image_kind, colour in (('equipment', (180, 140, 60)), ('armaments', (40, 70, 130))):
                upload = io.BytesIO()
                Image.new('RGB', (640, 400), colour).save(upload, 'PNG')
                upload.size = upload.tell()
                upload.seek(0)
                store_image(MarchImage, upload, 'marches', march=march, kind=image_kind)

    @staticmethod
    def drop_sessions(user):
        for session in Session.objects.all():
            if session.get_decoded().get(SESSION_KEY) == str(user.pk):
                session.delete()
