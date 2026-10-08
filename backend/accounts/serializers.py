from rest_framework import serializers

from .models import Player


class ProfileSerializer(serializers.ModelSerializer):
    """What the player edits on /ucet: the in-game name (whitespace trimmed, empty clears it)."""

    class Meta:
        model = Player
        fields = ['ingame_name']
