"""Personal event reminders: players pick kingdom events and times on /ucet, the worker sends them a private Discord
message (bot) and/or a browser notification (web push).

Every tick the worker looks for reminders whose send time (start − offset) lies in (now − WINDOW, now]. Each one is
logged per channel in SentReminder before it goes out, so it is never sent twice – also after a failure (no retry
storms) or with a second worker running.
"""

import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from kingdom.events import LOCAL_TZ, occurrences
from kingdom.models import KingdomEvent

from . import discord_bot, push
from .models import EventReminder, Player, PushSubscription, SentReminder

log = logging.getLogger(__name__)

# a reminder the worker could not send within this time (it was down) is skipped
WINDOW = timedelta(minutes=10)
KEEP_SENT = timedelta(days=30)
GOLD = 0xF5C451
# the push service keeps an undelivered notification at least this long (phone offline for a moment)
MIN_TTL = timedelta(minutes=15)
Channel = SentReminder.Channel

TEXTS = {
    'sk': {
        'start': 'Začiatok: {start} ({relative})',
        'guide': 'Návod k eventu',
        'manage': 'Zmeniť pripomienky',
        'footer': 'KD 1035 · pripomienku si nastavil na webe v časti Môj účet',
        'soon': 'Začína o {time} · {clock}',
        'now': 'Začína teraz · {clock}',
        'days': ('deň', 'dni', 'dní'),
    },
    'cs': {
        'start': 'Začátek: {start} ({relative})',
        'guide': 'Návod k eventu',
        'manage': 'Změnit připomínky',
        'footer': 'KD 1035 · připomínku sis nastavil na webu v části Můj účet',
        'soon': 'Začíná za {time} · {clock}',
        'now': 'Začíná teď · {clock}',
        'days': ('den', 'dny', 'dní'),
    },
}


def texts(lang: str) -> dict:
    return TEXTS.get(lang, TEXTS['sk'])


def duration(minutes: int, lang: str) -> str:
    """10 → '10 min', 90 → '1 h 30 min', 2880 → '2 dni' (SK) / '2 dny' (CZ)."""
    days, rest = divmod(minutes, 24 * 60)
    if days and not rest:
        one, few, many = texts(lang)['days']
        return f'{days} {one if days == 1 else few if days < 5 else many}'
    hours, mins = divmod(minutes, 60)
    if not hours:
        return f'{mins} min'
    return f'{hours} h {mins} min' if mins else f'{hours} h'


def event_name(event: KingdomEvent, lang: str) -> str:
    return (event.name_cs if lang == 'cs' else '') or event.name_sk


def page_path(event: KingdomEvent, lang: str) -> str:
    """Where a notification leads: the event's guide, otherwise the account page with the reminders."""
    prefix = '/cz' if lang == 'cs' else ''
    guide = event.guide
    if guide and guide.is_published:
        return prefix + guide.get_absolute_url()
    return prefix + '/ucet'


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
        lines.append(f'[{t["manage"]}]({settings.SITE_URL}{"/cz" if lang == "cs" else ""}/ucet)')
    embed['description'] = '\n'.join(lines)
    return {'embeds': [embed]}


def push_payload(event: KingdomEvent, start, offset: int, lang: str, now) -> dict:
    """{title, body, url} for push-sw.js. All players are CZ/SK, so the clock is Bratislava time."""
    t = texts(lang)
    local = start.astimezone(LOCAL_TZ)
    clock = f'{local:%H:%M}'
    if local.date() != now.astimezone(LOCAL_TZ).date():
        clock = f'{local.day}. {local.month}. {clock}'
    body = t['soon'].format(time=duration(offset, lang), clock=clock) if offset else t['now'].format(clock=clock)
    return {'title': event_name(event, lang), 'body': body, 'url': page_path(event, lang)}


def due_starts(event: KingdomEvent, offset: int, now) -> list:
    """Starts whose send time (start − offset) lies in (now − WINDOW, now]."""
    delta, tick = timedelta(minutes=offset), timedelta(microseconds=1)
    return list(occurrences(event, now - WINDOW + delta + tick, now + delta + tick))


