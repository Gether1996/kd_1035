import importlib
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock
from xml.sax.saxutils import escape

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from kingdom.models import KingdomEvent

from .meta import LAST_UPDATE, MODULES
from .meta.render import (
    COMMANDER_DIR, GEAR_DIR, SPECIALTY_DIR, commander_icons, gear_icons, render, slug, specialty_icon, verified_note,
)  # fmt: skip
from .meta.sync import rendered_guides, sync_guides
from .models import Guide
from .sanitize import clean_html
from .serializers import GuideDetailSerializer


class SanitizeTests(TestCase):
    def test_removes_scripts_styles_and_handlers(self):
        html = clean_html(
            '<style>body{display:none}</style><h2 onclick="x()">MGE</h2><script>alert(1)</script>'
            '<a href="javascript:alert(1)">bad</a><img src="https://x.test/a.png" onerror="x()">'
        )
        self.assertEqual(html, '<h2>MGE</h2><a rel="noopener noreferrer">bad</a><img src="https://x.test/a.png">')

    def test_keeps_tables_and_video_embeds_only(self):
        html = clean_html(
            '<table><tr><td colspan="2">Sun Tzu + Joan</td></tr></table>'
            '<iframe src="https://www.youtube.com/embed/abc"></iframe><iframe src="https://evil.test/"></iframe>'
        )
        self.assertIn('<td colspan="2">Sun Tzu + Joan</td>', html)
        self.assertIn('<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>', html)
        self.assertIn('<iframe></iframe>', html)

    def test_youtube_embeds_use_the_privacy_enhanced_mode(self):
        self.assertEqual(
            clean_html('<iframe src="https://www.youtube.com/embed/x?start=60"></iframe>'),
            '<iframe src="https://www.youtube-nocookie.com/embed/x?start=60"></iframe>',
        )
        for kept in ('https://www.youtube-nocookie.com/embed/x', 'https://player.twitch.tv/?video=1&parent=kd1035.eu'):
            with self.subTest(kept):
                self.assertIn(f'src="{escape(kept)}"', clean_html(f'<iframe src="{escape(kept)}"></iframe>'))

    def test_migration_cleans_guides_saved_before_and_keeps_their_date(self):
        migration = importlib.import_module('guides.migrations.0006_youtube_nocookie')
        guide = Guide.objects.create(category='eventy', title_sk='Video', slug='video', html_sk='<p>x</p>')
        old = '<p>MGE</p><iframe src="https://www.youtube.com/embed/x"></iframe>'
        Guide.objects.filter(pk=guide.pk).update(html_sk=old, html_cs=old)  # as saved before the rewrite
        updated_at = Guide.objects.get(pk=guide.pk).updated_at

        migration.clean_saved_html(django_apps, None)
        guide.refresh_from_db()
        new = '<p>MGE</p><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>'
        self.assertEqual((guide.html_sk, guide.html_cs), (new, new))
        self.assertEqual(guide.updated_at, updated_at)


