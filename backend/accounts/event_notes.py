"""The superadmin's notes to events (Gether 12. 11. 2026: "ku eventu 20 GH … viaceré poznámky, nech si to drží aj
históriu, lebo každý raz píšem email s poradím hráčov"), written in the calendar's event dialog.

/api/events/manage/<event id>/notes/ – GET every note of the event (the newest run first), POST {text, run_start?}
/api/events/manage/notes/<note id>/  – PATCH {text?, run_start?}, DELETE
Superusers only, session + CSRF like the rest of the event management (kingdom/manage_api.py).
"""

from datetime import UTC

from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from kingdom.manage_api import IsSuperuser
from kingdom.models import KingdomEvent
from kingdom.views import iso

from .models import MAX_EVENT_NOTE, EventNote


class NoteSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=MAX_EVENT_NOTE, trim_whitespace=True)
    # the run the note is about; null = the event in general
    run_start = serializers.DateTimeField(allow_null=True, required=False, default=None)

    def validate_run_start(self, value):
        return value.astimezone(UTC) if value else None


def note_data(note: EventNote) -> dict:
    return {
        'id': note.pk,
        'run_start': iso(note.run_start) if note.run_start else None,
        'text': note.text,
        'created_at': iso(note.created_at),
        'updated_at': iso(note.updated_at),
    }


@never_cache
@api_view(['GET', 'POST'])
@permission_classes([IsSuperuser])
def notes(request, pk):
    event = get_object_or_404(KingdomEvent, pk=pk)
    if request.method == 'POST':
        form = NoteSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        note = EventNote.objects.create(event=event, author=request.user, **form.validated_data)
        return Response(note_data(note), status=status.HTTP_201_CREATED)
    return Response({'notes': [note_data(n) for n in event.notes.all()]})


@never_cache
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsSuperuser])
def note(request, note_id):
    found = get_object_or_404(EventNote, pk=note_id)
    if request.method == 'DELETE':
        found.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    form = NoteSerializer(data=request.data, partial=True)
    form.is_valid(raise_exception=True)
    for field, value in form.validated_data.items():
        setattr(found, field, value)
    found.save()
    return Response(note_data(found))
