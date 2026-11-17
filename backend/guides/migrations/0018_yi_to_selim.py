"""The new infantry commanders Yi To and Selim I in the KvK evaluation (Gether 17. 11. 2026: "pridaj ich na web do všetkých
výberov … odporúčané inf páry"). Without these rows a march led by Yi To would read "this pair is not evaluated".

Points by WarDaddyChadski's tests (Yi Do Results, 17. 11. 2026, 5v5 and 10v10 in Ark): Sun Tzu Prime + Yi To is the
best single infantry march – above Sun Tzu Prime + Liu Che (114); Yi To + Liu Che hits about as hard as Sun Tzu Prime +
Bai Qi (110); Bai Qi + Yi To about as hard as Sun Tzu + Liu Che – kept at 110 until there are report numbers. Selim I is
a garrison commander, not a field pair, so he gets no pair. Formations: Pincer 2.0 for both (Yi To Arch 2.0 too – he
boosts normal damage; Chadski 19. 10. and 1. 11. 2026). The superadmin changes all of it in Premenné; a row already on
the server is left as it is."""

import unicodedata
from decimal import Decimal

from django.db import migrations

PAIRS = [
    ('Sun Tzu Prime', 'Yi To', 116),
    ('Yi To', 'Liu Che', 110),
    ('Bai Qi', 'Yi To', 110),
]
FORMATIONS = {
    'Yi To': ['pincer', 'arch'],
    'Selim I': ['pincer'],
}


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
    CommanderFormation = apps.get_model('guides', 'CommanderFormation')
    known = {fold(row.commander) for row in CommanderFormation.objects.all()}
    CommanderFormation.objects.bulk_create(
        CommanderFormation(commander=name, formations=formations)
        for name, formations in FORMATIONS.items()
        if fold(name) not in known
    )


class Migration(migrations.Migration):
    dependencies = [('guides', '0017_pairs_stephen_shapur')]

    operations = [migrations.RunPython(add, migrations.RunPython.noop)]
