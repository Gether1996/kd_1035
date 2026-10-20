import json
import time
from unittest import mock

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.test import Client, TestCase, override_settings

from . import discord_interactions
from .models import Player
from .newcomers import announce_new_players, message
from .test_reminders import make_player

KEY = Ed25519PrivateKey.generate()
PUBLIC = KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
ADMIN = '245662824171438090'
URL = '/api/discord/interactions/'


@override_settings(DISCORD_PUBLIC_KEY=PUBLIC, DISCORD_ADMIN_IDS=[ADMIN], DISCORD_BOT_TOKEN='bot', SITE_URL='https://kd1035.eu')
class InteractionTests(TestCase):
    """The "Schváliť" button in the bot's message about a new player (Gether 20. 10. 2026)."""

    def setUp(self):
        self.newbie = make_player('42', approved=False)

    def post(self, body: dict, *, key=KEY, timestamp=None, signature=None):
        raw = json.dumps(body).encode()
        timestamp = str(int(time.time()) if timestamp is None else timestamp)
        signature = signature or key.sign(timestamp.encode() + raw).hex()
        return Client().post(
            URL,
            raw,
            content_type='application/json',
            HTTP_X_SIGNATURE_ED25519=signature,
            HTTP_X_SIGNATURE_TIMESTAMP=timestamp,
        )

    def click(self, custom_id: str, clicker: str = ADMIN, **kwargs):
        return self.post({'type': 3, 'data': {'custom_id': custom_id, 'component_type': 2}, 'user': {'id': clicker}}, **kwargs)

    def test_discord_checks_the_endpoint(self):
        self.assertEqual(self.post({'type': 1}).json(), {'type': 1})
        # a bad signature, another key, an old request: refused (Discord tests the first one when the URL is saved)
        self.assertEqual(self.post({'type': 1}, signature='00' * 64).status_code, 401)
        self.assertEqual(self.post({'type': 1}, key=Ed25519PrivateKey.generate()).status_code, 401)
        self.assertEqual(self.post({'type': 1}, timestamp=int(time.time()) - 600).status_code, 401)
        self.assertEqual(Client().post(URL, '{}', content_type='application/json').status_code, 401)
        self.assertEqual(Client().get(URL).status_code, 405)

    @override_settings(DISCORD_PUBLIC_KEY='')
    def test_off_without_the_key(self):
        self.assertEqual(self.post({'type': 1}).status_code, 404)
        self.assertEqual(message(self.newbie)['components'], [])

    def test_the_message_has_the_button_and_a_click_approves(self):
        Player.objects.filter(pk=self.newbie.pk).update(announced=False, ingame_name='Nelly1035')
        with mock.patch('accounts.discord_bot.send_dm') as send:
            announce_new_players()
        [button] = send.call_args.args[1]['components'][0]['components']
        self.assertEqual((button['label'], button['style']), ('Schváliť', 3))

        res = self.click(button['custom_id']).json()
        player = Player.objects.get(pk=self.newbie.pk)
        # approved like with the switch: the player's welcome DM is due
        self.assertEqual((player.approved, player.welcome_due), (True, True))
        # the message rewritten in place: approved, green, no button
        self.assertEqual(res['type'], 7)
        self.assertIn('**Schválený**', res['data']['embeds'][0]['description'])
        self.assertEqual(res['data']['embeds'][0]['color'], 0x3BA55D)
        self.assertEqual(res['data']['components'], [])
        # a second click (another superadmin's message): nothing changes, the message catches up
        Player.objects.filter(pk=self.newbie.pk).update(welcome_due=False)
        self.assertEqual(self.click(button['custom_id']).json()['type'], 7)
        self.assertFalse(Player.objects.get(pk=self.newbie.pk).welcome_due)

    def test_only_a_superadmin_from_env_approves(self):
        custom_id = discord_interactions.approve_id(self.newbie)
        res = self.click(custom_id, clicker='42').json()
        self.assertEqual((res['type'], res['data']['flags']), (4, 64))
        self.assertFalse(Player.objects.get(pk=self.newbie.pk).approved)

    def test_a_button_of_another_site_or_a_forged_one_does_nothing(self):
        # a dev PC signs with its own DJANGO_SECRET_KEY
        with override_settings(SECRET_KEY='another-key-of-a-dev-pc-' * 3):
            dev = discord_interactions.approve_id(self.newbie)
        for custom_id in (dev, f'approve:{self.newbie.pk}:x', 'approve:x:y', 'nonsense'):
            res = self.click(custom_id).json()
            self.assertEqual(res['type'], 4, custom_id)
        self.assertFalse(Player.objects.get(pk=self.newbie.pk).approved)

    def test_a_deleted_player(self):
        custom_id = discord_interactions.approve_id(self.newbie)
        self.newbie.user.delete()
        self.assertEqual(self.click(custom_id).json()['data']['content'], 'Hráč už na webe nie je.')
