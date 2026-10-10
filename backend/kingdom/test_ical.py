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

    def test_single_run_file_is_unchanged(self):
        # byte for byte the file event_file() wrote before the feed shared its parts
        self.assertEqual(
            self.file(),
            'BEGIN:VCALENDAR\r\n'
            'VERSION:2.0\r\n'
            'PRODID:-//KD 1035//Kalendar//SK\r\n'
            'CALSCALE:GREGORIAN\r\n'
            'METHOD:PUBLISH\r\n'
            'BEGIN:VEVENT\r\n'
            'UID:7-20261014T000000Z@kd1035\r\n'
            'DTSTAMP:20261010T120000Z\r\n'
            'DTSTART:20261014T000000Z\r\n'
            'DTEND:20261019T000000Z\r\n'
            'SUMMARY:Ark of Osiris\r\n'
            'URL:https://kd1035.eu/kalendar?event=7&on=2026-10-14\r\n'
            'DESCRIPTION:Kingdom 1035\r\n'
            'END:VEVENT\r\n'
            'END:VCALENDAR\r\n',
        )

    def test_calendar_file(self):
        run = {
            'uid': 'x@kd1035',
            'name': 'Ruiny',
            'start': utc(2026, 10, 14),
            'end': None,
            'url': 'https://kd1035.eu/kalendar',
            'description': 'Kingdom 1035',
            'now': utc(2026, 10, 10),
        }
        text = ical.calendar_file([ical.vevent_lines(**run), ical.vevent_lines(**run)], name='KD 1035, eventy')
        lines = text.split('\r\n')
        # the same header as the file of one run
        self.assertEqual(lines[:5], ical.HEADER)
        for expected in (
            'X-WR-CALNAME:KD 1035\\, eventy',
            'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
            'X-PUBLISHED-TTL:PT6H',
        ):
            self.assertIn(expected, lines)
        self.assertEqual(text.count('BEGIN:VEVENT'), 2)
        self.assertTrue(text.endswith('END:VEVENT\r\nEND:VCALENDAR\r\n'))
        # an empty feed is still a valid calendar
        self.assertTrue(ical.calendar_file([], name='x').endswith('X-PUBLISHED-TTL:PT6H\r\nEND:VCALENDAR\r\n'))


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


def vevents(text: str) -> list[dict[str, str]]:
    """The VEVENTs of a feed as {property: value} (unfolded), checking that every BEGIN has its END."""
    found, current, stack = [], None, []
    for line in unfold(text).split('\r\n')[:-1]:
        key, _, value = line.partition(':')
        if key == 'BEGIN':
            stack.append(value)
            current = {} if value == 'VEVENT' else current
        elif key == 'END':
            assert stack.pop() == value, f'END:{value} without its BEGIN'
            if value == 'VEVENT':
                found.append(current)
                current = None
        elif current is not None:
            current[key] = value
    assert not stack, f'not closed: {stack}'
    return found