class MetaGuidesTests(TestCase):
    def test_rendered_guides_are_clean_bilingual_with_short_excerpts(self):
        for module in MODULES:
            note = verified_note(module.VERIFIED, module.NOTE)
            for guide in module.GUIDES:
                for lang in ('sk', 'cs'):
                    html = render(guide['blocks'], lang, note)
                    # what the sync writes is exactly what the sanitizer keeps
                    self.assertEqual(clean_html(html), html, guide['slug'])
        guides = list(rendered_guides())
        slugs = [g['slug'] for g in guides]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'commanderi']), 9)
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'vybava']), 7)
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'eventy']), 10)
        for data in guides:
            self.assertIn(data['category'], Guide.Category.values)
            self.assertIn(data['specialty'], ['', *Guide.Specialty.values], data['slug'])
            self.assertNotEqual(data['html_sk'], data['html_cs'], data['slug'])
            guide = Guide(**data)
            for lang in ('sk', 'cs'):
                self.assertTrue(0 < len(guide.excerpt(lang)) <= 160, data['slug'])

    def test_every_item_in_equipment_tables_has_an_icon(self):
        # a new item from the monthly meta update needs its icon in guides/static/guides/gear (see CLAUDE.md)
        from .meta import equipment

        for guide in equipment.GUIDES:
            for block in guide['blocks']:
                if block[0] != 'table':
                    continue
                for row in block[2]:
                    for column in ('item', 'accessory'):
                        if column in row:
                            self.assertTrue(gear_icons(row[column]), f'{guide["slug"]}: no icon for {row[column]}')
        for path in GEAR_DIR.glob('*'):
            self.assertEqual(path.suffix, '.webp', path.name)
            self.assertLess(path.stat().st_size, 30_000, path.name)

    def test_fetch_gear_icons_saves_a_square_webp(self):
        from io import BytesIO, StringIO
        from unittest import mock

        from django.core.management import CommandError, call_command
        from PIL import Image

        from .management.commands import fetch_gear_icons

        png = BytesIO()
        Image.new('RGBA', (200, 120), (200, 150, 40, 255)).save(png, 'PNG')
        page = b'<img src="/_astro/navars_control.Ab1_x.webp"><img src="/_astro/navars_control.Ab1_x_Q9z.webp">'
        urls = []

        def fetch(url):
            urls.append(url)
            return page if url == fetch_gear_icons.PAGE else png.getvalue()

        with tempfile.TemporaryDirectory() as folder, mock.patch.object(fetch_gear_icons, 'fetch', fetch), \
                mock.patch.object(fetch_gear_icons, 'GEAR_DIR', Path(folder)):  # fmt: skip
            call_command('fetch_gear_icons', 'Navar’s Control', stdout=StringIO())
            with Image.open(Path(folder) / 'navars-control.webp') as icon:
                self.assertEqual((icon.format, icon.size), ('WEBP', (96, 96)))
            self.assertEqual(urls[-1], 'https://codexhelper.com/_astro/navars_control.Ab1_x.webp')
            with self.assertRaises(CommandError):
                call_command('fetch_gear_icons', 'Unknown Blade', stdout=StringIO())

    def test_every_pair_table_says_whether_it_is_f2p(self):
        # Gether, 10. 10. 2026: F2P everywhere
        from .meta import commanders

        for guide in commanders.GUIDES:
            for block in guide['blocks']:
                if block[0] == 'pairs':
                    self.assertIn('f2p', block[1], guide['slug'])
                    for row in block[2]:
                        self.assertIn(row['f2p'], ('yes', 'partly', 'no'), guide['slug'])

    def test_sources_are_named_only_in_the_sources_list(self):
        # Gether, 10. 10. 2026: no "podľa Chadského" in the text, the video is listed under Zdroje
        for module in MODULES:
            note = verified_note(module.VERIFIED, module.NOTE)
            for guide in module.GUIDES:
                for lang in ('sk', 'cs'):
                    html = render(guide['blocks'], lang, note)
                    text = html.split('<h2>Zdroje</h2>')[0]
                    self.assertNotIn('Chadsk', text, guide['slug'])
                    self.assertNotIn('WarDaddy', text, guide['slug'])

    def test_lineups_are_portraits_with_the_names_in_alt_and_title(self):
        html = render([('lineups', [('KvK1', [('Ivan IV', 'Achilles'), ('Sun Tzu',)])])], 'sk', {})
        self.assertEqual(clean_html(html), html)
        self.assertIn('<strong>KvK1</strong>', html)
        self.assertIn('<span class="army" title="Ivan IV + Achilles">', html)
        self.assertIn('src="/static/guides/commanders/ivan-iv.webp" alt="Ivan IV" title="Ivan IV"', html)
        self.assertIn('<span class="army" title="Sun Tzu"><img', html)

    def test_every_commander_in_pair_tables_has_a_portrait(self):
        # a new commander from the monthly meta update needs a portrait: manage.py fetch_commander_icons "Name"
        from .meta import commanders

        for guide in commanders.GUIDES:
            for block in guide['blocks']:
                if block[0] == 'lineups':  # portraits only, no names next to them
                    for _, armies in block[1]:
                        for name in (name for army in armies for name in army):
                            self.assertEqual(commander_icons(name), [slug(name)], f'{guide["slug"]}: {name}')
                if block[0] != 'pairs':
                    continue
                for row in block[2]:
                    for column in ('primary', 'secondary'):
                        if isinstance(row[column], str):  # t('ktokoľvek', …) is not a commander
                            for name in row[column].split(' / '):
                                self.assertEqual(commander_icons(name), [slug(name)], f'{guide["slug"]}: {name}')
        for path in COMMANDER_DIR.glob('*'):
            self.assertEqual(path.suffix, '.webp', path.name)
            self.assertLess(path.stat().st_size, 30_000, path.name)

    def test_fetch_commander_icons_uses_the_rokstats_hero_id(self):
        from io import BytesIO, StringIO
        from unittest import mock

        from django.core.management import CommandError, call_command
        from PIL import Image

        from .management.commands import fetch_commander_icons

        png = BytesIO()
        Image.new('RGBA', (260, 260), (200, 150, 40, 255)).save(png, 'PNG')
        page = b'{"heroId":9,"slug":"minamoto-no-yoshitsune","url":"/commanders/minamoto-no-yoshitsune"}'
        urls = []

        def fetch(url):
            urls.append(url)
            return page if url == fetch_commander_icons.PAGE else png.getvalue()

        with tempfile.TemporaryDirectory() as folder, mock.patch.object(fetch_commander_icons, 'fetch', fetch), \
                mock.patch.object(fetch_commander_icons, 'COMMANDER_DIR', Path(folder)):  # fmt: skip
            call_command('fetch_commander_icons', 'Minamoto', stdout=StringIO())
            self.assertTrue((Path(folder) / 'minamoto.webp').exists())
            self.assertEqual(urls[-1], 'https://app.rokstats.online/img/commanders/9/portrait')
            with self.assertRaises(CommandError):
                call_command('fetch_commander_icons', 'Nobody', stdout=StringIO())

    def test_every_specialty_has_an_icon(self):
        # a new Guide.Specialty needs its in-game tag: manage.py fetch_specialty_icons
        from PIL import Image

        for specialty in Guide.Specialty.values:
            with Image.open(SPECIALTY_DIR / f'{specialty}.webp') as icon:
                self.assertEqual((icon.format, icon.size), ('WEBP', (96, 96)), specialty)
            self.assertEqual(specialty_icon(specialty), f'/static/guides/specialties/{specialty}.webp')
        self.assertIsNone(specialty_icon(''))
        self.assertIsNone(specialty_icon('siege'))
        self.assertEqual(sorted(path.stem for path in SPECIALTY_DIR.glob('*')), sorted(Guide.Specialty.values))

    def test_fetch_specialty_icons_reads_the_rokstats_tags(self):
        import json
        from io import BytesIO, StringIO
        from unittest import mock

        from django.core.management import CommandError, call_command
        from PIL import Image

        from .management.commands import fetch_specialty_icons

        png = BytesIO()
        Image.new('RGBA', (99, 99), (200, 60, 50, 255)).save(png, 'PNG')
        tags = {
            str(number): {'slug': specialty, 'icon': f'/icons/type{number}.png'}
            for number, specialty in enumerate(Guide.Specialty.values, start=1)
        }
        page = '<script type="application/json" id="commander-catalog-data">{}</script>'
        urls = []

        def fetch(url, tags=tags):
            urls.append(url)
            if url == fetch_specialty_icons.PAGE:
                return page.format(json.dumps({'tags': tags})).encode()
            return png.getvalue()

        with tempfile.TemporaryDirectory() as folder, mock.patch.object(fetch_specialty_icons, 'fetch', fetch), \
                mock.patch.object(fetch_specialty_icons, 'SPECIALTY_DIR', Path(folder)):  # fmt: skip
            call_command('fetch_specialty_icons', stdout=StringIO())
            with Image.open(Path(folder) / 'garrison.webp') as icon:
                self.assertEqual((icon.format, icon.size), ('WEBP', (96, 96)))
            self.assertEqual(
                sorted(path.stem for path in Path(folder).glob('*.webp')), sorted(Guide.Specialty.values)
            )
            self.assertIn('https://app.rokstats.online/icons/type1.png', urls)

            del tags['4']  # a tag the catalog does not have any more
            with self.assertRaises(CommandError):
                call_command('fetch_specialty_icons', stdout=StringIO())

    def test_gear_icons_follow_the_text(self):
        self.assertEqual(commander_icons('Sun Tzu Prime + Sun Tzu'), ['sun-tzu-prime', 'sun-tzu'])
        self.assertEqual(gear_icons('Horn of Fury + Ring of Doom'), ['horn-of-fury', 'ring-of-doom'])
        self.assertEqual(gear_icons('Pendant of Eternal Night pre Qin Shi Huanga'), ['pendant-of-eternal-night'])
        self.assertEqual(gear_icons({'sk': 'Navar’s Control (KvK)', 'cs': '-'}), ['navars-control'])
        self.assertEqual(gear_icons('epická výbava'), [])

    def test_verified_note(self):
        note = verified_note('2026-07', {'sk': 'A.', 'cs': 'B.'})
        self.assertEqual(note, {'sk': 'Stav k júlu 2026. A.', 'cs': 'Stav k červenci 2026. B.'})


