"""The commander pair table of the KvK evaluation (Gether 13. 10. 2026: in the database, not in the code; Slim: each
order of a pair scored on its own, a pair not in the table not evaluated). Read 13. 10. 2026:

- meta-rok.com/tierlist/field/ (all lists updated 17. 9. 2026) – the tier gives the band: Z 110–120, S 92–100,
  A 84–90, B 76–82, C 66–72;
- rokbattles.com Combat Lab rankings (DRASTC 0–10 from a year of open-field reports, refreshed 13. 10. 2026) – the
  order inside a band and both orders of a pair; pairs only there: ≥ 7.5 → 92, 6.5 → 84, 5.5 → 76, 4.5 → 66, 4 → 55,
  less → 45; without a score by its trade % (≥ 110 → 80 … < 45 → 45); a reversed order without a score: the listed
  points × its trade % / the listed order's trade %, at most 85 % of them;
- app.rokstats.online "Real battles" (fights and win rate per pair, both orders in one row) – which pairs are played;
- siege: Mr Siege's order in our guide (meta-rok has no siege pairs).

On a server where Premenné were saved with the old table (the spreadsheet's, in EvaluationSettings.data), a row
somebody changed or added there is kept as it was; the rest is this table. The rows leave the JSON."""

import unicodedata
from decimal import Decimal

from django.db import migrations

