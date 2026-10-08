from django.db import migrations, models

# unit types of the meta guides (guides/meta) – also set here for guides that are no longer auto-updated
UNITS = {
    'pary-pre-jazdu': 'cavalry', 'pary-pre-pechotu': 'infantry', 'pary-pre-lukostrelcov': 'archer',
    'pary-leadership-a-mix': 'leadership', 'vybava-pre-jazdu': 'cavalry', 'vybava-pre-pechotu': 'infantry',
    'vybava-pre-lukostrelcov': 'archer', 'vybava-pre-leadership': 'leadership',
}  # fmt: skip


def set_units(apps, schema_editor):
    Guide = apps.get_model('guides', 'Guide')
    for slug, unit in UNITS.items():
        Guide.objects.filter(slug=slug, unit='').update(unit=unit)


class Migration(migrations.Migration):
    dependencies = [('guides', '0006_youtube_nocookie')]

    operations = [
        migrations.AddField(
            model_name='guide',
            name='unit',
            field=models.CharField(
                blank=True,
                choices=[
                    ('cavalry', 'Jazda'),
                    ('infantry', 'Pechota'),
                    ('archer', 'Lukostrelci'),
                    ('leadership', 'Leadership'),
                ],
                help_text='Ikona pri návode v zozname, aby hráč rýchlo našiel svoje jednotky. Prázdne = bez ikony. '
                'Automaticky aktualizovaným návodom ho nastavuje meta (backend/guides/meta).',
                max_length=16,
                verbose_name='typ jednotiek',
            ),
        ),
        migrations.RunPython(set_units, migrations.RunPython.noop),
    ]
