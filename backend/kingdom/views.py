import re
from datetime import UTC, date, datetime, time, timedelta

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.http import require_GET
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from . import events, ical
from .event_icons import icon_url
from .models import Alliance, KingdomEvent, SocialLink
from .serializers import AllianceSerializer, SocialLinkSerializer

# the calendar page asks for a month grid (at most 6 weeks) and a day more on each side for other time zones
MAX_CALENDAR_DAYS = 62
MAX_OCCURRENCES = 500
DATE = re.compile(r'\d{4}-\d{2}-\d{2}')


@api_view(['GET'])
def health(request):
    return Response({'status': 'ok'})


class AllianceList(ListAPIView):
    serializer_class = AllianceSerializer
    queryset = Alliance.objects.filter(is_active=True).prefetch_related('officers')


class SocialLinkList(ListAPIView):
    serializer_class = SocialLinkSerializer
    queryset = SocialLink.objects.filter(is_active=True)


def iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def calendar_range(params) -> tuple[date, date]:
    """?from=YYYY-MM-DD&to=YYYY-MM-DD (both days included), by default the current month with the leading and
    trailing days of its weeks (Monday to Sunday)."""
    raw = params.get('from'), params.get('to')
    if raw == (None, None):
        today = timezone.localdate()
        first = today.replace(day=1)
        last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return first - timedelta(days=first.weekday()), last + timedelta(days=6 - last.weekday())
    try:
        if not all(value and DATE.fullmatch(value) for value in raw):
            raise ValueError
        first, last = map(date.fromisoformat, raw)
    except ValueError:  # one of them missing, malformed or impossible (2026-02-30)
        raise ValidationError({'detail': 'Zadaj from aj to v tvare RRRR-MM-DD.'}) from None
    if not 0 <= (last - first).days < MAX_CALENDAR_DAYS:
        raise ValidationError({'detail': f'Rozsah musí mať 1 až {MAX_CALENDAR_DAYS} dní (from ≤ to).'})
    return first, last


def guide_data(guide) -> dict | None:
    if not guide or not guide.is_published:
        return None
    return {'category': guide.category, 'slug': guide.slug, 'title_sk': guide.title_sk, 'title_cs': guide.title_cs}


def event_data(event: KingdomEvent) -> dict:
    """What anyone may see about an event – never the Discord text, roles or anything about players."""
    return {
        'id': event.pk,
        'name_sk': event.name_sk,
        'name_cs': event.name_cs,
        'icon': icon_url(event.icon),
        'offered': event.player_reminders or [],
        'guide': guide_data(event.guide),
    }


class EventCalendar(APIView):
    """Public calendar (/kalendar): occurrences of active events shown on the web that overlap the days asked for
    (Europe/Bratislava), a running multi-day event included, plus every irregular event with its next (or running)
    date – null while leadership has not announced one."""

    # public and the same for everyone: no session (a cache may keep it), nothing to protect with CSRF
    authentication_classes = []

    def get(self, request):
        first, last = calendar_range(request.query_params)
        start = datetime.combine(first, time.min, tzinfo=events.LOCAL_TZ)
        end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=events.LOCAL_TZ)
        visible = list(KingdomEvent.objects.filter(is_active=True, show_on_web=True).select_related('guide'))
        now = timezone.now()

        occurrences = []
        for begin, event in events.calendar(visible, start, end, MAX_OCCURRENCES, now):
            length = timedelta(minutes=event.duration_minutes)
            occurrences.append(
                {
                    **event_data(event),
                    'start': iso(begin),
                    'end': iso(begin + length) if length else None,
                    'repeat_days': event.repeat_days,
                    'irregular': event.irregular,
                }
            )
        # irregular events have no cycle: the calendar lists them all, the next date first, then those still waiting
        # (no date yet, or the last one is over – players may pick them in advance)
        irregular = []
        for event in visible:
            if not event.irregular:
                continue
            begin = next(events.overlapping(event, now), None)
            length = timedelta(minutes=event.duration_minutes)
            irregular.append(
                {
                    **event_data(event),
                    'start': iso(begin) if begin else None,
                    'end': iso(begin + length) if begin and length else None,
                }
            )
        irregular.sort(key=lambda e: (e['start'] is None, e['start'] or '', e['name_sk']))
        response = Response(
            {'from': first.isoformat(), 'to': last.isoformat(), 'occurrences': occurrences, 'irregular': irregular}
        )
        response['Cache-Control'] = 'public, max-age=300'
        return response



@require_GET
def event_ics(request, pk):
    """GET /api/events/<id>/ics?on=YYYY-MM-DD[&lang=cs] – the run of a public event shown on that day
    (Europe/Bratislava, normally its first day) as an .ics file for the visitor's own calendar.

    A hidden or inactive event, no run that day or a bad date is a bare 404 that names nothing.
    """
    raw = request.GET.get('on', '')
    try:
        day = date.fromisoformat(raw) if DATE.fullmatch(raw) else None
    except ValueError:  # 2026-02-30
        day = None
    event = KingdomEvent.objects.filter(pk=pk, is_active=True, show_on_web=True).first() if day else None
    begin = events.run_on(event, day) if event else None
    if begin is None:
        return HttpResponseNotFound(content_type='text/plain; charset=utf-8')

    cs = request.GET.get('lang') == 'cs'
    name = (cs and event.name_cs) or event.name_sk
    origin = settings.SITE_URL or f'{request.scheme}://{request.get_host()}'
    url = f'{origin}{"/cz" if cs else ""}/kalendar?event={event.pk}&on={day.isoformat()}'
    length = timedelta(minutes=event.duration_minutes)
    body = ical.event_file(
        uid=f'{event.pk}-{ical.stamp(begin)}@kd1035',
        name=name,
        start=begin,
        end=begin + length if length else None,
        url=url,
        description=f'Kingdom 1035: {url}',
        now=timezone.now(),
    )
    response = HttpResponse(body, content_type='text/calendar; charset=utf-8')
    filename = f'kd1035-{slugify(event.name_sk) or "event"}-{day.isoformat()}.ics'
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Cache-Control'] = 'public, max-age=300'
    response['X-Robots-Tag'] = 'noindex'
    return response
