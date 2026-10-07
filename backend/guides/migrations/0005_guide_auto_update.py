from django.db import migrations, models

# guides created by the former seed migrations 0003/0004 – from now on kept up to date by sync_meta_guides
SEEDED = [
    'ako-skladat-pary-commanderov', 'pary-pre-jazdu', 'pary-pre-pechotu', 'pary-pre-lukostrelcov',
    'pary-leadership-a-mix', 'pary-pre-garnizonu', 'pary-pre-rally', 'pary-na-barbarov-a-pevnosti',
    'pary-pre-f2p-a-zaciatok', 'pary-na-zber-surovin', 'zaklady-vybavy-a-craftovania', 'vybava-pre-jazdu',
    'vybava-pre-pechotu', 'vybava-pre-lukostrelcov', 'vybava-pre-leadership', 'najlepsie-doplnky', 'vybava-pre-f2p',
]  # fmt: skip


def mark_seeded(apps, schema_editor):
    apps.get_model('guides', 'Guide').objects.filter(slug__in=SEEDED).update(auto_update=True)


class Migration(migrations.Migration):
    dependencies = [('guides', '0004_seed_equipment_guides')]

    operations = [
        migrations.AddField(
            model_name='guide',
            name='auto_update',
            field=models.BooleanField(
                default=False,
                help_text='Obsah udržiava mesačná aktualizácia mety (backend/guides/meta). Ručná úprava nadpisu alebo '
                'obsahu ju vypne, aby ju ďalšia aktualizácia neprepísala.',
                verbose_name='aktualizovať automaticky',
            ),
        ),
        migrations.RunPython(mark_seeded, migrations.RunPython.noop),
    ]
