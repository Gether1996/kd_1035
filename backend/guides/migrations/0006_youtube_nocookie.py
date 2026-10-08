"""Guide HTML saved before the sanitizer switched YouTube players to youtube-nocookie.com is cleaned once more."""

from django.db import migrations

from guides.sanitize import clean_html


def clean_saved_html(apps, schema_editor):
    Guide = apps.get_model('guides', 'Guide')
    for guide in Guide.objects.only('html_sk', 'html_cs'):
        html_sk, html_cs = clean_html(guide.html_sk), clean_html(guide.html_cs)
        if (html_sk, html_cs) != (guide.html_sk, guide.html_cs):
            # update() keeps updated_at: the guide did not really change ("Aktualizované" and the footer date)
            Guide.objects.filter(pk=guide.pk).update(html_sk=html_sk, html_cs=html_cs)


class Migration(migrations.Migration):
    dependencies = [('guides', '0005_guide_auto_update')]

    operations = [migrations.RunPython(clean_saved_html, migrations.RunPython.noop)]
