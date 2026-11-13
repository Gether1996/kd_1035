"""Times in Discord messages written out in Slovak or Czech (Gether 13. 11. 2026: "nech správy chodia v SK alebo CZ
podľa nastavenia užívateľa, Discord oznámenia do kanála len v SK").

Discord's own <t:…> timestamps are drawn in the language of each reader's Discord app – an English app showed
"Friday, November 13, 2026 8:00 PM (in 11 hours)" in an otherwise Slovak message. So the bot writes the time itself:
in the kingdom's time zone (every player is Slovak or Czech) and with how long until it, counted when the message
goes out.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

# the same as events.LOCAL_TZ (events imports this module)
LOCAL_TZ = ZoneInfo('Europe/Bratislava')

WEEKDAYS = {
    'sk': ('pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'),
    'cs': ('pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'),
}
# the day of the month takes the genitive: "13. novembra", "13. listopadu"
MONTHS = {
    'sk': (
        'januára', 'februára', 'marca', 'apríla', 'mája', 'júna',
        'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra',
    ),
    'cs': (
        'ledna', 'února', 'března', 'dubna', 'května', 'června',
        'července', 'srpna', 'září', 'října', 'listopadu', 'prosince',
    ),
}
AT = {'sk': 'o', 'cs': 'v'}
# "o 11 h" / "za 11 h"; under a minute (or already started) "teraz" / "teď"
IN = {'sk': 'o {span}', 'cs': 'za {span}'}
NOW = {'sk': 'teraz', 'cs': 'teď'}
DAYS = {'sk': ('deň', 'dni', 'dní'), 'cs': ('den', 'dny', 'dní')}


def lang_of(lang: str) -> str:
    return 'cs' if lang == 'cs' else 'sk'


def clock(moment: datetime) -> str:
    """'20:00' in the kingdom's time"""
    return moment.astimezone(LOCAL_TZ).strftime('%H:%M')


def when(moment: datetime, lang: str = 'sk') -> str:
    """'piatok 13. novembra 2026 o 20:00' / 'pátek 13. listopadu 2026 v 20:00'"""
    lang = lang_of(lang)
    local = moment.astimezone(LOCAL_TZ)
    weekday = WEEKDAYS[lang][local.weekday()]
    month = MONTHS[lang][local.month - 1]
    return f'{weekday} {local.day}. {month} {local.year} {AT[lang]} {clock(local)}'


def span(minutes: int, lang: str = 'sk') -> str:
    """'45 min', '1 h 30 min', '11 h', '1 deň 6 h', '2 dni' – from a day on without the minutes"""
    days, rest = divmod(minutes, 24 * 60)
    hours, mins = divmod(rest, 60)
    if days:
        mins = 0
    one, few, many = DAYS[lang_of(lang)]
    parts = [f'{days} {one if days == 1 else few if days < 5 else many}'] if days else []
    parts += [f'{hours} h'] if hours else []
    parts += [f'{mins} min'] if mins else []
    return ' '.join(parts)


def until(moment: datetime, now: datetime, lang: str = 'sk') -> str:
    """'o 11 h' / 'za 11 h' – how long from `now` (when the message goes out) until `moment`"""
    lang = lang_of(lang)
    minutes = round((moment - now).total_seconds() / 60)
    if minutes < 1:
        return NOW[lang]
    return IN[lang].format(span=span(minutes, lang))
