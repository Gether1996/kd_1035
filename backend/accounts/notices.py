"""Discord DMs about the marches the KvK evaluation does not like (Gether 14. 10. 2026: "button na hromadné
odoslanie discord správy pre užívateľa, ktorý má nejakú chybu … kde je chyba a čo by asi mal zmeniť, s linkom").

Only what /marche shows the player in red (pair_check.march_checker): a pair without a secondary commander, a pair the
evaluation does not score (and, when it does, the other order – never the points or other partners, Gether: "nie,
len čo je zlé") and a formation the primary commander should not lead with. The superadmin sees a preview of every
player with such a march and the exact message, unticks whom they like and queues the rest; the worker sends PER_TICK a
tick, checking the marches again right before (fixed meanwhile = not sent, changed = the message as it is now).

A player who switched the bot's messages off (Player.remind_discord) gets nothing. The same problems are not queued
twice while a message waits, and the preview marks players already told about exactly these problems. Rows are kept
KEEP days (the privacy page says so).
"""

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from guides.armory import armory

from . import discord_bot
from .models import MarchNotice, Player
from .pair_check import march_checker
from .reminders import GOLD, DiscordPaused

log = logging.getLogger(__name__)

PER_TICK = 5
KEEP = timedelta(days=30)
# a claimed message the worker never finished (it stopped mid-send) – marked failed, never sent twice
STUCK = timedelta(minutes=10)
# the overview of the own marches, where the player fixes them
MARCHES_PAGE = '/marche?tab=prehlad'
# one preview or one queue: more than the kingdom has players
MAX_PLAYERS = 500

TEXTS = {
    'sk': {
        'title': 'Skontroluj svoje marche',
        'intro': 'Ahoj {name}, pri tvojich marchoch na webe je niečo, čo vo vyhodnocovaní KvK nesedí:',
        'march': '{n}. march',
        'solo': 'Chýba sekundárny commander – bez neho sa march vo vyhodnocovaní KvK nepočíta.',
        'swap': 'V tomto poradí sa pár nehodnotí – prehoď commanderov: {primary} + {secondary}.',
        'unknown': 'Tento pár sa vo vyhodnocovaní KvK nehodnotí – vyber iný pár.',
        'formation': 'Formácia {have}: {primary} má viesť {want}. Inscriptions sa viažu na formáciu – po zmene ich '
        'naklikaj znova.',
        'or': ' alebo ',
        'link': 'Opraviť v Prehľade marchov',
        'footer': 'KD 1035 · upozornenie od správcu webu',
        'blocked': 'Hráč nemá povolené súkromné správy alebo nie je na Discord serveri s botom.',
        'stuck': 'Odosielanie sa nedokončilo – skús znova.',
        'kinds': {
            'infantry': 'pechota',
            'cavalry': 'jazda',
            'archer': 'lukostrelci',
            'leadership': 'leadership',
            'engineering': 'siege',
            'garrison': 'garrison',
            'conquering': 'rally',
        },
    },
    'cs': {
        'title': 'Zkontroluj své marche',
        'intro': 'Ahoj {name}, u tvých marchů na webu je něco, co ve vyhodnocování KvK nesedí:',
        'march': '{n}. march',
        'solo': 'Chybí sekundární commander – bez něj se march ve vyhodnocování KvK nepočítá.',
        'swap': 'V tomto pořadí se pár nehodnotí – prohoď commandery: {primary} + {secondary}.',
        'unknown': 'Tento pár se ve vyhodnocování KvK nehodnotí – vyber jiný pár.',
        'formation': 'Formace {have}: {primary} má vést {want}. Inscriptions se vážou na formaci – po změně je '
        'naklikej znovu.',
        'or': ' nebo ',
        'link': 'Opravit v Přehledu marchů',
        'footer': 'KD 1035 · upozornění od správce webu',
        'blocked': 'Hráč nemá povolené soukromé zprávy nebo není na Discord serveru s botem.',
        'stuck': 'Odesílání se nedokončilo – zkus znovu.',
        'kinds': {
            'infantry': 'pěchota',
            'cavalry': 'jízda',
            'archer': 'lučištníci',
            'leadership': 'leadership',
            'engineering': 'siege',
            'garrison': 'garrison',
            'conquering': 'rally',
        },
    },
}


