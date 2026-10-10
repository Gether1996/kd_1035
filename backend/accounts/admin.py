from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User
from django.utils.html import format_html

from kingdom.models import REMINDER_CHOICES
from kingdom.permissions import SuperuserOnlyAdmin

from .models import EventReminder, Player, SentReminder
from .reminders import duration

# 'pri začiatku', 'deň vopred o 18:00'… – other times as '1 deň 6 h'
REMINDER_LABELS = dict(REMINDER_CHOICES)


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
        'remind_discord',
        'lang',
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

    # deleting a player removes the whole site account (the user), not just its Discord profile, and the admin
    # history about it – including the deletion entry the admin has just logged with the player's name
    def delete_model(self, request, obj):
        obj.delete_account()

    def delete_queryset(self, request, queryset):
        for player in queryset.select_related('user'):
            player.delete_account()



@admin.register(SentReminder)
class SentReminderAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """What the worker sent in the last 30 days and why a delivery failed (DMs closed, bot not on the server…)."""

    list_display = ['sent_at', 'player_name', 'event', 'occurrence', 'offset', 'channel', 'ok', 'error']
    list_filter = ['ok', 'channel', 'event']
    list_select_related = ['player', 'event']
    search_fields = ['player__username', 'player__global_name', 'player__ingame_name', 'event__name_sk']
    date_hierarchy = 'sent_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description='hráč', ordering='player__global_name')
    def player_name(self, obj):
        return obj.player.ingame_name or obj.player.name

admin.site.unregister(User)


@admin.register(User)
class PlayerUserAdmin(UserAdmin):
    """Django's users with the in-game name the player typed on /ucet (Discord accounts are discord_<id>)."""

    list_display = ['username', 'first_name', 'ingame_name', 'email', 'is_staff']
    list_select_related = ['player']
    search_fields = [*UserAdmin.search_fields, 'player__ingame_name']

    @admin.display(description='meno v hre', ordering='player__ingame_name')
    def ingame_name(self, obj):
        player = getattr(obj, 'player', None)
        return (player and player.ingame_name) or '—'


@admin.register(EventReminder)
class EventReminderAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """Who picked which event on the website – read only, players change it themselves on /pripomienky."""

    list_display = ['player_name', 'ingame_name', 'event', 'times', 'updated_at']
    list_filter = ['event']
    list_select_related = ['player', 'event']
    search_fields = ['player__username', 'player__global_name', 'player__ingame_name', 'event__name_sk']
    fields = ['player', 'event', 'times', 'created_at', 'updated_at']
    readonly_fields = fields

    def has_add_permission(self, request):
        return False

    # delete stays allowed (superuser): deleting a player or an event in the admin cascades to these rows, and the
    # admin refuses a delete that would remove objects the user may not delete
    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description='hráč', ordering='player__global_name')
    def player_name(self, obj):
        return obj.player.name

    @admin.display(description='meno v hre', ordering='player__ingame_name')
    def ingame_name(self, obj):
        return obj.player.ingame_name or '—'

    @admin.display(description='pripomenúť pred začiatkom')
    def times(self, obj):
        return ', '.join(REMINDER_LABELS.get(minutes) or duration(minutes, 'sk') for minutes in obj.offsets)
