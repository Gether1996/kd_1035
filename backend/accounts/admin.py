from django.contrib import admin
from django.utils.html import format_html

from kingdom.permissions import SuperuserOnlyAdmin

from .models import Player


@admin.register(Player)
class PlayerAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """Players appear by signing in with Discord; their Discord data is refreshed on every sign-in. Only the in-game
    name (typed by the player) can be corrected here."""

    list_display = ['thumbnail', 'name', 'ingame_name', 'discord_id', 'created_at', 'last_login']
    list_display_links = ['name']
    list_select_related = ['user']
    search_fields = ['username', 'global_name', 'ingame_name', 'discord_id']
    fields = [
        'thumbnail',
        'global_name',
        'username',
        'ingame_name',
        'discord_id',
        'avatar',
        'user',
        'created_at',
        'last_login',
    ]
    readonly_fields = [f for f in fields if f != 'ingame_name']

    def has_add_permission(self, request):
        return False

    @admin.display(description='')
    def thumbnail(self, obj):
        return format_html(
            '<img src="{}" alt="" width="32" height="32" style="display:block;border-radius:50%">', obj.avatar_url
        )

    @admin.display(description='meno', ordering='global_name')
    def name(self, obj):
        return obj.name

    @admin.display(description='posledné prihlásenie', ordering='user__last_login')
    def last_login(self, obj):
        return obj.user.last_login

    # deleting a player removes the whole site account (the user), not just its Discord profile
    def delete_model(self, request, obj):
        obj.user.delete()

    def delete_queryset(self, request, queryset):
        for player in queryset.select_related('user'):
            player.user.delete()

