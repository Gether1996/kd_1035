"""The army fields a march and a KvK sign-up share (models.ArmyFields): the commander pair and the armament bonuses."""

from rest_framework import serializers

from guides.roster import march_commanders

from .models import STAT_MAX


def stat_field():
    """Whole percent rounded up, or a number of inscriptions: two digits at most; null = not filled in."""
    return serializers.IntegerField(min_value=0, max_value=STAT_MAX, allow_null=True, required=False)


class ArmySerializer(serializers.Serializer):
    primary = serializers.CharField(max_length=40, allow_blank=True, required=False)
    secondary = serializers.CharField(max_length=40, allow_blank=True, required=False)
    attack = stat_field()
    defense = stat_field()
    health = stat_field()
    damage = stat_field()
    white = stat_field()
    blue = stat_field()
    gold = stat_field()

    def validate(self, data):
        # only commanders with a portrait: guides/roster.py and our guides (a march saved before a commander was
        # excluded can still be edited)
        known = {c['name'] for c in march_commanders()}
        for field in ('primary', 'secondary'):
            if data.get(field) and data[field] not in known:
                raise serializers.ValidationError({field: 'unknown'})
        return data
