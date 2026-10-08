from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions
from django.db import migrations

# R4 approve Governor registrations in the admin – nothing else (players stay superuser-only)
R4_PERMISSIONS = ['view_governor', 'change_governor']


def add_r4_group(apps, schema_editor):
    # Default permissions are normally created after all migrations (post_migrate); on a fresh database they do
    # not exist yet. create_permissions() reads only the label and models_module of the config it gets – the
    # historical app config has no models_module – and takes the models from the historical `apps`.
    create_permissions(global_apps.get_app_config('accounts'), apps=apps, verbosity=0)

    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')
    group, _ = Group.objects.get_or_create(name='R4')
    group.permissions.add(
        *Permission.objects.filter(content_type__app_label='accounts', codename__in=R4_PERMISSIONS)
    )


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_governor'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [migrations.RunPython(add_r4_group, migrations.RunPython.noop)]
