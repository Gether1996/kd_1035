"""The first formations of the commanders for the KvK evaluation (Gether 14. 10. 2026: "pozri si rokstats alebo
metarok, akú formáciu by mal asi používať ktorý commander"). Sources, checked 14. 10. 2026:
- meta-rok.com: the "Formation" of the commander page (/commander/<slug>) and of the field pairing (/tierlist/field/…);
- RoKBattles Combat Lab (rokbattles.com/combat-lab, open field, last year): what players lead the most played pairs
  with, from battle reports. A second formation where the sources disagree or it takes a quarter of the reports.
app.rokstats.online has no formation data. Hector, Vercingetorix and William I are left out (only allclash.com, too
few reports) – they take any formation. A commander already in the table (the admin, the page) keeps his row."""

from django.db import migrations

FORMATIONS = {
    'Achilles': ['delta'],
    'Aethelflaed': ['wedge'],
    'Afonso de Albuquerque': ['v'],
    'Alexander Nevsky': ['wedge'],
    'Alexander the Great': ['wedge', 'arch'],
    'Alp Arslan': ['wedge'],
    'Arthur Pendragon': ['delta'],
    'Ashurbanipal': ['wedge'],
    # meta-rok: arch; RoKBattles with Achilles: delta 61 %, arch 37 %
    'Attila': ['arch', 'delta'],
    'Babur': ['v'],
    'Bai Qi': ['pincer'],
    'Belisarius Prime': ['triple-line', 'wedge'],
    'Boudica Prime': ['wedge'],
    'Cheok Jun-gyeong': ['pincer'],
    'David IV': ['delta'],
    'Elizabeth I': ['v'],
    'Gajah Mada': ['v'],
    'Gang Gamchan': ['delta'],
    'Gonzalo de Cordoba': ['v'],
    'Guan Yu': ['wedge'],
    'Hermann Prime': ['wedge'],
    'Huo Qubing': ['wedge'],
    'Ivan IV': ['delta'],
    'Ivar the Boneless': ['pincer'],
    'Joan of Arc Prime': ['wedge'],
    'John Hunyadi': ['v'],
    'Liu Che': ['pincer', 'arch'],
    'Margaret I': ['v'],
    'Minamoto': ['wedge'],
    # RoKBattles: with Zhuge Liang wedge 57 %, echelon 39 %; with Liu Che echelon 38 %
    'Philip II': ['echelon', 'wedge'],
    'Qin Shi Huang': ['wedge'],
    'Ragnar Lodbrok Prime': ['wedge'],
    'Saladin': ['wedge'],
    'Scipio Africanus Prime': ['wedge'],
    'Shajar al-Durr': ['wedge'],
    'Stephen III': ['v'],
    'Sun Tzu Prime': ['pincer'],
    'William Marshal': ['delta'],
    'William Wallace': ['pincer'],
    'Yi Seong-Gye': ['wedge'],
    'Zhuge Liang': ['wedge'],
}


def add_formations(apps, schema_editor):
    CommanderFormation = apps.get_model('guides', 'CommanderFormation')
    have = set(CommanderFormation.objects.values_list('commander', flat=True))
    CommanderFormation.objects.bulk_create(
        CommanderFormation(commander=name, formations=ids) for name, ids in FORMATIONS.items() if name not in have
    )


class Migration(migrations.Migration):
    dependencies = [('guides', '0013_commander_formation')]

    operations = [migrations.RunPython(add_formations, migrations.RunPython.noop)]
