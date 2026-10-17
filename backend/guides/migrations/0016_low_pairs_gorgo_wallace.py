"""Two pairs players use that the KvK evaluation did not count (Gether 17. 10. 2026: "tie dva marche môžeš pridať do
párov, ale nastav tam veľmi nízke bodovanie"): Gorgo + Heraclius and William Wallace + Alexander the Great, this order
only, 10 points of 100 (the lowest pair of the table had 8). A row already on the server – the superadmin may have
added it in Premenné – is left as it is."""

import unicodedata
from decimal import Decimal

from django.db import migrations

PAIRS = [
    ('Gorgo', 'Heraclius', 10),
    ('William Wallace', 'Alexander the Great', 10),
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
    dependencies = [('guides', '0015_two_formations_at_most')]

    operations = [migrations.RunPython(add, migrations.RunPython.noop)]