class MetaSyncTests(TestCase):
    def setUp(self):
        Guide.objects.all().delete()

    def test_creates_guides_and_second_run_changes_nothing(self):
        stats = sync_guides()
        self.assertEqual(stats['created'], len(list(rendered_guides())))
        self.assertTrue(Guide.objects.filter(auto_update=True, is_published=True).exists())
        before = dict(Guide.objects.values_list('slug', 'updated_at'))
        self.assertEqual(sync_guides(), {'created': 0, 'updated': 0, 'unpublished': 0})
        self.assertEqual(dict(Guide.objects.values_list('slug', 'updated_at')), before)

    def test_updates_only_auto_guides(self):
        sync_guides()
        Guide.objects.filter(slug='pary-pre-jazdu').update(html_sk='<p>stará meta</p>')
        Guide.objects.filter(slug='pary-pre-pechotu').update(html_sk='<p>môj text</p>', auto_update=False)
        self.assertEqual(sync_guides()['updated'], 1)
        self.assertNotEqual(Guide.objects.get(slug='pary-pre-jazdu').html_sk, '<p>stará meta</p>')
        self.assertEqual(Guide.objects.get(slug='pary-pre-pechotu').html_sk, '<p>môj text</p>')

    def test_a_new_position_alone_keeps_the_update_date(self):
        sync_guides()
        guide = Guide.objects.get(slug='pary-na-zber-surovin')
        Guide.objects.filter(pk=guide.pk).update(order=guide.order + 1)  # as if a guide before it was dropped
        self.assertEqual(sync_guides()['updated'], 0)
        moved = Guide.objects.get(pk=guide.pk)
        self.assertEqual((moved.order, moved.updated_at), (guide.order, guide.updated_at))

    def test_specialties_come_from_the_meta(self):
        sync_guides()
        self.assertEqual(
            dict(Guide.objects.filter(is_published=True).exclude(specialty='').values_list('slug', 'specialty')),
            {
                'pary-pre-jazdu': 'cavalry', 'pary-pre-pechotu': 'infantry', 'pary-pre-lukostrelcov': 'archer',
                'pary-pre-garrison': 'garrison',
                'pary-pre-rally': 'conquering', 'pary-na-barbarov-a-pevnosti': 'peacekeeping',
                'pary-na-zber-surovin': 'gathering', 'vybava-pre-jazdu': 'cavalry', 'vybava-pre-pechotu': 'infantry',
                'vybava-pre-lukostrelcov': 'archer', 'vybava-pre-leadership': 'leadership',
            },
        )  # fmt: skip

    def test_migration_sets_specialties_and_keeps_the_date(self):
        migration = importlib.import_module('guides.migrations.0007_guide_specialty')
        sync_guides()
        # the migration knows the specialties of the meta modules (and of guides dropped from them later)
        meta = {g['slug']: g['specialty'] for g in rendered_guides() if g['specialty']}
        self.assertEqual({slug: s for slug, s in migration.SPECIALTIES.items() if slug in meta}, meta)
        Guide.objects.update(specialty='')  # as before the migration
        Guide.objects.filter(slug='pary-pre-pechotu').update(specialty='archer')  # already set by hand
        before = dict(Guide.objects.values_list('slug', 'updated_at'))

        migration.set_specialties(django_apps, None)
        self.assertEqual(Guide.objects.get(slug='pary-pre-rally').specialty, 'conquering')
        self.assertEqual(Guide.objects.get(slug='pary-pre-pechotu').specialty, 'archer')
        self.assertEqual(Guide.objects.get(slug='pary-pre-f2p-a-zaciatok').specialty, '')
        self.assertEqual(dict(Guide.objects.values_list('slug', 'updated_at')), before)

    def test_hand_written_guide_with_the_same_slug_is_left_alone(self):
        Guide.objects.create(category='vybava', slug='vybava-pre-jazdu', title_sk='Môj set', html_sk='<p>môj</p>')
        sync_guides()
        self.assertEqual(Guide.objects.get(slug='vybava-pre-jazdu').title_sk, 'Môj set')

    def test_auto_guide_dropped_from_the_content_is_unpublished(self):
        Guide.objects.create(category='vybava', slug='stary-navod', title_sk='x', html_sk='<p>x</p>', auto_update=True)
        Guide.objects.create(category='vybava', slug='rucny-navod', title_sk='y', html_sk='<p>y</p>')
        self.assertEqual(sync_guides()['unpublished'], 1)
        self.assertFalse(Guide.objects.get(slug='stary-navod').is_published)
        self.assertTrue(Guide.objects.get(slug='rucny-navod').is_published)


class AdminAutoUpdateTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_superuser('boss', password='test-only'))
        self.guide = Guide.objects.create(
            category='vybava', slug='set', title_sk='Set', html_sk='<p>a</p>', auto_update=True
        )

    def save(self, **changes):
        data = {
            'category': 'vybava', 'title_sk': 'Set', 'title_cs': '', 'slug': 'set', 'is_published': 'on',
            'auto_update': 'on', 'order': 0, 'html_sk': '<p>a</p>', 'html_cs': '',
            'images-TOTAL_FORMS': 0, 'images-INITIAL_FORMS': 0, 'images-MIN_NUM_FORMS': 0, 'images-MAX_NUM_FORMS': 1000,
        }  # fmt: skip
        data.update(changes)
        response = self.client.post(f'/admin/guides/guide/{self.guide.pk}/change/', data)
        self.assertEqual(response.status_code, 302)
        self.guide.refresh_from_db()

    def test_saving_without_content_change_keeps_auto_update(self):
        self.save(html_sk='<p>a</p>\r\n', order=3)  # browsers send CRLF
        self.assertTrue(self.guide.auto_update)

    def test_setting_the_specialty_keeps_auto_update(self):
        self.save(specialty='archer')
        self.assertEqual((self.guide.specialty, self.guide.auto_update), ('archer', True))

    def test_hand_edit_turns_auto_update_off(self):
        self.save(html_sk='<p>b</p>')
        self.assertFalse(self.guide.auto_update)

    def test_ticking_the_checkbox_while_editing_keeps_it_on(self):
        Guide.objects.filter(pk=self.guide.pk).update(auto_update=False)
        self.save(html_sk='<p>c</p>')  # ticking the box in the same save keeps it on
        self.assertTrue(self.guide.auto_update)


