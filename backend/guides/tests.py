import tempfile
from datetime import UTC, datetime
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from .meta import LAST_UPDATE, MODULES
from .meta.render import render, verified_note
from .meta.sync import rendered_guides, sync_guides
from .models import Guide
from .sanitize import clean_html


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
        self.assertIn('<iframe src="https://www.youtube.com/embed/abc"></iframe>', html)
        self.assertIn('<iframe></iframe>', html)


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
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'commanderi']), 10)
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'vybava']), 7)
        self.assertGreaterEqual(len([g for g in guides if g['category'] == 'eventy']), 10)
        for data in guides:
            self.assertIn(data['category'], Guide.Category.values)
            self.assertNotEqual(data['html_sk'], data['html_cs'], data['slug'])
            guide = Guide(**data)
            for lang in ('sk', 'cs'):
                self.assertTrue(0 < len(guide.excerpt(lang)) <= 160, data['slug'])

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
        self.assertEqual(data[0]['excerpt_sk'], 'Text SK')
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
        self.assertNotIn('skryty', xml)
