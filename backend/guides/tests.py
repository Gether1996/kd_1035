import tempfile
from pathlib import Path

from django.test import TestCase, override_settings

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


class GuideApiTests(TestCase):
    def setUp(self):
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
