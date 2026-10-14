from decimal import Decimal

from rest_framework import serializers

from kingdom.models import is_reminder_minutes, lead_order

from .models import MAX_PLAYER_REMINDERS, Player, PlayerEvaluation


class ProfileSerializer(serializers.ModelSerializer):
    """What the player edits on /ucet: the in-game name (whitespace trimmed; required since 11. 10. 2026 (Gether) –
    it can be changed, not cleared) and the current power in millions, null = not written down. The power is the one of
    the KvK evaluation (Gether 14. 10. 2026: "aktuálna power, to isté ako vo vyhodnocovaní") – the superadmin may
    have written it down already."""

    power = serializers.DecimalField(
        max_digits=6,
        decimal_places=1,
        min_value=Decimal('0'),
        max_value=Decimal('9999.9'),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Player
        fields = ['ingame_name', 'power']
        extra_kwargs = {'ingame_name': {'allow_blank': False}}

    def update(self, instance, validated_data):
        if 'power' in validated_data:
            power = validated_data.pop('power')
            PlayerEvaluation.objects.update_or_create(player=instance, defaults={'power': power})
        return super().update(instance, validated_data)


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