class SiteStatusTests(TestCase):
    def test_reports_the_meta_check_or_a_newer_guide_change(self):
        Guide.objects.all().delete()
        self.assertEqual(self.client.get('/api/status/').json(), {'updated': LAST_UPDATE, 'meta_verified': LAST_UPDATE})

        guide = Guide.objects.create(category='vybava', slug='novy', title_sk='Nový', html_sk='<p>x</p>')
        Guide.objects.filter(pk=guide.pk).update(updated_at=datetime(2030, 1, 2, 12, tzinfo=UTC))
        self.assertEqual(self.client.get('/api/status/').json()['updated'], '2030-01-02')

        Guide.objects.filter(pk=guide.pk).update(is_published=False)  # hidden guides do not count
        self.assertEqual(self.client.get('/api/status/').json()['updated'], LAST_UPDATE)


class GuideApiTests(TestCase):
    def setUp(self):
        Guide.objects.all().delete()  # drop the seeded guides
        self.guide = Guide.objects.create(
            category='vybava', title_sk='Najlepšia výbava', slug='najlepsia-vybava', html_sk='<p>Text&nbsp;SK</p><script>x</script>'
        )
        Guide.objects.create(category='vybava', title_sk='Skrytý', slug='skryty', html_sk='<p>x</p>', is_published=False)

    def test_html_is_sanitized_on_save(self):
        self.guide.refresh_from_db()
        self.assertEqual(self.guide.html_sk, '<p>Text&nbsp;SK</p>')

    def test_list_hides_unpublished_and_has_no_html(self):
        data = self.client.get('/api/guides/').json()
        self.assertEqual([g['slug'] for g in data], ['najlepsia-vybava'])
        self.assertNotIn('html_sk', data[0])
        self.assertEqual((data[0]['specialty'], data[0]['specialty_icon']), ('', None))
        self.assertEqual(data[0]['excerpt_sk'], 'Text SK')

    def test_list_has_the_icon_of_the_specialty(self):
        Guide.objects.filter(pk=self.guide.pk).update(specialty='garrison')
        data = self.client.get('/api/guides/').json()
        self.assertEqual(
            (data[0]['specialty'], data[0]['specialty_icon']), ('garrison', '/static/guides/specialties/garrison.webp')
        )
        self.assertEqual(data[0]['excerpt_cs'], 'Text SK')  # falls back to Slovak

    def test_detail(self):
        data = self.client.get('/api/guides/najlepsia-vybava/').json()
        self.assertEqual(data['html_sk'], '<p>Text&nbsp;SK</p>')
        self.assertEqual(self.client.get('/api/guides/skryty/').status_code, 404)

    def test_excerpt_prefers_first_paragraph(self):
        g = Guide(html_sk='<h2>Predmety</h2><p></p><p>Prvý <b>odsek</b>.</p><ul><li>bod</li></ul>')
        self.assertEqual(g.excerpt(), 'Prvý odsek.')
        self.assertEqual(Guide(html_sk='<h2>Nadpis</h2><ul><li>A</li><li>B</li></ul>').excerpt(), 'Nadpis A B')

    def test_uploaded_image_file_is_removed_with_the_guide(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
            b'\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\xa0\xa0\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            image = self.guide.images.create(image=SimpleUploadedFile('set.png', png, content_type='image/png'))
            path = Path(image.image.path)
            self.assertTrue(path.exists())
            self.assertTrue(image.image.url.startswith('/uploads/guides/'))
            self.guide.delete()
            self.assertFalse(path.exists())

    @override_settings(SITE_URL='https://kd1035.test')
    def test_sitemap_lists_guides_in_both_languages(self):
        xml = self.client.get('/sitemap.xml').content.decode()
        self.assertIn('<loc>https://kd1035.test/</loc>', xml)
        self.assertIn('<loc>https://kd1035.test/cz/navody/vybava/najlepsia-vybava</loc>', xml)
        self.assertIn('hreflang="cs" href="https://kd1035.test/cz/o-nas"', xml)
        self.assertIn('<loc>https://kd1035.test/cz/podmienky</loc>', xml)
        self.assertIn('<loc>https://kd1035.test/ochrana-udajov</loc>', xml)
        self.assertIn('<loc>https://kd1035.test/cz/ochrana-udajov</loc>', xml)
        self.assertNotIn('skryty', xml)




class GuideEventsTests(TestCase):
    """The detail of a guide lists the next dates of the events linked to it ("V kalendári" on the guide page)."""

    NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)

    def setUp(self):
        Guide.objects.all().delete()
        self.guide = Guide.objects.create(category='eventy', title_sk='MGE', slug='mge', html_sk='<p>x</p>')

    def event(self, name, starts_at, **kwargs):
        return KingdomEvent.objects.create(
            name_sk=name, starts_at=starts_at, guide=self.guide, **{'duration_minutes': 0, **kwargs}
        )

    def get(self, slug='mge'):
        with mock.patch('django.utils.timezone.now', return_value=self.NOW):
            return self.client.get(f'/api/guides/{slug}/')

    def test_lists_running_and_next_runs_of_visible_events_only(self):
        # MGE every 56 days, 6 days long: the run from 26 October is still on
        mge = self.event('MGE', datetime(2026, 8, 31, tzinfo=UTC), repeat_days=56, duration_minutes=6 * 24 * 60)
        ark = self.event('Ark of Osiris', datetime(2026, 11, 7, 12, tzinfo=UTC), repeat_days=14)
        self.event('Vypnutý', datetime(2026, 11, 1, tzinfo=UTC), is_active=False)
        self.event('Skrytý', datetime(2026, 11, 1, tzinfo=UTC), show_on_web=False)
        self.event('Skončený', datetime(2026, 10, 1, tzinfo=UTC))  # one-off, over
        KingdomEvent.objects.create(name_sk='Iný návod', starts_at=datetime(2026, 11, 1, tzinfo=UTC))

        data = self.get().json()['events']
        self.assertEqual([e['id'] for e in data], [mge.pk, ark.pk])
        self.assertEqual(
            data[0],
            {
                'id': mge.pk,
                'name_sk': 'MGE',
                'name_cs': '',
                'icon': '/static/kingdom/events/mge.webp',  # guessed from the name
                'start': '2026-10-26T00:00:00Z',
                'end': '2026-11-01T00:00:00Z',
                'irregular': False,
                'repeat_days': 56,
            },
        )
        self.assertEqual((data[1]['start'], data[1]['end']), ('2026-11-07T12:00:00Z', None))

    def test_irregular_event_without_a_date_comes_last_with_no_start(self):
        waiting = self.event('Silk Road', datetime(2026, 10, 1, 18, tzinfo=UTC), irregular=True, duration_minutes=60)
        dated = self.event('Shadow Legion', datetime(2026, 11, 5, 19, tzinfo=UTC), irregular=True, duration_minutes=60)
        data = self.get().json()['events']
        self.assertEqual([(e['id'], e['start'], e['end']) for e in data], [
            (dated.pk, '2026-11-05T19:00:00Z', '2026-11-05T20:00:00Z'),
            (waiting.pk, None, None),
        ])  # fmt: skip
        self.assertTrue(data[1]['irregular'])

    def test_at_most_four_events(self):
        for day in range(1, 7):
            self.event(f'Event {day}', datetime(2026, 11, day, tzinfo=UTC))
        names = [e['name_sk'] for e in self.get().json()['events']]
        self.assertEqual(names, ['Event 1', 'Event 2', 'Event 3', 'Event 4'])

    def test_unpublished_guide_is_404_without_looking_for_events(self):
        self.event('MGE', datetime(2026, 11, 1, tzinfo=UTC))
        Guide.objects.filter(pk=self.guide.pk).update(is_published=False)
        with mock.patch.object(GuideDetailSerializer, 'get_events') as get_events:
            self.assertEqual(self.get().status_code, 404)
        get_events.assert_not_called()

    def test_list_payload_is_unchanged(self):
        self.event('MGE', datetime(2026, 11, 1, tzinfo=UTC))
        data = self.client.get('/api/guides/').json()
        self.assertEqual(
            set(data[0]),
            {
                'slug', 'category', 'specialty', 'specialty_icon', 'title_sk', 'title_cs', 'excerpt_sk', 'excerpt_cs',
                'updated_at',
            },
        )  # fmt: skip

