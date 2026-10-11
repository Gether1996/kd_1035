"""One-off alarms of players ("my shield ends in 7 h 30 min, remind me 15 min before"), set on /pripomienky and sent
as a Discord DM from the bot – the same channel as the event reminders (reminders.py).

The worker takes an alarm by setting sent_at in one UPDATE before sending, so it never goes out twice, also with a
second worker. An alarm the worker missed by more than WINDOW (it was down) is closed unsent. Sent alarms are deleted a
day later (the privacy page says so).
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from . import discord_bot
from .models import Alarm
from .reminders import GOLD, REMINDERS_PAGE, WINDOW, DiscordPaused

log = logging.getLogger(__name__)

KEEP_SENT = timedelta(days=1)
# /pripomienky#budiky
ANCHOR = 'budiky'
# the error of an alarm the worker missed (admin only)
MISSED = 'Worker nebežal, budík sa neposlal.'

TEXTS = {
    'sk': {
        'title': 'Budík',
        'at': 'Čas: {at} ({relative})',
        'manage': 'Moje budíky',
        'footer': 'KD 1035 · budík si nastavil na webe v časti Pripomienky eventov',
    },
    'cs': {
        'title': 'Budík',
        'at': 'Čas: {at} ({relative})',
        'manage': 'Moje budíky',
        'footer': 'KD 1035 · budík sis nastavil na webu v části Připomínky eventů',
    },
}


def message(alarm: Alarm, lang: str) -> dict:
    """An embed like the event reminders: the player's text as the title, the time as <t:…> (each player's own zone)."""
    t = TEXTS.get(lang, TEXTS['sk'])
    unix = int(alarm.target_at.timestamp())
    lines = [t['at'].format(at=f'<t:{unix}:F>', relative=f'<t:{unix}:R>')]
    if settings.SITE_URL:
        lines.append(f'[{t["manage"]}]({settings.SITE_URL}{"/cz" if lang == "cs" else ""}{REMINDERS_PAGE}#{ANCHOR})')
    embed = {
        'title': (alarm.note or t['title'])[:256],
        'description': '\n'.join(lines),
        'color': GOLD,
        'footer': {'text': t['footer']},
    }
    return {'embeds': [embed]}


def send_alarms(now=None) -> int:
    """Sends every due alarm (remind_at in (now − WINDOW, now]). Returns how many were attempted.

    Players who switched the bot's messages off get nothing (the page warns them); without DISCORD_BOT_TOKEN the
    channel is off and the alarms wait.
    """
    now = now or timezone.now()
    # closed also while the bot is off: /pripomienky would show them as waiting forever
    Alarm.objects.filter(sent_at__isnull=True, remind_at__lte=now - WINDOW).update(
        sent_at=now, error=MISSED
    )
    if not discord_bot.enabled():
        return 0
    due = Alarm.objects.filter(
        sent_at__isnull=True,
        remind_at__lte=now,
        player__user__is_active=True,
        player__remind_discord=True,
    ).select_related('player')
    attempted = 0
    for alarm in due:
        # take it: another worker that got here first leaves 0 rows to update
        if not Alarm.objects.filter(pk=alarm.pk, sent_at__isnull=True).update(sent_at=now):
            continue
        attempted += 1
        try:
            discord_bot.send_dm(alarm.player.discord_id, message(alarm, alarm.player.lang))
            alarm.ok = True
        except discord_bot.BotError as exc:
            if exc.temporary:
                Alarm.objects.filter(pk=alarm.pk).update(sent_at=None)
                log.warning('Discord unavailable, alarms wait for the next tick: %s', exc)
                raise DiscordPaused from exc
            alarm.error = str(exc)[:300]
        except Exception:  # one broken alarm must not stop the others
            log.exception('Alarm %s for player %s failed', alarm.pk, alarm.player_id)
            alarm.error = 'Neočakávaná chyba, pozri log workera.'
        if alarm.error:
            log.warning('Alarm %s for player %s: %s', alarm.pk, alarm.player_id, alarm.error)
        Alarm.objects.filter(pk=alarm.pk).update(ok=alarm.ok, error=alarm.error)
    return attempted


def prune_alarms(now=None) -> int:
    """Sent (or missed) alarms older than a day – personal data without a purpose."""
    now = now or timezone.now()
    return Alarm.objects.filter(sent_at__lt=now - KEEP_SENT).delete()[0]
