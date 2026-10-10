"""Personal event reminders: players pick kingdom events and times on /pripomienky, the worker sends them a private
Discord message from the bot – the only channel (web push was dropped on 9. 10. 2026).

Every tick the worker looks for reminders whose send time (start − offset) lies in (now − WINDOW, now]. Each one is
logged in SentReminder before it goes out, so it is never sent twice – also after a failure (no retry storms) or with
a second worker running.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from kingdom.events import longest_lead, occurrences, send_time
from kingdom.models import KingdomEvent

from . import discord_bot
from .models import EventReminder, Player, SentReminder

log = logging.getLogger(__name__)

# a reminder the worker could not send within this time (it was down) is skipped
WINDOW = timedelta(minutes=10)
KEEP_SENT = timedelta(days=30)
GOLD = 0xF5C451
# where players pick their events and times (SK path, /cz prefix for Czech)
REMINDERS_PAGE = '/pripomienky'

TEXTS = {
    'sk': {
        'start': 'Začiatok: {start} ({relative})',
        'guide': 'Návod k eventu',
        'manage': 'Zmeniť pripomienky',
        'footer': 'KD 1035 · pripomienku si nastavil na webe v časti Pripomienky eventov',
        'days': ('deň', 'dni', 'dní'),
        # "Poslať skúšobnú správu" on /pripomienky
        'test_title': 'Skúšobná správa',
        'test_text': 'Pripomienky ti budú chodiť sem.',
    },
    'cs': {
        'start': 'Začátek: {start} ({relative})',
        'guide': 'Návod k eventu',
        'manage': 'Změnit připomínky',
        'footer': 'KD 1035 · připomínku sis nastavil na webu v části Připomínky eventů',
        'days': ('den', 'dny', 'dní'),
        'test_title': 'Zkušební zpráva',
        'test_text': 'Připomínky ti budou chodit sem.',
    },
}


class DiscordPaused(Exception):
    """Discord rate limits or is down: the reminder was released for the next tick, Discord waits until then."""


def texts(lang: str) -> dict:
    return TEXTS.get(lang, TEXTS['sk'])


def duration(minutes: int, lang: str) -> str:
    """Days, hours and minutes without the zero parts: 10 → '10 min', 90 → '1 h 30 min', 1800 → '1 deň 6 h',
    2880 → '2 dni' (SK) / '2 dny' (CZ). Same as reminderLabel() on the web."""
    days, rest = divmod(minutes, 24 * 60)
    hours, mins = divmod(rest, 60)
    one, few, many = texts(lang)['days']
    parts = [f'{days} {one if days == 1 else few if days < 5 else many}'] if days else []
    parts += [f'{hours} h'] if hours else []
    parts += [f'{mins} min'] if mins or not parts else []
    return ' '.join(parts)


def event_name(event: KingdomEvent, lang: str) -> str:
    return (event.name_cs if lang == 'cs' else '') or event.name_sk


def page_path(event: KingdomEvent, lang: str) -> str:
    """Where a reminder leads: the event's guide, otherwise the reminders page."""
    prefix = '/cz' if lang == 'cs' else ''
    guide = event.guide
    if guide and guide.is_published:
        return prefix + guide.get_absolute_url()
    return prefix + REMINDERS_PAGE


def discord_message(event: KingdomEvent, start, lang: str) -> dict:
    """An embed like the channel reminders; <t:…> shows every player the time in their own time zone."""
    t = texts(lang)
    unix = int(start.timestamp())
    lines = [t['start'].format(start=f'<t:{unix}:F>', relative=f'<t:{unix}:R>')]
    embed = {'title': event_name(event, lang)[:256], 'color': GOLD, 'footer': {'text': t['footer']}}
    if settings.SITE_URL:
        guide = event.guide
        if guide and guide.is_published:
            embed['url'] = settings.SITE_URL + page_path(event, lang)
            lines.append(f'[{t["guide"]}]({embed["url"]})')
        lines.append(f'[{t["manage"]}]({settings.SITE_URL}{"/cz" if lang == "cs" else ""}{REMINDERS_PAGE})')
    embed['description'] = '\n'.join(lines)
    return {'embeds': [embed]}


