from datetime import UTC, date, datetime
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import resolve

from guides.views import link_preview

from . import preview
from .models import KingdomEvent

DAY = 24 * 60
GENERIC_SK = 'Kalendár eventov · KD 1035 Rise of Kingdoms CZ/SK'
DATED_SK = 'Kalendár eventov KD 1035 – termín v tvojom čase a pripomienka na Discorde.'


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def make_event(**kwargs):
    defaults = {'name_sk': 'Ruiny', 'starts_at': utc(2026, 10, 10, 18), 'repeat_days': 7, 'duration_minutes': 60}
    return KingdomEvent.objects.create(**{**defaults, **kwargs})


class DaysTextTests(SimpleTestCase):
    def test_formats(self):
        self.assertEqual(preview.days_text(date(2026, 10, 14), date(2026, 10, 14)), '14. 10. 2026')
        self.assertEqual(preview.days_text(date(2026, 10, 14), date(2026, 10, 19)), '14.–19. 10. 2026')
        self.assertEqual(preview.days_text(date(2026, 10, 30), date(2026, 11, 2)), '30. 10. – 2. 11. 2026')
        self.assertEqual(preview.days_text(date(2026, 12, 30), date(2027, 1, 2)), '30. 12. 2026 – 2. 1. 2027')

    def test_run_days_drop_the_night_tail(self):
        # 00:00 UTC to 00:00 UTC five days later = 02:00 to 02:00 in Bratislava: the last morning is not a game day
        self.assertEqual(preview.run_days(utc(2026, 10, 14), 5 * DAY), (date(2026, 10, 14), date(2026, 10, 18)))
        # an evening event past midnight stays on its day; no end = one day
        self.assertEqual(preview.run_days(utc(2026, 10, 14, 21), 120), (date(2026, 10, 14), date(2026, 10, 14)))
        self.assertEqual(preview.run_days(utc(2026, 10, 14, 18), 0), (date(2026, 10, 14), date(2026, 10, 14)))
        # a run that ends at 12:00 the next day takes that day too
        self.assertEqual(preview.run_days(utc(2026, 10, 14, 10), DAY), (date(2026, 10, 14), date(2026, 10, 15)))


