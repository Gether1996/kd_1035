"""Two more pairs players use that the KvK evaluation did not count (Gether 27. 10. 2026: "pridaj tam tie dva páry"):
Stephen III + Gonzalo de Cordoba and Shapur I + Ashurbanipal, this order only, 10 points of 100 like the last ones
added (0016 – "veľmi nízke bodovanie"); the superadmin changes them in Premenné. A row already on the server is left
as it is."""

import unicodedata
from decimal import Decimal

from django.db import migrations

PAIRS = [
    ('Stephen III', 'Gonzalo de Cordoba', 10),
    ('Shapur I', 'Ashurbanipal', 10),
]


def fold(name):
    # without diacritics and case, like the page compares names (0012_commander_pairs)
    return unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().casefold().strip()


def add(apps, schema_editor):
    CommanderPair = apps.get_model('guides', 'CommanderPair')
    existing = {(fold(p.primary), fold(p.secondary)) for p in CommanderPair.objects.all()}
    CommanderPair.objects.bulk_create(
        CommanderPair(primary=p, secondary=s, points=Decimal(n))
        for p, s, n in PAIRS
        if (fold(p), fold(s)) not in existing
    )


class Migration(migrations.Migration):
    dependencies = [('guides', '0016_low_pairs_gorgo_wallace')]

    operations = [migrations.RunPython(add, migrations.RunPython.noop)]
