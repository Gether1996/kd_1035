from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0024_terms_of_use'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlayerSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'auto_approve',
                    models.BooleanField(
                        default=False,
                        help_text='Nový hráč je schválený hneď pri prvom prihlásení a superadmin nedostane správu na '
                        'Discord. Hráčov, ktorí už čakajú, to neschváli.',
                        verbose_name='schvaľovať automaticky',
                    ),
                ),
            ],
            options={
                'verbose_name': 'schvaľovanie hráčov',
                'verbose_name_plural': 'schvaľovanie hráčov',
            },
        ),
    ]
