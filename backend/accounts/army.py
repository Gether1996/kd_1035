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
