from rest_framework import serializers

from kingdom.models import is_reminder_minutes, lead_order

from .models import MAX_PLAYER_REMINDERS, Player


class ProfileSerializer(serializers.ModelSerializer):
    """What the player edits on /ucet: the in-game name (whitespace trimmed, empty clears it)."""

    class Meta:
        model = Player
        fields = ['ingame_name']


class Minutes(serializers.IntegerField):
    """Whole minutes 0–10080 or EVENING_BEFORE as a JSON number only – no "10", 10.0 or true."""

    default_error_messages = {'range': 'Minúty od 0 do 7 dní alebo deň vopred o 18:00.'}

    def to_internal_value(self, data):
        if type(data) is not int:
            self.fail('invalid')
        if not is_reminder_minutes(data):
            self.fail('range')
        return data


class OffsetsSerializer(serializers.Serializer):
    """PUT /api/me/reminders/<event>/: any times the player wants (also their own, not only the offered ones)."""

    offsets = serializers.ListField(
        child=Minutes(),
        min_length=1,
        max_length=MAX_PLAYER_REMINDERS,
    )

    def validate_offsets(self, value):
        return sorted(set(value), key=lead_order, reverse=True)


class ReminderSettingsSerializer(serializers.ModelSerializer):
    """PATCH /api/me/reminders/: Discord DMs on/off and the language of the messages."""

    discord = serializers.BooleanField(source='remind_discord', required=False)

    class Meta:
        model = Player
        fields = ['discord', 'lang']
