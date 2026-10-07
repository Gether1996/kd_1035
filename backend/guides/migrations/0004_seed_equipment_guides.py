"""Formerly seeded guides. The guides now live in guides/meta and are written by `manage.py sync_meta_guides`."""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('guides', '0003_seed_commander_guides')]

    operations = []