def send_personal_reminders(now=None) -> int:
    """Sends every due personal reminder on the player's channels. Returns how many messages were attempted.

    A channel without configuration (DISCORD_BOT_TOKEN, VAPID keys) is simply off.
    """
    now = now or timezone.now()
    bot_on, push_on = discord_bot.enabled(), push.enabled()
    if not (bot_on or push_on):
        return 0
    reminders = list(
        EventReminder.objects.filter(
            event__is_active=True, event__show_on_web=True, player__user__is_active=True
        ).select_related('player', 'event__guide')
    )
    devices = defaultdict(list)
    if push_on:
        for subscription in PushSubscription.objects.filter(player__in={r.player_id for r in reminders}):
            devices[subscription.player_id].append(subscription)
    # every reminder already handled has an occurrence after now − WINDOW
    done = set(
        SentReminder.objects.filter(occurrence__gt=now - WINDOW).values_list(
            'player_id', 'event_id', 'occurrence', 'offset', 'channel'
        )
    )
    starts = {}
    attempted = 0
    for reminder in reminders:
        player, event = reminder.player, reminder.event
        channels = [Channel.DISCORD] if bot_on and player.remind_discord else []
        if devices[player.pk]:
            channels.append(Channel.PUSH)
        for offset in reminder.offsets:
            if (event.pk, offset) not in starts:
                starts[event.pk, offset] = due_starts(event, offset, now)
            for start in starts[event.pk, offset]:
                for channel in channels:
                    if (player.pk, event.pk, start, offset, channel) not in done:
                        attempted += deliver(player, event, start, offset, channel, devices[player.pk], now)
    return attempted


def deliver(player: Player, event: KingdomEvent, start, offset: int, channel: str, devices: list, now) -> bool:
    """Claims the log row first (unique), then sends. Returns False when another worker already claimed it."""
    try:
        with transaction.atomic():
            row = SentReminder.objects.create(
                player=player, event=event, occurrence=start, offset=offset, channel=channel
            )
    except IntegrityError:
        return False
    if channel == Channel.DISCORD:
        try:
            discord_bot.send_dm(player.discord_id, discord_message(event, start, player.lang))
            row.ok = True
        except discord_bot.BotError as exc:
            row.error = str(exc)
    else:
        row.ok, row.error = send_push(devices, push_payload(event, start, offset, player.lang, now), start, now)
    row.error = row.error[:300]
    if row.error:
        # player and event IDs only – no tokens, no endpoints
        log.warning('Reminder %s/%s for player %s via %s: %s', event.pk, offset, player.pk, channel, row.error)
    row.save(update_fields=['ok', 'error'])
    return True


def send_push(devices: list, payload: dict, start, now) -> tuple[bool, str]:
    """Sends to every browser of the player. Withdrawn subscriptions (404/410) and ones that keep failing are
    deleted and removed from `devices`. Returns (delivered to at least one, errors)."""
    if not devices:  # all of them withdrawn earlier in this round
        return False, 'Žiadny prehliadač s notifikáciami.'
    ttl = int(max(start - now, MIN_TTL).total_seconds())
    delivered, errors = False, []
    for subscription in list(devices):
        try:
            push.send(subscription, payload, ttl)
        except push.PushError as exc:
            errors.append(str(exc))
            subscription.failures += 1
            if exc.gone or subscription.failures >= push.MAX_FAILURES:
                devices.remove(subscription)
                subscription.delete()
            else:
                subscription.save(update_fields=['failures'])
        else:
            delivered = True
            subscription.failures, subscription.last_used_at = 0, now
            subscription.save(update_fields=['failures', 'last_used_at'])
    return delivered, '; '.join(errors)


def prune_sent(now=None) -> int:
    """The log is only needed around the send time; older rows are personal data without a purpose."""
    now = now or timezone.now()
    deleted, _ = SentReminder.objects.filter(sent_at__lt=now - KEEP_SENT).delete()
    return deleted