# Saturday 10 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 10, 12))
@override_settings(SITE_URL='https://kd1035.test')
class EventPreviewTests(TestCase):
    """Calendar links for link-preview bots (nginx rewrites /[cz/]kalendar?event=<id> to /api/link-preview/…)."""

    def preview(self, path='kalendar', **params):
        response = self.client.get(f'/api/link-preview/{path}', params)
        return response, response.content.decode()

    def assertTitle(self, html, title):
        self.assertIn(f'<meta property="og:title" content="{title}">', html)
        self.assertIn(f'<title>{title} | KD 1035</title>', html)

    def test_dated_run_in_slovak(self, _now):
        # Ark of Osiris every 2 weeks from Wednesday 14 October 00:00 UTC, 5 days
        ark = make_event(name_sk='Ark of Osiris', starts_at=utc(2026, 10, 14), repeat_days=14, duration_minutes=5 * DAY)
        response, html = self.preview(event=ark.pk, on='2026-10-14')
        self.assertEqual(response.status_code, 200)
        self.assertIn('<html lang="sk">', html)
        self.assertTitle(html, 'Ark of Osiris · 14.–18. 10. 2026')
        self.assertIn(f'<meta property="og:description" content="{DATED_SK}">', html)
        url = f'https://kd1035.test/kalendar?event={ark.pk}&amp;on=2026-10-14'
        self.assertIn(f'<meta property="og:url" content="{url}">', html)
        self.assertIn('<meta property="og:image" content="https://kd1035.test/og-image.jpg">', html)
        self.assertIn('<meta property="og:type" content="website">', html)
        self.assertIn('<meta property="og:locale" content="sk_SK">', html)
        # a game event shows no clock, and the bot page is not a canonical page of its own
        self.assertNotIn('UTC', html)
        self.assertNotIn('canonical', html)
        self.assertEqual(response['Cache-Control'], 'public, max-age=300')
        self.assertEqual(response['X-Robots-Tag'], 'noindex')
        self.assertIn('User-Agent', response['Vary'])
        # a day in the middle of the run gives the same run (and a link to its first day), two weeks later the next one
        _, html = self.preview(event=ark.pk, on='2026-10-16')
        self.assertTitle(html, 'Ark of Osiris · 14.–18. 10. 2026')
        self.assertIn(url, html)
        _, html = self.preview(event=ark.pk, on='2026-10-28')
        self.assertTitle(html, 'Ark of Osiris · 28. 10. – 1. 11. 2026')

    def test_dated_run_in_czech(self, _now):
        mge = make_event(
            name_sk='MGE – Lukostrelci', name_cs='MGE – Lučištníci', starts_at=utc(2026, 10, 12), duration_minutes=DAY
        )
        response, html = self.preview('cz/kalendar/', event=mge.pk, on='2026-10-12')
        self.assertEqual(response.status_code, 200)
        self.assertIn('<html lang="cs">', html)
        self.assertTitle(html, 'MGE – Lučištníci · 12. 10. 2026')
        self.assertIn(
            '<meta property="og:description" content="Kalendář eventů KD 1035 – termín ve tvém čase a připomínka na '
            'Discordu.">',
            html,
        )
        self.assertIn(f'content="https://kd1035.test/cz/kalendar?event={mge.pk}&amp;on=2026-10-12"', html)
        self.assertIn('<meta property="og:locale" content="cs_CZ">', html)
        # without a Czech name the Slovak one
        KingdomEvent.objects.filter(pk=mge.pk).update(name_cs='')
        _, html = self.preview('cz/kalendar', event=mge.pk, on='2026-10-12')
        self.assertTitle(html, 'MGE – Lukostrelci · 12. 10. 2026')

    def test_short_irregular_event_shows_its_utc_time(self, _now):
        silk = make_event(name_sk='Silk Road', irregular=True, repeat_days=0, starts_at=utc(2026, 10, 14, 18))
        _, html = self.preview(event=silk.pk, on='2026-10-14')
        self.assertTitle(html, 'Silk Road · 14. 10. 2026 · 18:00 UTC')
        # a long irregular event (Karuak Ceremony, 3 days) shows only its days
        karuak = make_event(
            name_sk='Karuak Ceremony', irregular=True, repeat_days=0, starts_at=utc(2026, 10, 14), duration_minutes=4320
        )
        _, html = self.preview(event=karuak.pk, on='2026-10-14')
        self.assertTitle(html, 'Karuak Ceremony · 14.–16. 10. 2026')

    def test_without_a_day_the_next_run(self, _now):
        ruins = make_event(name_sk='Ruiny')
        response, html = self.preview(event=ruins.pk)
        self.assertEqual(response.status_code, 200)
        self.assertTitle(html, 'Ruiny · 10. 10. 2026')
        self.assertIn(f'content="https://kd1035.test/kalendar?event={ruins.pk}&amp;on=2026-10-10"', html)

    def test_irregular_event_without_a_date(self, _now):
        # an old start is only a placeholder of an irregular event without a date
        boss = make_event(name_sk='Karuak Boss', irregular=True, repeat_days=0, starts_at=utc(2026, 9, 1, 18))
        for params in ({}, {'on': '2026-09-01'}):
            with self.subTest(params=params):
                response, html = self.preview(event=boss.pk, **params)
                self.assertEqual(response.status_code, 200)
                self.assertTitle(html, 'Karuak Boss')
                self.assertIn('content="Ďalší termín oznámime v kalendári KD 1035."', html)
                self.assertIn(f'content="https://kd1035.test/kalendar?event={boss.pk}"', html)
        _, html = self.preview('cz/kalendar', event=boss.pk)
        self.assertIn('content="Další termín oznámíme v kalendáři KD 1035."', html)

    def test_hidden_inactive_or_unknown_event_is_a_generic_404(self, _now):
        visible = make_event(name_sk='Ruiny')
        hidden = make_event(name_sk='Tajný boss', show_on_web=False)
        inactive = make_event(name_sk='Vypnutý boss', is_active=False)
        cases = [
            {'event': hidden.pk, 'on': '2026-10-10'},
            {'event': inactive.pk, 'on': '2026-10-10'},
            {'event': hidden.pk},
            {'event': 999999, 'on': '2026-10-10'},
            {},
            {'event': ''},
            {'event': 'abc'},
            {'event': f'{visible.pk}a'},
            {'event': f'-{visible.pk}'},
            {'event': '1' * 30},
            {'event': visible.pk, 'on': ''},
            {'event': visible.pk, 'on': 'tomorrow'},
            {'event': visible.pk, 'on': '2026-02-30'},
            {'event': visible.pk, 'on': '20261010'},
            {'event': visible.pk, 'on': '2026-10-10T00:00'},
            {'event': visible.pk, 'on': '٢٠٢٦-١٠-١٠'},
            {'event': visible.pk, 'on': '9999-12-31'},  # well-formed, but the run lookup would overflow
            {'event': visible.pk, 'on': '0001-01-01'},
        ]
        for params in cases:
            with self.subTest(params=params):
                response, html = self.preview(**params)
                self.assertEqual(response.status_code, 404)
                self.assertIn(f'<title>{GENERIC_SK}</title>', html)
                self.assertIn(f'<meta property="og:title" content="{GENERIC_SK}">', html)
                self.assertIn('<meta property="og:url" content="https://kd1035.test/kalendar">', html)
                self.assertEqual(response['X-Robots-Tag'], 'noindex')
                self.assertIn('User-Agent', response['Vary'])
                for name in ('Ruiny', 'Tajný', 'Vypnutý'):
                    self.assertNotIn(name, html)
        response, html = self.preview('cz/kalendar', event=hidden.pk)
        self.assertEqual(response.status_code, 404)
        self.assertIn('<title>Kalendář eventů · KD 1035 Rise of Kingdoms CZ/SK</title>', html)
        self.assertNotIn('Tajný', html)

    def test_name_is_escaped(self, _now):
        event = make_event(name_sk='<script>alert(1)</script> & "boss"')
        _, html = self.preview(event=event.pk, on='2026-10-10')
        self.assertNotIn('<script>', html)
        self.assertIn('content="&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;boss&quot; · 10. 10. 2026"', html)
        self.assertIn('<h1>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;boss&quot; · 10. 10. 2026</h1>', html)

    def test_calendar_path_beats_the_guide_catch_all(self, _now):
        for path in ('/api/link-preview/kalendar', '/api/link-preview/kalendar/', '/api/link-preview/cz/kalendar'):
            with self.subTest(path=path):
                self.assertIs(resolve(path).func, preview.event_preview)
        # anything else still goes to the guide previews
        self.assertIs(resolve('/api/link-preview/kalendar/x').func, link_preview)
        self.assertIs(resolve('/api/link-preview/navody/commanderi/pary').func, link_preview)

    def test_only_get(self, _now):
        event = make_event()
        self.assertEqual(self.client.post(f'/api/link-preview/kalendar?event={event.pk}').status_code, 405)
