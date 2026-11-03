from django.db import migrations

# The second Delta armaments score like Wedge 2.0 and Pincer 2.0 (Gether 3. 11. 2026: "také isté body ako pincer2 …
# 50 a 30 a 20"); the tiers S+ and A+ of 0050 are gone. A saved tier list moves the Delta 2.0 names that still have
# 0050's tier, and any other S+ / A+ to S / A (the page would count them by colour otherwise).
DELTA_II = {
    'Raging Tide': 'S', 'Impervious': 'S', 'Bold Ambitions': 'S', 'Rapid Advance': 'S',
    'Surge': 'B', 'Burst': 'B', 'Steady': 'C', 'Driven': 'C',
}  # fmt: skip
OLD = {'S+': 'S', 'A+': 'A'}


def delta_like_wedge(apps, schema_editor):
    EvaluationSettings = apps.get_model('accounts', 'EvaluationSettings')
    for row in EvaluationSettings.objects.all():
        armaments = row.data.get('armaments') if isinstance(row.data, dict) else None
        if not isinstance(armaments, dict):
            continue
        changed = False
        tiers = armaments.get('inscriptions')
        if isinstance(tiers, dict):
            for name, tier in list(tiers.items()):
                if tier in OLD:
                    tiers[name] = DELTA_II.get(name, OLD[tier])
                    changed = True
        points = armaments.get('tiers')
        if isinstance(points, dict) and ({'S+', 'A+'} & set(points)):
            for tier in OLD:
                points.pop(tier, None)
            changed = True
        if changed:
            row.save(update_fields=['data'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0053_hall_archive')]

    operations = [migrations.RunPython(delta_like_wedge, migrations.RunPython.noop)]