# Saturday 10 October 2026, 14:00 in Bratislava
@mock.patch('django.utils.timezone.now', return_value=utc(2026, 10, 10, 12))
@override_settings(SITE_URL='https://kd1035.test')
class CalendarFeedTests(TestCase):
    def setUp(self):
        # only the events of each test, whatever the seed migrations bring
        KingdomEvent.objects.all().delete()

    def get(self, **params):
        return self.client.get('/api/calendar.ics', params)

    def test_every_public_run_in_the_window(self, _now):
        # Ark every 2 weeks for 5 days: the run of 30 September is over, but still within the last two weeks
        ark = make_event(name_sk='Ark of Osiris', starts_at=utc(2026, 9, 30), repeat_days=14, duration_minutes=5 * DAY)
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/calendar; charset=utf-8')
        self.assertEqual(response['Content-Disposition'], 'inline; filename="kd1035.ics"')
        self.assertEqual(response['Cache-Control'], 'public, max-age=900')
        self.assertEqual(response['X-Robots-Tag'], 'noindex')
        self.assertNotIn('Cookie', response.get('Vary', ''))
        self.assertFalse(response.cookies)
        text = response.content.decode()
        self.assertNotIn('\n', text.replace('\r\n', ''))
        self.assertIn('\r\nX-WR-CALNAME:KD 1035 – eventy\r\n', text)
        self.assertNotIn('VALARM', text)
        runs = vevents(text)
        # 26 September (10 October − 14 days) to 9 December (+ 60 days): the runs from 30 September to 9 December
        self.assertEqual(
            [run['DTSTART'] for run in runs],
            [f'2026{day}T000000Z' for day in ('0930', '1014', '1028', '1111', '1125', '1209')],
        )
        first = runs[0]
        self.assertEqual(first['UID'], f'{ark.pk}-20260930T000000Z@kd1035')
        self.assertEqual(first['DTSTAMP'], '20261010T120000Z')
        self.assertEqual(first['DTEND'], '20261005T000000Z')
        self.assertEqual(first['SUMMARY'], 'Ark of Osiris')
        self.assertEqual(first['URL'], f'https://kd1035.test/kalendar?event={ark.pk}&on=2026-09-30')
        self.assertEqual(first['DESCRIPTION'], f'Kingdom 1035: {first["URL"]}')
        # a stable UID per run: a refreshed feed updates the runs instead of adding copies
        self.assertEqual(len({run['UID'] for run in runs}), len(runs))
        self.assertEqual(vevents(self.get().content.decode()), runs)

    def test_link_to_the_first_day_in_bratislava(self, _now):
        # 22:30 UTC is already the next day in Bratislava; no duration = no DTEND
        boss = make_event(name_sk='Boss', starts_at=utc(2026, 10, 12, 22, 30), repeat_days=7, duration_minutes=0)
        run = vevents(self.get().content.decode())[0]
        self.assertEqual(run['DTSTART'], '20261012T223000Z')
        self.assertNotIn('DTEND', run)
        self.assertTrue(run['URL'].endswith(f'/kalendar?event={boss.pk}&on=2026-10-13'))

    def test_hidden_inactive_and_daily_events_are_left_out(self, _now):
        make_event(name_sk='Ruiny')
        make_event(name_sk='Tajný boss', show_on_web=False)
        make_event(name_sk='Vypnutý boss', is_active=False)
        make_event(name_sk='Denný boss', repeat_days=1)
        text = unfold(self.get().content.decode())
        self.assertIn('SUMMARY:Ruiny\r\n', text)
        for name in ('Tajný', 'Vypnutý', 'Denný'):
            self.assertNotIn(name, text)

    def test_irregular_event_only_from_now(self, _now):
        karuak = make_event(
            name_sk='Karuak Ceremony', irregular=True, repeat_days=0, starts_at=utc(2026, 10, 14), duration_minutes=4320
        )
        self.assertEqual([run['DTSTART'] for run in vevents(self.get().content.decode())], ['20261014T000000Z'])
        # an old start is only a placeholder of an irregular event without a date
        karuak.starts_at = utc(2026, 10, 1)
        karuak.save()
        self.assertEqual(vevents(self.get().content.decode()), [])

    def test_czech_names_with_slovak_fallback(self, _now):
        make_event(name_sk='MGE – Lukostrelci', name_cs='MGE – Lučištníci', starts_at=utc(2026, 10, 12))
        make_event(name_sk='Ruiny', name_cs='', starts_at=utc(2026, 10, 13))
        text = self.get(lang='cs').content.decode()
        self.assertEqual({run['SUMMARY'] for run in vevents(text)}, {'MGE – Lučištníci', 'Ruiny'})
        self.assertIn('/cz/kalendar?event=', unfold(text))
        # only lang=cs is Czech: anything else, or nothing, is Slovak
        for params in ({}, {'lang': 'sk'}, {'lang': 'CS'}, {'lang': 'cz'}, {'lang': 'en'}):
            with self.subTest(params=params):
                text = unfold(self.get(**params).content.decode())
                self.assertIn('SUMMARY:MGE – Lukostrelci\r\n', text)
                self.assertNotIn('/cz/', text)

    def test_long_czech_name_folds_and_is_escaped(self, _now):
        name = 'Ruiny; fáze 1, boss – Lučištníci a Jízda ' * 4
        make_event(name_sk='Ruiny', name_cs=name)
        text = self.get(lang='cs').content.decode()
        for line in text.split('\r\n'):
            self.assertLessEqual(len(line.encode()), 75)
        self.assertEqual(vevents(text)[0]['SUMMARY'], name.replace(';', '\\;').replace(',', '\\,'))

    def test_number_of_runs_is_bounded(self, _now):
        # a dozen events every 2 days: 37 runs each in the 74 days – then the feed stops at MAX_OCCURRENCES
        for hour in range(12):
            make_event(name_sk=f'Boss {hour}', starts_at=utc(2026, 9, 26, hour), repeat_days=2)
        self.assertEqual(len(vevents(self.get().content.decode())), 12 * 37)
        with mock.patch('kingdom.views.MAX_OCCURRENCES', 50):
            runs = vevents(self.get().content.decode())
        self.assertEqual(len(runs), 50)
        # the soonest first: the window opens on 26 September at 12:00 UTC, those runs ended by then
        self.assertEqual(runs[0]['DTSTART'], '20260928T000000Z')

    def test_only_get(self, _now):
        self.assertEqual(self.client.post('/api/calendar.ics').status_code, 405)
