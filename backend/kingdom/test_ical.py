from datetime import UTC, datetime
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings

from . import ical
from .models import KingdomEvent

DAY = 24 * 60


def utc(*args):
    return datetime(*args, tzinfo=UTC)


def make_event(**kwargs):
    defaults = {'name_sk': 'Ruiny', 'starts_at': utc(2026, 10, 10, 18), 'repeat_days': 7, 'duration_minutes': 60}
    return KingdomEvent.objects.create(**{**defaults, **kwargs})


def unfold(text: str) -> str:
    return text.replace('\r\n ', '')


class IcalFormatTests(SimpleTestCase):
    def file(self, **kwargs):
        defaults = {
            'uid': '7-20261014T000000Z@kd1035',
            'name': 'Ark of Osiris',
            'start': utc(2026, 10, 14),
            'end': utc(2026, 10, 19),
            'url': 'https://kd1035.eu/kalendar?event=7&on=2026-10-14',
            'description': 'Kingdom 1035',
            'now': utc(2026, 10, 10, 12),
        }
        return ical.event_file(**{**defaults, **kwargs})

    def test_one_event_in_utc_with_crlf(self):
        text = self.file()
        self.assertTrue(text.endswith('END:VCALENDAR\r\n'))
        # every line break is CRLF – no bare LF
        self.assertNotIn('\n', text.replace('\r\n', ''))
        lines = text.split('\r\n')
        for expected in (
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//KD 1035//Kalendar//SK',
            'UID:7-20261014T000000Z@kd1035',
            'DTSTAMP:20261010T120000Z',
            'DTSTART:20261014T000000Z',
            'DTEND:20261019T000000Z',
            'SUMMARY:Ark of Osiris',
            'URL:https://kd1035.eu/kalendar?event=7&on=2026-10-14',
        ):
            self.assertIn(expected, lines)
        self.assertEqual(text.count('BEGIN:VEVENT'), 1)

    def test_no_end_without_a_duration(self):
        self.assertNotIn('DTEND', self.file(end=None))

    def test_text_is_escaped(self):
        self.assertEqual(ical.escape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
        self.assertIn('SUMMARY:Ruiny\\, fáza 1\\; boss\\\\2', self.file(name='Ruiny, fáza 1; boss\\2'))

    def test_folding_at_75_octets_keeps_utf8_whole(self):
        name = 'MGE – Lučištníci ' * 8
        text = self.file(name=name)
        for line in text.split('\r\n'):
            # each physical line is valid UTF-8 on its own and at most 75 octets
            self.assertLessEqual(len(line.encode()), 75)
            line.encode().decode()
        self.assertIn(f'SUMMARY:{name}', unfold(text))
        self.assertEqual(ical.fold('x' * 75), 'x' * 75)
        self.assertEqual(ical.fold('x' * 76), 'x' * 75 + '\r\n x')
        # 'č' is two octets: it moves to the next line instead of being split
        self.assertEqual(ical.fold('x' * 74 + 'č'), 'x' * 74 + '\r\n č')


# Saturday 10 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 10, 12))
@override_settings(SITE_URL='https://kd1035.test')
class EventIcsTests(TestCase):
    def get(self, event_id, **params):
        return self.client.get(f'/api/events/{event_id}/ics', params)

    def test_downloads_the_run_of_that_day(self, _now):
        # Ark of Osiris every 2 weeks from Wednesday 14 October 00:00 UTC, 5 days
        ark = make_event(name_sk='Ark of Osiris', starts_at=utc(2026, 10, 14), repeat_days=14, duration_minutes=5 * DAY)
        response = self.get(ark.pk, on='2026-10-14')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/calendar; charset=utf-8')
        self.assertEqual(response['Content-Disposition'], 'attachment; filename="kd1035-ark-of-osiris-2026-10-14.ics"')
        self.assertNotIn('Cookie', response.get('Vary', ''))
        text = unfold(response.content.decode())
        self.assertIn(f'UID:{ark.pk}-20261014T000000Z@kd1035\r\n', text)
        self.assertIn('DTSTART:20261014T000000Z\r\nDTEND:20261019T000000Z\r\n', text)
        self.assertIn(f'URL:https://kd1035.test/kalendar?event={ark.pk}&on=2026-10-14\r\n', text)
        # a day in the middle of the run gives the same run; two weeks later the next one
        self.assertIn('DTSTART:20261014T000000Z', self.get(ark.pk, on='2026-10-16').content.decode())
        self.assertIn('DTSTART:20261028T000000Z', self.get(ark.pk, on='2026-10-28').content.decode())

    def test_czech_name_and_link(self, _now):
        mge = make_event(name_sk='MGE – Lukostrelci', name_cs='MGE – Lučištníci', starts_at=utc(2026, 10, 12))
        response = self.get(mge.pk, on='2026-10-12', lang='cs')
        text = unfold(response.content.decode())
        self.assertIn('SUMMARY:MGE – Lučištníci\r\n', text)
        self.assertIn(f'/cz/kalendar?event={mge.pk}&on=2026-10-12', text)
        # the file name stays ASCII
        self.assertIn('filename="kd1035-mge-lukostrelci-2026-10-12.ics"', response['Content-Disposition'])

    def test_irregular_run_only_while_ahead_or_running(self, _now):
        karuak = make_event(
            name_sk='Karuak Ceremony', irregular=True, repeat_days=0, starts_at=utc(2026, 10, 14), duration_minutes=4320
        )
        self.assertEqual(self.get(karuak.pk, on='2026-10-14').status_code, 200)
        # an old start is only a placeholder of an irregular event without a date
        karuak.starts_at = utc(2026, 9, 1)
        karuak.save()
        self.assertEqual(self.get(karuak.pk, on='2026-09-01').status_code, 404)

    def test_not_found_names_nothing(self, _now):
        visible = make_event(name_sk='Ruiny')
        hidden = make_event(name_sk='Tajný boss', show_on_web=False)
        inactive = make_event(name_sk='Vypnutý boss', is_active=False)
        cases = [
            (hidden.pk, {'on': '2026-10-10'}),
            (inactive.pk, {'on': '2026-10-10'}),
            (visible.pk, {}),
            (visible.pk, {'on': 'tomorrow'}),
            (visible.pk, {'on': '2026-02-30'}),
            (visible.pk, {'on': '20261010'}),
            (visible.pk, {'on': '2026-10-11'}),  # no run that day
            (999999, {'on': '2026-10-10'}),
        ]
        for event_id, params in cases:
            with self.subTest(event_id=event_id, params=params):
                response = self.get(event_id, **params)
                self.assertEqual(response.status_code, 404)
                for name in ('Ruiny', 'Tajný', 'Vypnutý'):
                    self.assertNotIn(name, response.content.decode())
        self.assertEqual(self.get(visible.pk, on='2026-10-10').status_code, 200)

    def test_only_get(self, _now):
        event = make_event()
        self.assertEqual(self.client.post(f'/api/events/{event.pk}/ics?on=2026-10-10').status_code, 405)
