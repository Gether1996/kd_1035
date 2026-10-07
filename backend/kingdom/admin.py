from django.contrib import admin, messages

from .discord import deliver
from .models import Alliance, EventNotification, Officer, SocialLink


class OfficerInline(admin.TabularInline):
    model = Officer
    extra = 1
    fields = ['order', 'title_sk', 'title_cs', 'name', 'discord_id', 'discord_username']


@admin.register(Alliance)
class AllianceAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'order', 'is_active', 'updated_at']
    list_editable = ['order', 'is_active']
    inlines = [OfficerInline]


@admin.register(SocialLink)
class SocialLinkAdmin(admin.ModelAdmin):
    list_display = ['platform', 'url', 'is_active']
    list_editable = ['is_active']


class SuperuserOnly:
    """Mass notifications can only be planned by superusers."""

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(EventNotification)
class EventNotificationAdmin(SuperuserOnly, admin.ModelAdmin):
    list_display = ['title', 'send_at', 'status', 'sent_at']
    list_filter = ['status']
    search_fields = ['title', 'message']
    date_hierarchy = 'send_at'
    fields = ['title', 'message', 'send_at', 'mention_role', 'status', 'sent_at', 'error']
    readonly_fields = ['status', 'sent_at', 'error']
    actions = ['send_now', 'reschedule']

    def save_model(self, request, obj, form, change):
        # editing a failed notification plans it again
        if change and obj.status == EventNotification.Status.FAILED:
            obj.status, obj.error = EventNotification.Status.PENDING, ''
        super().save_model(request, obj, form, change)

    @admin.action(description='Odoslať na Discord hneď')
    def send_now(self, request, queryset):
        sent = sum(deliver(n) for n in queryset)
        failed = queryset.count() - sent
        if sent:
            self.message_user(request, f'Odoslané: {sent}', messages.SUCCESS)
        if failed:
            self.message_user(request, f'Neodoslané: {failed} – pozri stĺpec Chyba.', messages.ERROR)

    @admin.action(description='Znova naplánovať (stav Naplánovaná)')
    def reschedule(self, request, queryset):
        queryset.update(status=EventNotification.Status.PENDING, error='')
