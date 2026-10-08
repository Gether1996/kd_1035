from django.db import migrations, models

# commander specialties of the meta guides (guides/meta) – also set here for guides that are no longer auto-updated
SPECIALTIES = {
    'pary-pre-jazdu': 'cavalry', 'pary-pre-pechotu': 'infantry', 'pary-pre-lukostrelcov': 'archer',
    'pary-leadership-a-mix': 'leadership', 'pary-pre-garrison': 'garrison', 'pary-pre-rally': 'conquering',
    'pary-na-barbarov-a-pevnosti': 'peacekeeping', 'pary-na-zber-surovin': 'gathering',
    'vybava-pre-jazdu': 'cavalry', 'vybava-pre-pechotu': 'infantry', 'vybava-pre-lukostrelcov': 'archer',
    'vybava-pre-leadership': 'leadership',
}  # fmt: skip


def set_specialties(apps, schema_editor):
    Guide = apps.get_model('guides', 'Guide')
    for slug, specialty in SPECIALTIES.items():
        Guide.objects.filter(slug=slug, specialty='').update(specialty=specialty)


class Migration(migrations.Migration):
    dependencies = [('guides', '0006_youtube_nocookie')]

    operations = [
        migrations.AddField(
            model_name='guide',
            name='specialty',
            field=models.CharField(
                blank=True,
                choices=[
                    ('cavalry', 'Jazda'),
                    ('infantry', 'Pechota'),
                    ('archer', 'Lukostrelci'),
                    ('leadership', 'Leadership'),
                    ('garrison', 'Garrison'),
                    ('conquering', 'Conquering (rally)'),
                    ('peacekeeping', 'Peacekeeping (barbari)'),
                    ('gathering', 'Gathering (zber)'),
                ],
                help_text='Herná ikona špecializácie commanderov pri návode v zozname, aby ho hráč rýchlo našiel. '
                'Prázdne = bez ikony. Automaticky aktualizovaným návodom ju nastavuje meta (backend/guides/meta).',
                max_length=16,
                verbose_name='špecializácia',
            ),
        ),
        migrations.RunPython(set_specialties, migrations.RunPython.noop),
    ]
