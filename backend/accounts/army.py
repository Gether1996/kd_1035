"""The army fields a march and a KvK sign-up share (models.ArmyFields): the commander pair, the armament bonuses and the
build clicked together."""

from collections import Counter

from rest_framework import serializers

from guides import armory
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


# the inscription counts follow the inscriptions clicked together (Gether 12. 10. 2026) – typed counts are ignored
COUNTED = ('gold', 'blue', 'white')
# ATK, DEF and HP are required once the build is saved (0 counts); All DMG may stay empty = 0
REQUIRED_STATS = ('attack', 'defense', 'health')
BUILD_FIELDS = {'gear', 'formation', 'inscriptions'}


class BuildSerializer(ArmySerializer):
    """The army of a march and of a KvK sign-up, filled in the same way (Gether 12. 10. 2026): the commanders with
    their skill levels and the build clicked together (guides/armory.py) – gear, formation, inscriptions, the armament
    bonuses typed in the build editor. context: 'current' = the values saved (a change), 'creating' = a new one."""

    # the commanders' skill levels, four digits 1–5 (5555 = expertise)
    primary_skills = serializers.RegexField(r'^[1-5]{4}$', required=False)
    secondary_skills = serializers.RegexField(r'^[1-5]{4}$', required=False)
    gear = serializers.JSONField(required=False)
    formation = serializers.CharField(max_length=20, allow_blank=True, required=False)
    inscriptions = serializers.ListField(
        child=serializers.CharField(max_length=40), max_length=armory.MAX_INSCRIPTIONS, required=False
    )

    def validate_gear(self, value):
        """{slot: {item, crit?, iconic?}} → the same with every key; an item fits its slot, two accessories differ."""
        if not isinstance(value, dict) or set(value) - set(armory.MARCH_SLOTS):
            raise serializers.ValidationError('slots')
        items, gear = armory.items(), {}
        for slot in armory.MARCH_SLOTS:
            piece = value.get(slot)
            if piece is None:
                continue
            raw = piece.get('item') if isinstance(piece, dict) else None
            item = items.get(raw) if isinstance(raw, str) else None
            if not item or item['slot'] != armory.slot_of(slot):
                raise serializers.ValidationError(slot)
            crit, iconic = piece.get('crit', False), piece.get('iconic', 0)
            if type(crit) is not bool or type(iconic) is not int or not 0 <= iconic <= armory.ICONIC_MAX:
                raise serializers.ValidationError(slot)
            if iconic and not item.get('iconic'):
                raise serializers.ValidationError(slot)
            gear[slot] = {'item': item['id'], 'crit': crit, 'iconic': iconic}
        if 'accessory1' in gear and gear['accessory1']['item'] == gear.get('accessory2', {}).get('item'):
            raise serializers.ValidationError('accessory2')
        return gear

    def validate_formation(self, value):
        if value and value not in armory.formations():
            raise serializers.ValidationError('unknown')
        return value

    def to_internal_value(self, data):
        # counts sent along are ignored, valid or not
        if isinstance(data, dict):
            data = {key: value for key, value in data.items() if key not in COUNTED}
        return super().to_internal_value(data)

    def validate(self, data):
        data = super().validate(data)
        current = self.context.get('current') or {}
        creating = self.context.get('creating', not self.partial)
        # the inscriptions of the formation (its own ones) and the common ones, each once, two of each armament
        if 'formation' in data or 'inscriptions' in data:
            formation = data.get('formation', current.get('formation', ''))
            chosen = data.get('inscriptions', current.get('inscriptions', []))
            allowed = armory.formations().get(formation, set()) | armory.common_inscriptions()
            if len(set(chosen)) != len(chosen) or not set(chosen) <= allowed:
                raise serializers.ValidationError({'inscriptions': 'unknown'})
            pieces = Counter(armory.inscription_pieces()[i] for i in chosen)
            if any(count > armory.MAX_PER_PIECE for count in pieces.values()):
                raise serializers.ValidationError({'inscriptions': 'per_piece'})
        # the counts by colour: a new army starts at 0, a change of the inscriptions counts them again; one saved
        # before keeps its typed counts until its inscriptions change
        if creating:
            data.update(armory.counts(data.get('inscriptions', [])))
        elif 'inscriptions' in data and data['inscriptions'] != current.get('inscriptions', []):
            data.update(armory.counts(data['inscriptions']))
        # saving the build needs ATK, DEF and HP; a change may not clear one; All DMG may stay empty = 0
        building = bool(BUILD_FIELDS & data.keys())
        for field in REQUIRED_STATS:
            if (field in data and data[field] is None) or (building and data.get(field, current.get(field)) is None):
                raise serializers.ValidationError({field: 'required'})
        if building and data.get('damage', current.get('damage')) is None:
            data['damage'] = 0
        return data


def current_of(army) -> dict:
    """context['current'] of a saved march or sign-up"""
    if army is None:
        return {}
    fields = ('primary', 'secondary', 'formation', 'inscriptions', *REQUIRED_STATS, 'damage')
    return {field: getattr(army, field) for field in fields}