def test_message(lang: str) -> dict:
    """The test DM from /pripomienky: proves the bot can reach the player, looks like a real reminder."""
    t = texts(lang)
    lines = [t['test_text']]
    if settings.SITE_URL:
        lines.append(f'[{t["manage"]}]({settings.SITE_URL}{"/cz" if lang == "cs" else ""}{REMINDERS_PAGE})')
    embed = {'title': t['test_title'], 'description': '\n'.join(lines), 'color': GOLD, 'footer': {'text': t['footer']}}
    return {'embeds': [embed]}


def due_starts(event: KingdomEvent, offset: int, now) -> list:
    """Starts whose send time (send_time: start − offset, or the evening before) lies in (now − WINDOW, now]."""
    tick = timedelta(microseconds=1)
    candidates = occurrences(event, now - WINDOW + tick, now + longest_lead(offset) + tick)
    return [start for start in candidates if now - WINDOW < send_time(start, offset) <= now]


def send_personal_reminders(now=None) -> int:
    """Sends every due personal reminder as a Discord DM. Returns how many messages were attempted.

    Without DISCORD_BOT_TOKEN the channel is off and nothing is sent.
    """
    now = now or timezone.now()
    if not discord_bot.enabled():
        return 0
    reminders = EventReminder.objects.filter(
        event__is_active=True, event__show_on_web=True, player__user__is_active=True, player__remind_discord=True
    ).select_related('player', 'event__guide')
    # every reminder already handled has an occurrence after now − WINDOW
    done = set(
        SentReminder.objects.filter(occurrence__gt=now - WINDOW, channel=SentReminder.Channel.DISCORD).values_list(
            'player_id', 'event_id', 'occurrence', 'offset'
        )
    )
    starts = {}
    attempted = 0
    for reminder in reminders:
        player, event = reminder.player, reminder.event
        for offset in reminder.offsets:
            if (event.pk, offset) not in starts:
                starts[event.pk, offset] = due_starts(event, offset, now)
            for start in starts[event.pk, offset]:
                if (player.pk, event.pk, start, offset) not in done:
                    try:
                        attempted += deliver(player, event, start, offset)
                    except DiscordPaused:
                        # the rest waits for the next tick (still inside WINDOW)
                        return attempted
    return attempted


def deliver(player: Player, event: KingdomEvent, start, offset: int) -> bool:
    """Claims the log row first (unique), then sends. Returns False when another worker already claimed it.

    Raises DiscordPaused when Discord is rate limiting or down: the row is released, so the next tick (still inside
    WINDOW) sends the reminder a little later instead of never.
    """
    try:
        with transaction.atomic():
            row = SentReminder.objects.create(
                player=player, event=event, occurrence=start, offset=offset, channel=SentReminder.Channel.DISCORD
            )
    except IntegrityError:
        return False
    try:
        discord_bot.send_dm(player.discord_id, discord_message(event, start, player.lang))
        row.ok = True
    except discord_bot.BotError as exc:
        if exc.temporary:
            row.delete()
            log.warning('Discord unavailable, reminders wait for the next tick: %s', exc)
            raise DiscordPaused from exc
        row.error = str(exc)
    except Exception:  # one broken reminder must not stop the round for the other players
        log.exception('Reminder %s/%s for player %s failed', event.pk, offset, player.pk)
        row.error = 'Neočakávaná chyba, pozri log workera.'
    row.error = row.error[:300]
    if row.error:
        # player and event IDs only – no tokens
        log.warning('Reminder %s/%s for player %s: %s', event.pk, offset, player.pk, row.error)
    row.save(update_fields=['ok', 'error'])
    return True


def prune_sent(now=None) -> int:
    """Personal data without a purpose (daily): the send log older than KEEP_SENT and the players' choices for events
    that will not take place again (a one-off that is over, a series past its end date). Irregular events keep them –
    the next date reminds the same players."""
    now = now or timezone.now()
    deleted, _ = SentReminder.objects.filter(sent_at__lt=now - KEEP_SENT).delete()
    finished = [
        event.pk
        for event in KingdomEvent.objects.filter(subscriptions__isnull=False, irregular=False).distinct()
        if next(occurrences(event, now), None) is None
    ]
    if finished:
        deleted += EventReminder.objects.filter(event__in=finished).delete()[0]
    return deleted