def texts(lang: str) -> dict:
    return TEXTS.get(lang, TEXTS['sk'])


def plain(text: str) -> str:
    """A name shown as written – Discord markdown characters escaped (like newcomers.plain)."""
    return re.sub(r'([\\*_~`|>#\[\]()<@:-])', r'\\\1', text)


def formation_name(formation_id: str) -> str:
    names = {f['id']: f['name'] for f in armory()['formations']}
    return names.get(formation_id, formation_id)


def problems_of(player: Player, check) -> list[dict]:
    """The player's marches with a red border on /marche (marchHasProblem in core/kvk-api.ts), in their order"""
    found = []
    for march in sorted(player.marches.all(), key=lambda m: (m.position, m.pk)):
        result = check(march)
        if result['pair_problem'] or result['formation_problem']:
            found.append(
                {
                    'id': march.pk,
                    'position': march.position,
                    'kind': march.kind,
                    'primary': march.primary,
                    'secondary': march.secondary,
                    'formation': march.formation,
                    **result,
                }
            )
    return found


def fingerprint(problems: list[dict]) -> str:
    """What exactly is wrong – another pair with the same kind of problem is a new one to tell"""
    keys = ('id', 'kind', 'primary', 'secondary', 'formation', 'pair_problem', 'formation_problem')
    data = [[p[k] if k != 'formation_problem' else sorted(p[k] or []) for k in keys] for p in problems]
    return hashlib.sha1(json.dumps(data, ensure_ascii=False).encode()).hexdigest()


def lines(player: Player, problems: list[dict], markdown: bool = True) -> list[str]:
    """The message: a line per march and what to do about it; markdown off = the plain text of the preview"""
    t = texts(player.lang)
    name = (lambda s: plain(s)) if markdown else (lambda s: s)
    bold = (lambda s: f'**{s}**') if markdown else (lambda s: s)
    out = [t['intro'].replace('{name}', name(player.ingame_name or player.name))]
    for p in problems:
        pair = ' + '.join(name(c) for c in (p['primary'], p['secondary']) if c)
        kind = t['kinds'].get(p['kind'], p['kind'])
        out.append('')
        out.append(f'{bold(t["march"].replace("{n}", str(p["position"])))} · {kind} · {pair}')
        if p['pair_problem'] == 'solo':
            out.append(f'• {t["solo"]}')
        elif p['pair_problem'] == 'unknown':
            if (p['pair_hint'] or {}).get('swap'):
                swap = t['swap'].replace('{primary}', name(p['secondary'])).replace('{secondary}', name(p['primary']))
                out.append(f'• {swap}')
            else:
                out.append(f'• {t["unknown"]}')
        if p['formation_problem']:
            want = t['or'].join(formation_name(f) for f in p['formation_problem'])
            out.append(
                '• '
                + t['formation']
                .replace('{have}', formation_name(p['formation']))
                .replace('{primary}', name(p['primary']))
                .replace('{want}', want)
            )
    return out


def page_url(lang: str) -> str:
    return f'{settings.SITE_URL}{"/cz" if lang == "cs" else ""}{MARCHES_PAGE}'


def message(player: Player, problems: list[dict]) -> dict:
    t = texts(player.lang)
    body = lines(player, problems)
    if settings.SITE_URL:
        body += ['', f'[{t["link"]}]({page_url(player.lang)})']
    embed = {
        'title': t['title'],
        'description': '\n'.join(body)[:4000],
        'color': GOLD,
        'footer': {'text': t['footer']},
    }
    if settings.SITE_URL:
        embed['url'] = page_url(player.lang)
    return {'embeds': [embed]}


def players_with_problems() -> list[tuple[Player, list[dict]]]:
    check = march_checker()
    players = (
        Player.objects.filter(user__is_active=True, marches__isnull=False)
        .distinct()
        .prefetch_related('marches')
        .order_by('ingame_name', 'global_name', 'username')
    )
    found = [(p, problems_of(p, check)) for p in players]
    return [(p, problems) for p, problems in found if problems][:MAX_PLAYERS]


