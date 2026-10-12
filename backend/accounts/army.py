"""The army fields a march and a KvK sign-up share (models.ArmyFields): the commander pair and the armament bonuses."""

from rest_framework import serializers

from guides.roster import march_commanders

from .models import BONUS_MAX, STAT_MAX


def stat_field():
    """A number of inscriptions: two digits at most; null = not filled in."""
    return serializers.IntegerField(min_value=0, max_value=STAT_MAX, allow_null=True, required=False)


def bonus_field():
    """An armament bonus in percent with one decimal at most (12.5); null = not filled in."""
    return serializers.DecimalField(
        max_digits=3, decimal_places=1, min_value=0, max_value=BONUS_MAX, allow_null=True, required=False, coerce_to_string=False
    )


class ArmySerializer(serializers.Serializer):
    primary = serializers.CharField(max_length=40, allow_blank=True, required=False)
    secondary = serializers.CharField(max_length=40, allow_blank=True, required=False)
    attack = bonus_field()
    defense = bonus_field()
    health = bonus_field()
    damage = bonus_field()
    white = stat_field()
    blue = stat_field()
    gold = stat_field()

    def validate(self, data):
        """Only the commanders offered in the picker (guides/roster.py, pick=True). One left out later (golden keys,
        gatherers, epic) stays allowed where it is already saved – context['current'] = {'primary': …, 'secondary': …}
        of the march or sign-up being changed."""
        offered = {c['name'] for c in march_commanders() if c['pick']}
        current = self.context.get('current') or {}
        for field in ('primary', 'secondary'):
            name = data.get(field)
            if name and name not in offered and name != current.get(field):
                raise serializers.ValidationError({field: 'unknown'})
        return data