class LinkPreviewTests(TestCase):
    """Guide pages for link-preview bots (nginx rewrites /[cz/]navody/<category>/<slug> to /api/link-preview/…)."""

    def setUp(self):
        Guide.objects.all().delete()  # drop the seeded guides
        self.guide = Guide.objects.create(
            category='commanderi',
            title_sk='Páry pre jazdu',
            title_cs='Páry pro jízdu',
            slug='pary-pre-jazdu',
            html_sk='<h2>Úvod</h2><p>Najlepšie páry <b>pre jazdu</b>.</p>',
            html_cs='<p>Nejlepší páry pro jízdu.</p>',
        )

    def preview(self, path):
        response = self.client.get(f'/api/link-preview/{path}')
        return response, response.content.decode()

    def test_slovak_guide(self):
        response, html = self.preview('navody/commanderi/pary-pre-jazdu')
        self.assertEqual(response.status_code, 200)
        self.assertIn('<html lang="sk">', html)
        self.assertIn('<title>Páry pre jazdu | KD 1035</title>', html)
        self.assertIn('<meta property="og:title" content="Páry pre jazdu">', html)
        self.assertIn('<meta property="og:description" content="Najlepšie páry pre jazdu.">', html)
        self.assertIn('<meta name="description" content="Najlepšie páry pre jazdu.">', html)
        self.assertIn('<meta property="og:url" content="http://testserver/navody/commanderi/pary-pre-jazdu">', html)
        self.assertIn('<meta property="og:image" content="http://testserver/og-image.jpg">', html)
        self.assertIn('<meta property="og:type" content="article">', html)
        self.assertIn('<meta property="og:locale" content="sk_SK">', html)
        self.assertIn('<meta name="theme-color" content="#f5c451">', html)
        self.assertIn('<meta property="article:modified_time" content="', html)
        self.assertEqual(response['Cache-Control'], 'public, max-age=300')
        self.assertEqual(response['X-Robots-Tag'], 'noindex')
        self.assertIn('User-Agent', response['Vary'])

    def test_czech_guide(self):
        response, html = self.preview('cz/navody/commanderi/pary-pre-jazdu/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('<html lang="cs">', html)
        self.assertIn('<meta property="og:title" content="Páry pro jízdu">', html)
        self.assertIn('<meta property="og:description" content="Nejlepší páry pro jízdu.">', html)
        self.assertIn('<meta property="og:locale" content="cs_CZ">', html)
        self.assertIn('<link rel="canonical" href="http://testserver/cz/navody/commanderi/pary-pre-jazdu">', html)

    def test_czech_falls_back_to_slovak_title_and_excerpt(self):
        Guide.objects.filter(pk=self.guide.pk).update(title_cs='', html_cs='')
        response, html = self.preview('cz/navody/commanderi/pary-pre-jazdu')
        self.assertEqual(response.status_code, 200)
        self.assertIn('<meta property="og:title" content="Páry pre jazdu">', html)
        self.assertIn('<meta property="og:description" content="Najlepšie páry pre jazdu.">', html)
        self.assertIn('<meta property="og:locale" content="cs_CZ">', html)

    def test_moved_guide_points_to_its_current_category(self):
        _, html = self.preview('navody/vybava/pary-pre-jazdu')
        self.assertIn('<link rel="canonical" href="http://testserver/navody/commanderi/pary-pre-jazdu">', html)

    def test_title_and_excerpt_are_escaped(self):
        Guide.objects.filter(pk=self.guide.pk).update(
            title_sk='<script>alert(1)</script> "páry"', html_sk='<p>A &lt;b&gt; &amp; "B"</p>'
        )
        _, html = self.preview('navody/commanderi/pary-pre-jazdu')
        self.assertNotIn('<script>', html)
        self.assertNotIn('<b>', html)
        self.assertIn('content="&lt;script&gt;alert(1)&lt;/script&gt; &quot;páry&quot;"', html)
        self.assertIn('<h1>&lt;script&gt;alert(1)&lt;/script&gt; &quot;páry&quot;</h1>', html)
        self.assertIn('<meta property="og:description" content="A &lt;b&gt; &amp; &quot;B&quot;">', html)

    def test_unpublished_or_unknown_guide_is_a_generic_404(self):
        Guide.objects.filter(pk=self.guide.pk).update(is_published=False)
        for path in ('navody/commanderi/pary-pre-jazdu', 'navody/commanderi/neexistuje'):
            with self.subTest(path):
                response, html = self.preview(path)
                self.assertEqual(response.status_code, 404)
                self.assertIn('<title>KD 1035 · Slovenské a české kráľovstvo v Rise of Kingdoms</title>', html)
                self.assertIn('<meta property="og:type" content="website">', html)
                self.assertIn('<meta property="og:url" content="http://testserver/">', html)
                self.assertEqual(response['X-Robots-Tag'], 'noindex')
                # nothing about the hidden guide leaks out
                for leak in ('Páry', 'jazdu', 'canonical', 'modified_time'):
                    self.assertNotIn(leak, html)

    def test_unparsable_path_is_a_generic_404_in_the_language_of_the_prefix(self):
        response, html = self.preview('cz/navody/commanderi')
        self.assertEqual(response.status_code, 404)
        self.assertIn('<html lang="cs">', html)
        self.assertIn('<title>KD 1035 · České a slovenské království v Rise of Kingdoms</title>', html)
        self.assertIn('<meta property="og:url" content="http://testserver/cz">', html)
        self.assertIn('<meta property="og:locale" content="cs_CZ">', html)

        response, html = self.preview('o-nas')
        self.assertEqual(response.status_code, 404)
        self.assertIn('<html lang="sk">', html)
        self.assertIn('<title>KD 1035 · Slovenské a české kráľovstvo v Rise of Kingdoms</title>', html)

    @override_settings(SITE_URL='https://kd1035.test')
    def test_urls_use_site_url(self):
        _, html = self.preview('cz/navody/commanderi/pary-pre-jazdu')
        self.assertIn('<link rel="canonical" href="https://kd1035.test/cz/navody/commanderi/pary-pre-jazdu">', html)
        self.assertIn('<meta property="og:url" content="https://kd1035.test/cz/navody/commanderi/pary-pre-jazdu">', html)
        self.assertIn('<meta property="og:image" content="https://kd1035.test/og-image.jpg">', html)
