from datetime import timedelta

from rest_framework import serializers

from .meta.render import specialty_icon
from .models import Guide

# the guide page shows the next dates of the events linked to it (frontend guide-page "V kalendári")
MAX_GUIDE_EVENTS = 4


class GuideListSerializer(serializers.ModelSerializer):
    specialty_icon = serializers.SerializerMethodField()
    excerpt_sk = serializers.SerializerMethodField()
    excerpt_cs = serializers.SerializerMethodField()

    class Meta:
        model = Guide
        fields = [
            'slug', 'category', 'specialty', 'specialty_icon', 'title_sk', 'title_cs', 'excerpt_sk', 'excerpt_cs',
            'updated_at',
        ]  # fmt: skip

    def get_specialty_icon(self, obj):
        return specialty_icon(obj.specialty)

    def get_excerpt_sk(self, obj):
        return obj.excerpt('sk')

    def get_excerpt_cs(self, obj):
        return obj.excerpt('cs')


class GuideDetailSerializer(GuideListSerializer):
    events = serializers.SerializerMethodField()

    class Meta(GuideListSerializer.Meta):
        fields = GuideListSerializer.Meta.fields + ['html_sk', 'html_cs', 'events']

    def get_events(self, obj):
        """Active events shown on the web that link this guide, each with its running or next run (the calendar's
        rule) – soonest first, an irregular event without a date last. Only what /api/events/ shows anyone."""
        # kingdom depends on guides (KingdomEvent.guide), not the other way round
        from django.utils import timezone

        from kingdom import events
        from kingdom.event_icons import icon_url
        from kingdom.views import iso

        now = timezone.now()
        found = []
        for event in obj.kingdom_events.filter(is_active=True, show_on_web=True):
            begin = next(events.overlapping(event, now), None)
            if begin is None and not event.irregular:
                continue  # a one-off event that is over, or a cycle that ended
            length = timedelta(minutes=event.duration_minutes)
            found.append(
                {
                    'id': event.pk,
                    'name_sk': event.name_sk,
                    'name_cs': event.name_cs,
                    'icon': icon_url(event.icon),
                    'start': iso(begin) if begin else None,
                    'end': iso(begin + length) if begin and length else None,
                    'irregular': event.irregular,
                    'repeat_days': event.repeat_days,
                }
            )
        found.sort(key=lambda e: (e['start'] is None, e['start'] or '', e['name_sk']))
        return found[:MAX_GUIDE_EVENTS]
