from rest_framework import serializers

from kingdom.models import MAX_REMINDER_MINUTES

from .models import MAX_PLAYER_REMINDERS, Player


class ProfileSerializer(serializers.ModelSerializer):
    """What the player edits on /ucet: the in-game name (whitespace trimmed, empty clears it)."""

    class Meta:
        model = Player
        fields = ['ingame_name']


class Minutes(serializers.IntegerField):
    """Whole minutes as a JSON number only – no "10", 10.0 or true."""

    def to_internal_value(self, data):
        if type(data) is not int:
            self.fail('invalid')
        return super().to_internal_value(data)


class OffsetsSerializer(serializers.Serializer):
    """PUT /api/me/reminders/<event>/: any times the player wants (also their own, not only the offered ones)."""

    offsets = serializers.ListField(
        child=Minutes(min_value=0, max_value=MAX_REMINDER_MINUTES),
        min_length=1,
        max_length=MAX_PLAYER_REMINDERS,
    )

    def validate_offsets(self, value):
        return sorted(set(value), reverse=True)


class ReminderSettingsSerializer(serializers.ModelSerializer):
    """PATCH /api/me/reminders/: Discord DMs on/off and the language of the messages."""

    discord = serializers.BooleanField(source='remind_discord', required=False)

    class Meta:
        model = Player
        fields = ['discord', 'lang']
