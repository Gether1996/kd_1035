"""New players wait for the superadmin (Gether 12. 10. 2026: "pri prihlásení nového užívateľa ho budem musieť ja ako
superadmin schváliť na pridávanie marchov, vždy keď sa prihlási úplne nový užívateľ, mi pošli na Discord upozornenie").

A player signing in for the first time is saved with approved=False and announced=False (views.save_player). Every
tick the worker sends each superadmin in DISCORD_ADMIN_IDS a private message from the bot about such a player, with a
link to the Hráči list on /ucet where the superadmin approves them. Players from before the approval count as announced
and approved (migration accounts/0023).

The web asks for the in-game name only after the first sign-in, so the message waits for it: a player is announced as
soon as they save the in-game name, or NAME_GRACE after the first sign-in without it ("zatiaľ nevyplnené").
"""

import logging
import re
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from . import discord_bot
from .models import Player
from .reminders import GOLD, DiscordPaused

log = logging.getLogger(__name__)

# the superadmin's list of players on /ucet
PLAYERS_PAGE = '/ucet#hraci'
# a burst of sign-ins (an announcement on Discord) goes out over a few ticks
PER_TICK = 5
# how long the message waits for the player's in-game name
NAME_GRACE = timedelta(minutes=15)
LANGS = {'sk': 'SK', 'cs': 'CZ'}


def plain(text: str) -> str:
    """A player's own text shown as written – Discord markdown characters escaped."""
    return re.sub(r'([\\*_~`|>#\[\]()<@:-])', r'\\\1', text)


def message(player: Player) -> dict:
    name = f'**{plain(player.ingame_name)}**' if player.ingame_name else 'zatiaľ nevyplnené'
    lines = [
        f'Meno v hre: {name}',
        f'Discord: <@{player.discord_id}> · {plain(player.username)}',
        f'Web: {LANGS.get(player.lang, player.lang.upper())}',
        'Kým ho neschváliš, nemôže pridávať marche ani prihlášky na KvK.',
    ]
    if settings.SITE_URL:
        lines.append(f'[Schváliť v zozname Hráči]({settings.SITE_URL}{PLAYERS_PAGE})')
    embed = {
        'title': f'Nový hráč na webe: {player.ingame_name or player.name}'[:256],
        'description': '\n'.join(lines),
        'color': GOLD,
        'footer': {'text': 'KD 1035 · prvé prihlásenie cez Discord'},
    }
    return {'embeds': [embed]}


def announce_new_players(now: datetime | None = None) -> int:
    """Tells the superadmins about the players not announced yet. Returns how many players were announced.

    A player waits for their in-game name up to NAME_GRACE after the first sign-in. A player is claimed
    (announced=True in one UPDATE) before the message goes out, so a second worker never sends it twice. Discord rate
    limiting or down: the player is released and DiscordPaused stops the round until the next tick. Without a bot or a
    superadmin ID nobody can be told – all the players are marked announced at once, so no pile of old news arrives
    once the bot is set up.
    """
    now = now or timezone.now()
    targets = [str(i) for i in settings.DISCORD_ADMIN_IDS if i]
    if not targets or not discord_bot.enabled():
        return Player.objects.filter(announced=False).update(announced=True)
    pending = (
        Player.objects.filter(announced=False)
        .filter(Q(ingame_name__gt='') | Q(created_at__lte=now - NAME_GRACE))
        .order_by('created_at')
    )
    count = 0
    for player in pending[:PER_TICK]:
        if not Player.objects.filter(pk=player.pk, announced=False).update(announced=True):
            continue  # another worker took it
        sent = False
        for target in targets:
            try:
                discord_bot.send_dm(target, message(player))
                sent = True
            except discord_bot.BotError as exc:
                if exc.temporary and not sent:
                    # nobody has it yet: the next tick tries again (with more admins, one who got it never gets it twice)
                    Player.objects.filter(pk=player.pk).update(announced=False)
                    log.warning('Discord unavailable, the new player waits for the next tick: %s', exc)
                    raise DiscordPaused from exc
                log.warning('New player %s not announced to %s: %s', player.pk, target, exc)
        count += 1
    return count