PAIRS = [
    # infantry
    ['Sun Tzu Prime', 'Liu Che', 114],
    ['Sun Tzu Prime', 'Bai Qi', 110],
    ['Sun Tzu Prime', 'Ivar the Boneless', 100],
    ['Bai Qi', 'Liu Che', 97],
    ['Sun Tzu Prime', 'William Wallace', 96],
    ['Bai Qi', 'Vercingetorix', 88],
    ['Bai Qi', 'Ivar the Boneless', 84],
    ['Liu Che', 'Philip II', 79],
    ['Scipio Africanus Prime', 'Ragnar Lodbrok Prime', 77],
    ['William Wallace', 'Liu Che', 76],
    ['Bai Qi', 'Philip II', 76],
    ['Liu Che', 'Vercingetorix', 76],
    ['Liu Che', 'Alexander the Great', 76],
    ['Bai Qi', 'Hector', 76],
    ['Sun Tzu Prime', 'Vercingetorix', 76],
    ['Liu Che', 'Bai Qi', 76],
    ['Scipio Africanus Prime', 'Liu Che', 72],
    ['Sun Tzu Prime', 'Hector', 72],
    ['Liu Che', 'Hector', 72],
    ['Liu Che', 'Ivar the Boneless', 72],
    ['Bai Qi', 'William Wallace', 66],
    ['Liu Che', 'William Wallace', 66],
    ['Sun Tzu Prime', 'Philip II', 66],
    ['Liu Che', 'Cheok Jun-gyeong', 66],
    ['Ragnar Lodbrok Prime', 'Scipio Africanus Prime', 55],
    ['Ragnar Lodbrok Prime', 'Philip II', 55],
    ['Sun Tzu Prime', 'Alexander the Great', 55],
    ['Bai Qi', 'Alexander the Great', 55],
    ['Liu Che', 'Scipio Africanus Prime', 46],
    ['Guan Yu', 'Scipio Africanus Prime', 45],
    ['Bai Qi', 'Sun Tzu Prime', 42],
    ['Liu Che', 'Sun Tzu Prime', 38],
    ['William Wallace', 'Bai Qi', 35],
    ['William Wallace', 'Sun Tzu Prime', 20],
    # cavalry
    ['Ivan IV', 'Achilles', 116],
    ['Arthur Pendragon', 'Ivan IV', 112],
    ['Gang Gamchan', 'Achilles', 99],
    ['Achilles', 'Gang Gamchan', 98],
    ['Ivan IV', 'William Marshal', 93],
    ['Ivan IV', 'Vercingetorix', 92],
    ['Achilles', 'Ivan IV', 92],
    ['Attila', 'Achilles', 90],
    ['Arthur Pendragon', 'Achilles', 89],
    ['Achilles', 'William Marshal', 88],
    ['Arthur Pendragon', 'Hector', 87],
    ['Huo Qubing', 'Arthur Pendragon', 84],
    ['Arthur Pendragon', 'Vercingetorix', 84],
    ['Ivan IV', 'Hector', 84],
    ['Gang Gamchan', 'Ivan IV', 84],
    ['Joan of Arc Prime', 'Arthur Pendragon', 82],
    ['Arthur Pendragon', 'Philip II', 78],
    ['Arthur Pendragon', 'Gang Gamchan', 76],
    ['Attila', 'William Marshal', 76],
    ['Gang Gamchan', 'William Marshal', 76],
    ['Achilles', 'Hector', 76],
    ['Achilles', 'David IV', 76],
    ['Achilles', 'Philip II', 72],
    ['Huo Qubing', 'Joan of Arc Prime', 70],
    ['Arthur Pendragon', 'William I', 66],
    ['Huo Qubing', 'Belisarius Prime', 66],
    ['Arthur Pendragon', 'David IV', 66],
    ['Gang Gamchan', 'Hector', 66],
    ['Joan of Arc Prime', 'Huo Qubing', 60],
    ['Achilles', 'Arthur Pendragon', 58],
    ['Ivan IV', 'Arthur Pendragon', 58],
    ['Attila', 'David IV', 55],
    ['Alexander Nevsky', 'William I', 55],
    ['Alexander Nevsky', 'Belisarius Prime', 55],
    ['Achilles', 'Attila', 53],
    ['Ivan IV', 'Gang Gamchan', 48],
    ['Huo Qubing', 'Alexander Nevsky', 45],
    ['Alexander Nevsky', 'Joan of Arc Prime', 45],
    ['Alexander Nevsky', 'Arthur Pendragon', 45],
    ['Gang Gamchan', 'David IV', 45],
    ['Arthur Pendragon', 'Huo Qubing', 41],
    ['Arthur Pendragon', 'Joan of Arc Prime', 33],
    ['Gang Gamchan', 'Arthur Pendragon', 31],
    # archer
    ['Qin Shi Huang', 'Yi Seong-Gye', 120],
    ['Qin Shi Huang', 'Zhuge Liang', 118],
    ['Hermann Prime', 'Alp Arslan', 95],
    ['Alp Arslan', 'Hermann Prime', 94],
    ['Qin Shi Huang', 'Shajar al-Durr', 92],
    ['Alp Arslan', 'Yi Seong-Gye', 86],
    ['Hermann Prime', 'Zhuge Liang', 86],
    ['Zhuge Liang', 'Hermann Prime', 85],
    ['Alp Arslan', 'Zhuge Liang', 81],
    ['Zhuge Liang', 'Philip II', 80],
    ['Qin Shi Huang', 'Alp Arslan', 80],
    ['Qin Shi Huang', 'Hermann Prime', 80],
    ['Qin Shi Huang', 'Ashurbanipal', 80],
    ['Qin Shi Huang', 'Philip II', 72],
    ['Shajar al-Durr', 'Alp Arslan', 68],
    ['Zhuge Liang', 'Ashurbanipal', 66],
    ['Hermann Prime', 'Ashurbanipal', 66],
    ['Alp Arslan', 'Shajar al-Durr', 66],
    ['Shajar al-Durr', 'Yi Seong-Gye', 66],
    ['Alp Arslan', 'Ashurbanipal', 66],
    ['Alp Arslan', 'Philip II', 66],
    ['Philip II', 'Zhuge Liang', 65],
    ['Qin Shi Huang', 'Hector', 55],
    ['Hermann Prime', 'Yi Seong-Gye', 55],
    ['Ashurbanipal', 'Hermann Prime', 47],
    ['Boudica Prime', 'Yi Seong-Gye', 45],
    ['Ashurbanipal', 'Zhuge Liang', 40],
    ['Zhuge Liang', 'Qin Shi Huang', 13],
    ['Yi Seong-Gye', 'Qin Shi Huang', 8],
    # siege
    ['Gajah Mada', 'Gonzalo de Cordoba', 92],
    ['Gonzalo de Cordoba', 'Gajah Mada', 92],
    ['Afonso de Albuquerque', 'Elizabeth I', 80],
    ['Elizabeth I', 'John Hunyadi', 78],
    ['Elizabeth I', 'Babur', 78],
    ['John Hunyadi', 'Stephen III', 76],
    ['Margaret I', 'Gonzalo de Cordoba', 76],
    ['Margaret I', 'Babur', 74],
    ['Elizabeth I', 'Afonso de Albuquerque', 68],
    ['Gonzalo de Cordoba', 'Margaret I', 56],
    # outdated, in no current source – from the spreadsheet
    ['Yi Seong-Gye', 'Aethelflaed', 33],
    ['Minamoto', 'Saladin', 30],
]

