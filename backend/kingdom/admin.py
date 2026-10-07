from datetime import UTC, timedelta

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from .discord import deliver
from .events import HORIZON, LOCAL_TZ, replan, upcoming
from .models import REMINDER_CHOICES, Alliance, EventNotification, KingdomEvent, Officer, SocialLink
from .permissions import SuperuserOnlyAdmin

WEEKDAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']
REMINDER_LABELS = dict(REMINDER_CHOICES)
# fields whose change alters the planned reminders (web-only fields do not replan)
PLAN_FIELDS = {
    'name_sk',
    'message',
    'starts_at',
    'duration_minutes',
    'repeat_days',
    'until',
    'time_basis',
    'reminders',
    'mention_role_id',
    'mention_role',
    'notify_discord',
    'is_active',
}
REPLAN_NOTE = (
    'Po uložení sa budúce naplánované pripomienky tohto eventu vytvoria nanovo – ich ručné úpravy sa stratia. '
    'Odoslané, chybné a zrušené ostanú.'
)


def local_time(dt) -> str:
    """'Po 26. 10. 2026 20:00 · 19:00 UTC' – Bratislava time + UTC (with its own date when that differs)."""
    local, utc = dt.astimezone(LOCAL_TZ), dt.astimezone(UTC)
    text = f'{WEEKDAYS[local.weekday()]} {local.day}. {local.month}. {local.year} {local:%H:%M}'
    utc_text = f'{utc:%H:%M} UTC'
    if utc.date() != local.date():
        utc_text += f' ({WEEKDAYS[utc.weekday()]} {utc.day}. {utc.month}.)'
    return f'{text} · {utc_text}'


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


class KingdomEventForm(forms.ModelForm):
    reminders = forms.TypedMultipleChoiceField(
        label='Pripomienky',
        choices=REMINDER_CHOICES,
        coerce=int,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text='Kedy pred začiatkom poslať správu na Discord.',
    )

    class Meta:
        model = KingdomEvent
        fields = '__all__'
        widgets = {'message': forms.Textarea(attrs={'rows': 8, 'style': 'width:100%'})}

    def clean(self):
        data = super().clean()
        if data.get('notify_discord') and not data.get('reminders'):
            self.add_error('reminders', 'Vyber aspoň jednu pripomienku alebo vypni posielanie na Discord.')
        return data


@admin.register(KingdomEvent)
class KingdomEventAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    form = KingdomEventForm
    list_display = ['name_sk', 'next_occurrence', 'repeat_label', 'notify_discord', 'show_on_web', 'is_active']
    list_display_links = ['name_sk']
    list_editable = ['notify_discord', 'show_on_web', 'is_active']
    list_filter = ['is_active', 'notify_discord', 'time_basis']
    search_fields = ['name_sk', 'name_cs', 'message']
    readonly_fields = ['schedule']
    save_on_top = True
    fieldsets = [
        ('Event', {'fields': ['name_sk', 'name_cs', 'message', 'guide']}),
        (
            'Opakovanie',
            {'fields': ['starts_at', 'duration_minutes', 'repeat_days', 'until', 'time_basis', 'schedule']},
        ),
        (
            'Discord',
            {
                'fields': ['notify_discord', 'reminders', 'mention_role', 'mention_role_id'],
                'description': REPLAN_NOTE,
            },
        ),
        ('Web', {'fields': ['show_on_web', 'is_active']}),
    ]

    @admin.display(description='najbližší termín (Bratislava · UTC)')
    def next_occurrence(self, obj):
        dates = upcoming(obj, count=1)
        return local_time(dates[0]) if dates else '—'

    @admin.display(description='opakovanie')
    def repeat_label(self, obj):
        return {0: 'jednorazovo', 1: 'denne', 7: 'týždenne'}.get(obj.repeat_days, f'každých {obj.repeat_days} dní')

    @admin.display(description='Najbližšie termíny')
    def schedule(self, obj):
        """Preview of the next 5 occurrences and when each reminder goes out."""
        if not obj or not obj.pk:
            return 'Po uložení sa tu zobrazí rozpis termínov a pripomienok.'
        dates = upcoming(obj, count=5)
        if not dates:
            return 'Žiadne ďalšie termíny.'
        offsets = sorted(set(obj.reminders or []), reverse=True) if obj.notify_discord else []
        planned = {
            (n.occurrence_start, n.offset_minutes): n.get_status_display()
            for n in obj.notifications.filter(occurrence_start__in=dates)
        }
        now = timezone.now()

        def state(start, offset):
            if (start, offset) in planned:
                return f' – {planned[start, offset]}'
            return ' – čas už prešiel' if start - timedelta(minutes=offset) <= now else ''

        rows = []
        for start in dates:
            reminders = format_html_join(
                '',
                '<div>{}: {}{}</div>',
                (
                    (
                        REMINDER_LABELS.get(offset, f'{offset} min'),
                        local_time(start - timedelta(minutes=offset)),
                        state(start, offset),
                    )
                    for offset in offsets
                ),
            )
            rows.append((local_time(start), reminders or '—'))
        body = format_html_join('', '<tr><td>{}</td><td>{}</td></tr>', rows)
        # nowrap + horizontal scroll keeps every time on one line on a phone
        return format_html(
            '<div style="overflow-x:auto;max-width:100%"><table style="white-space:nowrap">'
            '<thead><tr><th>Začiatok (Bratislava · UTC)</th><th>Pripomienky na Discord</th></tr></thead>'
            '<tbody>{}</tbody></table></div><p class="help">Pripomienky sa vytvárajú {} h vopred.</p>',
            body,
            int(HORIZON.total_seconds() // 3600),
        )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if change and not PLAN_FIELDS & set(form.changed_data):
            return  # e.g. only "show on web" toggled – keep the planned reminders as they are
        planned = replan(obj)
        if not settings.DISCORD_WEBHOOK_URL:
            if obj.is_active and obj.notify_discord:
                self.message_user(request, 'Webhook nie je nastavený – pripomienky sa neplánujú.', messages.WARNING)
        elif planned:
            self.message_user(request, f'{obj}: naplánované pripomienky na Discord: {planned}', messages.SUCCESS)


@admin.register(EventNotification)
class EventNotificationAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    list_display = ['title', 'send_at', 'status', 'event', 'sent_at']
    list_filter = ['status', 'event']
    search_fields = ['title', 'message']
    date_hierarchy = 'send_at'
    readonly_fields = ['status', 'sent_at', 'error', 'event', 'occurrence_start', 'offset_minutes']
    actions = ['send_now', 'reschedule', 'cancel']

    def get_fieldsets(self, request, obj=None):
        fields = ['title', 'message', 'send_at', 'event_start', 'mention_role', 'mention_role_id']
        fieldsets = [(None, {'fields': fields + ['status', 'sent_at', 'error']})]
        if obj and obj.event_id:
            generated = {'fields': ['event', 'occurrence_start', 'offset_minutes'], 'description': REPLAN_NOTE}
            fieldsets.append(('Z opakovaného eventu', generated))
        return fieldsets

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

    @admin.action(description='Zrušiť (neposielať)')
    def cancel(self, request, queryset):
        cancelled = queryset.filter(status=EventNotification.Status.PENDING).update(
            status=EventNotification.Status.CANCELLED
        )
        self.message_user(request, f'Zrušené: {cancelled}', messages.SUCCESS)
