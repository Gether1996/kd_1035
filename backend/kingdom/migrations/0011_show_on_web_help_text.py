from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('kingdom', '0010_holy_knights_treasure_sets'),
    ]

    operations = [
        migrations.AlterField(
            model_name='kingdomevent',
            name='show_on_web',
            field=models.BooleanField(default=True, help_text='Hráči si ho môžu vybrať na webe v časti Pripomienky eventov.', verbose_name='zobraziť na webe'),
        ),
    ]
