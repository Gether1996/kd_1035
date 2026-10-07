from rest_framework import serializers

from .models import Alliance, Officer, SocialLink


class OfficerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Officer
        fields = ['name', 'title_sk', 'title_cs', 'discord_id', 'discord_username']


class AllianceSerializer(serializers.ModelSerializer):
    officers = OfficerSerializer(many=True, read_only=True)

    class Meta:
        model = Alliance
        fields = ['id', 'tag', 'name', 'officers']


class SocialLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialLink
        fields = ['platform', 'url']
