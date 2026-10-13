"""Gold equipment starts at iconic I (Gether 13. 10. 2026: "jednorazovo aj marchom, ktoré nemajú spravený iconic na
equipe, daj všade iconic 1"): every saved piece of a march or KvK sign-up whose item can be awakened and has no iconic
level gets I. A level set by the player stays."""

from django.db import migrations

from guides import armory


def iconic_one(apps, schema_editor):
    items = armory.items()
    for model in ('March', 'KvkSignup'):
        for row in apps.get_model('accounts', model).objects.exclude(gear={}):
            changed = False
            for piece in row.gear.values():
                if isinstance(piece, dict) and not piece.get('iconic') and items.get(piece.get('item'), {}).get('iconic'):
                    piece['iconic'] = 1
                    changed = True
            if changed:
                row.save(update_fields=['gear'])


class Migration(migrations.Migration):
    dependencies = [('accounts', '0025_player_settings')]

    operations = [migrations.RunPython(iconic_one, migrations.RunPython.noop)]