def preview() -> list[dict]:
    """GET /api/marches/notices/: every player with a red march, the message, whether the bot may write to them and
    what happened to the last one"""
    rows = []
    for player, problems in players_with_problems():
        current = fingerprint(problems)
        last = player.march_notices.order_by('-created_at').first()
        told = player.march_notices.filter(fingerprint=current, state=MarchNotice.State.SENT).order_by('-sent_at').first()
        rows.append(
            {
                'id': player.pk,
                'name': player.name,
                'ingame_name': player.ingame_name,
                'avatar_url': player.avatar_url,
                'marches': len(problems),
                'text': '\n'.join(lines(player, problems, markdown=False)),
                # the player switched the bot's messages off
                'muted': not player.remind_discord,
                # without Discord: the bot cannot write, the player sees the red marches on /marche
                'local': player.local,
                'told_at': told.sent_at.isoformat() if told and told.sent_at else None,
                'last': (
                    {
                        'state': last.state,
                        'at': (last.sent_at or last.created_at).isoformat(),
                        'error': last.error,
                    }
                    if last
                    else None
                ),
            }
        )
    return sorted(rows, key=lambda r: (r['ingame_name'] or r['name']).casefold())


def queue(ids: list[int], by) -> int:
    """The players picked in the preview, checked again: still a red march, the bot may write to them and no message
    of theirs is waiting. Returns how many were queued."""
    wanted = set(ids)
    queued = 0
    with transaction.atomic():
        for player, problems in players_with_problems():
            if player.pk not in wanted or not player.remind_discord:
                continue
            if player.march_notices.filter(state=MarchNotice.State.PENDING).exists():
                continue
            MarchNotice.objects.create(
                player=player,
                fingerprint=fingerprint(problems),
                text='\n'.join(lines(player, problems, markdown=False)),
                created_by=by,
            )
            queued += 1
    log.info('March notices queued: %s', queued)
    return queued


def send_march_notices(now: datetime | None = None) -> int:
    """The worker: the waiting messages, PER_TICK a tick. Each is claimed in one UPDATE first (a second worker never
    sends it too); the marches are checked again – fixed meanwhile = skipped, else the message as they are now.
    Discord rate limiting or down: the claim is released and DiscordPaused stops the round. Returns how many were
    sent."""
    now = now or timezone.now()
    MarchNotice.objects.filter(created_at__lt=now - KEEP).delete()
    for stuck in MarchNotice.objects.filter(state=MarchNotice.State.PENDING, claimed_at__lt=now - STUCK):
        stuck.state, stuck.error = MarchNotice.State.FAILED, texts('sk')['stuck']
        stuck.save(update_fields=['state', 'error'])
    if not discord_bot.enabled():
        return 0
    sent = 0
    check = march_checker()
    waiting = MarchNotice.objects.filter(state=MarchNotice.State.PENDING, claimed_at__isnull=True).order_by('created_at')
    for notice in waiting.select_related('player')[:PER_TICK]:
        if not MarchNotice.objects.filter(pk=notice.pk, claimed_at__isnull=True).update(claimed_at=now):
            continue  # another worker took it
        player = notice.player
        problems = problems_of(player, check)
        if not problems or not player.remind_discord:
            notice.state = MarchNotice.State.SKIPPED
            notice.save(update_fields=['state'])
            continue
        notice.fingerprint = fingerprint(problems)
        notice.text = '\n'.join(lines(player, problems, markdown=False))
        try:
            discord_bot.send_dm(player.discord_id, message(player, problems))
        except discord_bot.BotError as exc:
            if exc.temporary and exc.answered:
                MarchNotice.objects.filter(pk=notice.pk).update(claimed_at=None)
                log.warning('Discord unavailable, the march notice waits for the next tick: %s', exc)
                raise DiscordPaused from exc
            notice.state = MarchNotice.State.FAILED
            notice.error = (texts('sk')['blocked'] if exc.blocked else str(exc))[:200]
            notice.save(update_fields=['state', 'error', 'fingerprint', 'text'])
            log.warning('March notice %s not sent: %s', notice.pk, exc)
            continue
        notice.state, notice.sent_at = MarchNotice.State.SENT, timezone.now()
        notice.save(update_fields=['state', 'sent_at', 'fingerprint', 'text'])
        sent += 1
    return sent
