from rest_framework import serializers

from kingdom.models import Alliance

from .models import Governor


class AllianceTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alliance
        fields = ['id', 'tag']


class GovernorSerializer(serializers.ModelSerializer):
    """A player's own registration as /ucet shows it."""

    alliance = AllianceTagSerializer(read_only=True)

    class Meta:
        model = Governor
        fields = ['id', 'governor_id', 'name', 'kind', 'alliance', 'status', 'review_note', 'created_at']


class GovernorInputSerializer(serializers.Serializer):
    """A new registration. Field errors are turned into stable codes for the website texts (views.GovernorList)."""

    governor_id = serializers.RegexField(r'^[0-9]{6,12}$')
    name = serializers.CharField(max_length=Governor._meta.get_field('name').max_length)  # whitespace trimmed
    kind = serializers.ChoiceField(choices=Governor.Kind.choices, default=Governor.Kind.MAIN)
    # null = other alliance or none
    alliance = serializers.PrimaryKeyRelatedField(
        queryset=Alliance.objects.filter(is_active=True), allow_null=True, default=None
    )
