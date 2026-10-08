from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from kingdom.permissions import SuperuserOnlyAdmin

from .models import Governor, Player

# Django admin colour variables, so the badge works in the admin's light and dark theme
STATUS_COLORS = {
    Governor.Status.PENDING: 'var(--message-warning-bg)',
    Governor.Status.APPROVED: 'var(--message-success-bg)',
    Governor.Status.REJECTED: 'var(--message-error-bg)',
}
# shown above the list – bulk actions skip the change form with its help texts
CHECK_IN_GAME = Governor._meta.get_field('status').help_text


@admin.register(Player)
class PlayerAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """Players appear by signing in with Discord; their Discord data is refreshed on every sign-in."""

    list_display = ['thumbnail', 'name', 'discord_id', 'created_at', 'last_login']
    list_display_links = ['name']
    list_select_related = ['user']
    search_fields = ['username', 'global_name', 'discord_id']
    fields = ['thumbnail', 'global_name', 'username', 'discord_id', 'avatar', 'user', 'created_at', 'last_login']
    readonly_fields = fields

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


@admin.register(Governor)
class GovernorAdmin(admin.ModelAdmin):
    """Registrations from /ucet. Normal model permissions (not superuser-only): group R4 may view and change them.

    R4 only judge a registration (status and note); what the player entered stays as it is.
    """

    list_display = ['name', 'governor_id', 'kind', 'alliance_tag', 'discord', 'status_badge', 'created_at']
    list_select_related = ['player', 'alliance']
    list_filter = ['status', 'kind', 'alliance']
    search_fields = ['name', 'governor_id', 'player__username', 'player__global_name']
    actions = ['approve', 'reject']
    # display methods instead of the foreign keys: the admin would link them to pages R4 may not open
    fields = [
        'name',
        'governor_id',
        'kind',
        'alliance_tag',
        'discord',
        'created_at',
        'status',
        'review_note',
        'reviewer',
        'reviewed_at',
    ]
    readonly_fields = [f for f in fields if f not in ('status', 'review_note')]

    def has_add_permission(self, request):
        return False  # entries come only from players

    def changelist_view(self, request, extra_context=None):
        return super().changelist_view(request, {'subtitle': CHECK_IN_GAME, **(extra_context or {})})

    @admin.display(description='aliancia', ordering='alliance__tag')
    def alliance_tag(self, obj):
        return f'[{obj.alliance.tag}]' if obj.alliance else '—'

    @admin.display(description='Discord', ordering='player__global_name')
    def discord(self, obj):
        """Display name linking to the Discord profile + the @username to find them on the server."""
        player = obj.player
        return format_html(
            '<a href="https://discord.com/users/{}" target="_blank" rel="noopener noreferrer">{}</a> '
            '<span class="quiet">@{}</span>',
            player.discord_id,
            player.name,
            player.username,
        )

    @admin.display(description='posúdil')
    def reviewer(self, obj):
        user = obj.reviewed_by
        return (user.first_name or user.username) if user else '—'

    @admin.display(description='stav', ordering='status')
    def status_badge(self, obj):
        return format_html(
            '<span style="padding:2px 8px;border-radius:9px;background:{};color:var(--body-fg);white-space:nowrap">'
            '{}</span>',
            STATUS_COLORS[obj.status],
            obj.get_status_display(),
        )

    def save_model(self, request, obj, form, change):
        if 'status' in form.changed_data:
            obj.reviewed_by, obj.reviewed_at = request.user, timezone.now()
        super().save_model(request, obj, form, change)

    def review(self, request, queryset, status, done):
        """Bulk approve / reject; skips entries whose Governor ID another entry claims (see Governor.clean)."""
        changed, conflicts = 0, []
        for governor in queryset.exclude(status=status).order_by('created_at'):
            # turning a rejected entry back on must not clash with a newer claim of the same ID
            if status != Governor.Status.REJECTED and Governor.is_taken(governor.governor_id, governor.pk):
                conflicts.append(str(governor))
                continue
            governor.status, governor.reviewed_by, governor.reviewed_at = status, request.user, timezone.now()
            fields = ['status', 'reviewed_by', 'reviewed_at', 'updated_at']
            if status == Governor.Status.APPROVED:
                governor.review_note = ''  # a reason from an earlier rejection no longer applies
                fields.append('review_note')
            governor.save(update_fields=fields)
            changed += 1
        self.message_user(request, f'{done}: {changed}', messages.SUCCESS)
        if conflicts:
            self.message_user(
                request,
                f'Nezmenené – Governor ID už má iný záznam, ktorý čaká alebo je schválený: {", ".join(conflicts)}',
                messages.WARNING,
            )

    @admin.action(description='Schváliť', permissions=['change'])
    def approve(self, request, queryset):
        self.review(request, queryset, Governor.Status.APPROVED, 'Schválené')

    @admin.action(description='Zamietnuť', permissions=['change'])
    def reject(self, request, queryset):
        self.review(request, queryset, Governor.Status.REJECTED, 'Zamietnuté')
