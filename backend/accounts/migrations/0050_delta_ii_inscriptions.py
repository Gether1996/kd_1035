from django.db import migrations

# The second Delta armaments (update 1.1.13): their inscriptions a little over the old Delta gold (S) and blue (best A)
# ones (Gether 29. 10. 2026). Saved variables keep their own tier list, so the new names go into it – only names not
# there yet, and only a list that exists (without one the page uses its default list, which has them already).
NEW = {
    'Raging Tide': 'S+', 'Impervious': 'S+', 'Bold Ambitions': 'S+', 'Rapid Advance': 'S+',
    'Surge': 'A+', 'Steady': 'A+', 'Burst': 'A+', 'Driven': 'A+',
}  # fmt: skip


def delta_ii(apps, schema_editor):
    EvaluationSettings = apps.get_model('accounts', 'EvaluationSettings')
    for row in EvaluationSettings.objects.all():
        armaments = row.data.get('armaments') if isinstance(row.data, dict) else None
        tiers = armaments.get('inscriptions') if isinstance(armaments, dict) else None
        if not isinstance(tiers, dict):
            continue
        missing = {name: tier for name, tier in NEW.items() if name not in tiers}
        if missing:
            tiers.update(missing)
            row.save(update_fields=['data'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0049_hall_count_text')]

    operations = [migrations.RunPython(delta_ii, migrations.RunPython.noop)]