# the spreadsheet's table the page had in its code until now (frontend settings.ts DEFAULT_PAIRS, v1.25.0–1.25.2)
OLD_DEFAULTS = [
    ['Qin Shi Huang', 'Zhuge Liang', 120],
    ['Qin Shi Huang', 'Yi Seong-Gye', 117],
    ['Sun Tzu Prime', 'Bai Qi', 110],
    ['Sun Tzu Prime', 'Liu Che', 110],
    ['Arthur Pendragon', 'Achilles', 100],
    ['Sun Tzu Prime', 'William Wallace', 95],
    ['Alp Arslan', 'Hermann Prime', 95],
    ['Sun Tzu Prime', 'Ivar the Boneless', 95],
    ['Attila', 'Achilles', 92],
    ['Hermann Prime', 'Alp Arslan', 92],
    ['Bai Qi', 'Liu Che', 92],
    ['Achilles', 'Gang Gamchan', 92],
    ['Gang Gamchan', 'Achilles', 92],
    ['William Wallace', 'Bai Qi', 88],
    ['Bai Qi', 'Ivar the Boneless', 88],
    ['Gajah Mada', 'Gonzalo de Cordoba', 84],
    ['Bai Qi', 'William Wallace', 84],
    ['Hermann Prime', 'Zhuge Liang', 84],
    ['Arthur Pendragon', 'David IV', 84],
    ['Arthur Pendragon', 'Gang Gamchan', 84],
    ['Huo Qubing', 'Arthur Pendragon', 84],
    ['Alp Arslan', 'Yi Seong-Gye', 84],
    ['Arthur Pendragon', 'Hector', 84],
    ['Philip II', 'Zhuge Liang', 84],
    ['Ragnar Lodbrok Prime', 'Scipio Africanus Prime', 84],
    ['Alp Arslan', 'Zhuge Liang', 84],
    ['Bai Qi', 'Vercingetorix', 84],
    ['Scipio Africanus Prime', 'Ragnar Lodbrok Prime', 80],
    ['Zhuge Liang', 'Hermann Prime', 80],
    ['Attila', 'David IV', 80],
    ['Alp Arslan', 'Philip II', 80],
    ['Liu Che', 'Vercingetorix', 80],
    ['Joan of Arc Prime', 'Arthur Pendragon', 78],
    ['Arthur Pendragon', 'Philip II', 78],
    ['Liu Che', 'Philip II', 78],
    ['Qin Shi Huang', 'Shajar al-Durr', 78],
    ['Qin Shi Huang', 'Alp Arslan', 78],
    ['Zhuge Liang', 'Philip II', 78],
    ['Margaret I', 'Gonzalo de Cordoba', 78],
    ['Bai Qi', 'Philip II', 78],
    ['William Wallace', 'Liu Che', 78],
    ['Scipio Africanus Prime', 'Liu Che', 78],
    ['Liu Che', 'William Wallace', 78],
    ['Shajar al-Durr', 'Alp Arslan', 72],
    ['Zhuge Liang', 'Ashurbanipal', 70],
    ['Ragnar Lodbrok Prime', 'Philip II', 70],
    ['Huo Qubing', 'Joan of Arc Prime', 70],
    ['Huo Qubing', 'Belisarius Prime', 70],
    ['Liu Che', 'Cheok Jun-gyeong', 66],
    ['Liu Che', 'Alexander the Great', 66],
    ['Cheok Jun-gyeong', 'Liu Che', 66],
    ['Alexander Nevsky', 'Joan of Arc Prime', 66],
    ['Alexander Nevsky', 'Belisarius Prime', 66],
    ['Bai Qi', 'Alexander the Great', 60],
    ['Philip II', 'Tariq ibn Ziyad', 60],
    ['Guan Yu', 'Scipio Africanus Prime', 55],
    ['Alexander Nevsky', 'William I', 55],
    ['Boudica Prime', 'Yi Seong-Gye', 55],
    ['Yi Seong-Gye', 'Aethelflaed', 33],
    ['Minamoto', 'Saladin', 30],
    ['Minamoto', 'Cao Cao', 25],
    ['Richard', 'Charles Martel', 15],
    ['Aethelflaed', 'Cao Cao', 7],
    ['Aethelflaed', 'Joan of Arc', 5],
]


def fold(name):
    # without diacritics and case, like the page compares names
    return unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().casefold().strip()


def key(primary, secondary):
    return (fold(primary), fold(secondary))


def seed(apps, schema_editor):
    CommanderPair = apps.get_model('guides', 'CommanderPair')
    EvaluationSettings = apps.get_model('accounts', 'EvaluationSettings')
    old = {key(p, s): n for p, s, n in OLD_DEFAULTS}
    rows = {}
    for row in EvaluationSettings.objects.all():
        data = row.data if isinstance(row.data, dict) else {}
        pairs = data.get('pairs')
        saved = pairs.pop('rows', None) if isinstance(pairs, dict) else None
        if saved is None:
            continue
        # a row changed or added on the page is kept, the spreadsheet's rows give way to the new table
        for item in saved if isinstance(saved, list) else []:
            if not (isinstance(item, list) and len(item) == 3):
                continue
            primary, secondary, points = item
            if not (isinstance(primary, str) and isinstance(secondary, str) and primary.strip() and secondary.strip()):
                continue
            if isinstance(points, bool) or not isinstance(points, (int, float)) or not 0 <= points <= 500:
                continue
            k = key(primary, secondary)
            if k[0] == k[1] or old.get(k) == points:
                continue
            rows.setdefault(k, (primary.strip(), secondary.strip(), points))
        row.data = data
        row.save(update_fields=['data'])
    for primary, secondary, points in PAIRS:
        rows.setdefault(key(primary, secondary), (primary, secondary, points))
    existing = {key(p.primary, p.secondary) for p in CommanderPair.objects.all()}
    CommanderPair.objects.bulk_create(
        CommanderPair(primary=p, secondary=s, points=Decimal(str(round(n, 1))))
        for k, (p, s, n) in rows.items()
        if k not in existing
    )


class Migration(migrations.Migration):
    dependencies = [
        ('guides', '0011_commander_pair'),
        ('accounts', '0028_player_evaluator'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
