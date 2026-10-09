import re
from datetime import UTC, timedelta

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Count
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from . import event_icons
from .discord import MAX_DELAY, deliver
from .events import HORIZON, LOCAL_TZ, replan, upcoming
from .models import (
    MAX_OFFERED_REMINDERS,
    MAX_REMINDER_MINUTES,
    REMINDER_CHOICES,
    TWIN_EVENT_ERROR,
    Alliance,
    EventNotification,
    KingdomEvent,
    Officer,
    SocialLink,
    default_player_reminders,
)
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


def local_parts(dt) -> tuple[str, str, str]:
    """('Po 26. 10. 2026', '20:00 · 19:00 UTC', '') – Bratislava date, its time + UTC, and the UTC date when that
    differs ('(Ne 25. 10.)')."""
    local, utc = dt.astimezone(LOCAL_TZ), dt.astimezone(UTC)
    day = f'{WEEKDAYS[local.weekday()]} {local.day}. {local.month}. {local.year}'
    utc_day = f'({WEEKDAYS[utc.weekday()]} {utc.day}. {utc.month}.)' if utc.date() != local.date() else ''
    return day, f'{local:%H:%M} · {utc:%H:%M} UTC', utc_day


def local_time(dt) -> str:
    """'Po 26. 10. 2026 20:00 · 19:00 UTC' – Bratislava time + UTC (with its own date when that differs)."""
    return ' '.join(part for part in local_parts(dt) if part)


def repeat_text(days: int) -> str:
    """'denne', 'každé 3 dni', 'každých 5 dní', 'týždenne', 'každé 2 týždne', 'každých 8 týždňov'…"""
    if days in (0, 1, 7):
        return {0: 'jednorazovo', 1: 'denne', 7: 'týždenne'}[days]
    count, few, many = (days // 7, 'týždne', 'týždňov') if days % 7 == 0 else (days, 'dni', 'dní')
    # Slovak plural: 2–4 'každé … dni / týždne', 5 and more 'každých … dní / týždňov'
    return f'každé {count} {few}' if count <= 4 else f'každých {count} {many}'


class OfficerInline(admin.TabularInline):
    model = Officer
    extra = 1
    fields = ['order', 'title_sk', 'title_cs', 'name', 'discord_id', 'discord_username']


@admin.register(Alliance)
class AllianceAdmin(admin.ModelAdmin):
    """The kingdom has exactly one main alliance (Gether): it cannot be added twice or deleted, the list opens it."""

    fields = ['tag', 'name', 'is_active']
    inlines = [OfficerInline]

    def changelist_view(self, request, extra_context=None):
        alliance = Alliance.objects.first()
        if alliance and self.has_change_permission(request, alliance):
            return redirect('admin:kingdom_alliance_change', alliance.pk)
        return super().changelist_view(request, extra_context)

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not Alliance.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SocialLink)
class SocialLinkAdmin(admin.ModelAdmin):
    list_display = ['platform', 'url', 'is_active']
    list_editable = ['is_active']


class MinutesField(forms.CharField):
    """A JSON list of minutes typed as plain text: '10, 60, 1440' ↔ [10, 60, 1440] (sorted, duplicates dropped)."""

    def prepare_value(self, value):
        return ', '.join(map(str, value)) if isinstance(value, list) else value

    def to_python(self, value):
        text = super().to_python(value)
        parts = [p for p in re.split(r'[\s,;]+', text) if p]
        if not all(re.fullmatch(r'[0-9]{1,5}', p) for p in parts):
            raise forms.ValidationError('Napíš celé minúty oddelené čiarkou, napr. 10, 60, 1440.')
        minutes = sorted({int(p) for p in parts})
        if minutes and minutes[-1] > MAX_REMINDER_MINUTES:
            raise forms.ValidationError(f'Najviac {MAX_REMINDER_MINUTES} minút (7 dní).')
        if len(minutes) > MAX_OFFERED_REMINDERS:
            raise forms.ValidationError(f'Najviac {MAX_OFFERED_REMINDERS} časov.')
        return minutes


class KingdomEventForm(forms.ModelForm):
    icon = forms.ChoiceField(
        label='Ikona',
        choices=event_icons.choices,
        required=False,
        help_text='Ikona v kalendári a v pripomienkach na webe. Nový event ju dostane podľa názvu; bez ikony web ukáže '
        'monogram. Ďalšie ikony: manage.py fetch_event_icons.',
    )
    reminders = forms.TypedMultipleChoiceField(
        label='Pripomienky',
        choices=REMINDER_CHOICES,
        coerce=int,
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text='Kedy pred začiatkom poslať správu na Discord.',
    )
    player_reminders = MinutesField(
        label='Časy pre hráčov',
        required=False,
        initial=default_player_reminders,  # a declared field does not take the model default by itself
        widget=forms.TextInput(attrs={'placeholder': '10, 60', 'inputmode': 'numeric'}),
        help_text='Minúty pred začiatkom oddelené čiarkou, napr. 10, 60, 1440 (= 1 deň). Najviac 6, od 0 do 10080 '
        '(7 dní). Hráč si ich vyberie na webe v časti Pripomienky eventov a môže si zadať aj vlastný čas.',
    )

    class Meta:
        model = KingdomEvent
        fields = '__all__'
        widgets = {'message': forms.Textarea(attrs={'rows': 8, 'style': 'width:100%'})}

    def clean(self):
        data = super().clean()
        if data.get('notify_discord') and not data.get('reminders'):
            self.add_error('reminders', 'Vyber aspoň jednu pripomienku alebo vypni posielanie na Discord.')
        # a second active event with the same name and start is refused by KingdomEvent.clean() (also in the list)
        return data


class KingdomEventListFormSet(forms.BaseModelFormSet):
    """The list's checkboxes. Each row checks the database (KingdomEvent.clean), so two inactive copies switched
    on in one save would both pass – this compares them with each other."""

    def clean(self):
        super().clean()
        switched_on = [
            (form.instance.name_sk, form.instance.starts_at)
            for form in self.forms
            if form.instance.is_active and 'is_active' in form.changed_data
        ]
        if len(switched_on) != len(set(switched_on)):
            raise forms.ValidationError(TWIN_EVENT_ERROR)


@admin.register(KingdomEvent)
class KingdomEventAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    form = KingdomEventForm
    list_display = [
        'icon_tag',
        'name_sk',
        'next_occurrence',
        'repeat_label',
        'players',
        'sends_discord',
        'show_on_web',
        'is_active',
    ]
    list_display_links = ['name_sk']
    # "posielať na Discord" is only shown: switching it on needs the reminders, which the list cannot check
    list_editable = ['show_on_web', 'is_active']
    list_filter = ['is_active', 'notify_discord', 'time_basis']
    search_fields = ['name_sk', 'name_cs', 'message']
    readonly_fields = ['schedule', 'icon_preview']
    save_on_top = True
    # "Uložiť ako nový" = a copy with its own reminders (save_model plans it as a new event)
    save_as = True
    fieldsets = [
        ('Event', {'fields': ['name_sk', 'name_cs', ('icon', 'icon_preview'), 'message', 'guide']}),
        (
            'Opakovanie',
            {'fields': ['irregular', 'starts_at', 'duration_minutes', 'repeat_days', 'until', 'time_basis', 'schedule']},
        ),
        (
            'Discord',
            {
                'fields': ['notify_discord', 'reminders', 'mention_role', 'mention_role_id'],
                'description': REPLAN_NOTE,
            },
        ),
        ('Web', {'fields': ['show_on_web', 'is_active']}),
        (
            'Pripomienky pre hráčov',
            {
                'fields': ['player_reminders'],
                'description': 'Prihlásení hráči si aktívny event zobrazený na webe vyberú a dostanú pripomienku '
                'súkromnou správou od bota na Discorde. Kto si čo vybral: Hráči → '
                'Pripomienky hráčov.',
            },
        ),
    ]

    def get_queryset(self, request):
        # players who picked the event on the website (accounts.EventReminder)
        return super().get_queryset(request).annotate(players_count=Count('subscriptions', distinct=True))

    def get_changelist_formset(self, request, **kwargs):
        return super().get_changelist_formset(request, formset=KingdomEventListFormSet, **kwargs)

    @admin.display(description='')
    def icon_tag(self, obj):
        url = event_icons.icon_url(obj.icon)
        return format_html('<img src="{}" alt="" width="28" height="28">', url) if url else ''

    @admin.display(description='náhľad')
    def icon_preview(self, obj):
        url = event_icons.icon_url(obj.icon) if obj else None
        if not url:
            return '—'
        return format_html(
            '<img src="{}" alt="" width="48" height="48" style="background:#0e1628;border-radius:8px;padding:4px">', url
        )

    # short headers and the date over the time keep the editable checkboxes in view at 1280 px (with both sidebars)
    @admin.display(description='najbližší termín')
    def next_occurrence(self, obj):
        dates = upcoming(obj, count=1)
        if not dates:
            return '—'
        return format_html(
            '<span style="white-space:nowrap">{}</span><br><span style="white-space:nowrap">{}</span> {}',
            *local_parts(dates[0]),
        )

    @admin.display(description='Discord', boolean=True, ordering='notify_discord')
    def sends_discord(self, obj):
        return obj.notify_discord

    @admin.display(description='opakovanie')
    def repeat_label(self, obj):
        return repeat_text(obj.repeat_days)

    @admin.display(description='hráči', ordering='players_count')
    def players(self, obj):
        if not obj.players_count:
            return 0
        url = reverse('admin:accounts_eventreminder_changelist')
        return format_html(
            '<a href="{}?event__id__exact={}" title="Pripomienky hráčov">{}</a>', url, obj.pk, obj.players_count
        )

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


class EventNotificationForm(forms.ModelForm):
    class Meta:
        model = EventNotification
        fields = '__all__'

    def clean(self):
        data = super().clean()
        # a new, pending or failed row goes out (sent and cancelled ones can be edited freely)
        sendable = self.instance.status in (EventNotification.Status.PENDING, EventNotification.Status.FAILED)
        title, send_at = data.get('title'), data.get('send_at')
        if sendable and title and send_at:
            twins = EventNotification.objects.filter(
                status=EventNotification.Status.PENDING, title=title, send_at=send_at
            ).exclude(pk=self.instance.pk)
            if twins.exists():
                self.add_error('send_at', 'Rovnaká pripomienka je už naplánovaná na tento čas – zmeň čas.')
        return data


@admin.register(EventNotification)
class EventNotificationAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    form = EventNotificationForm
    list_display = ['title', 'send_at', 'status', 'event', 'sent_at']
    list_filter = ['status', 'event']
    search_fields = ['title', 'message']
    date_hierarchy = 'send_at'
    readonly_fields = ['status', 'sent_at', 'error', 'event', 'occurrence_start', 'offset_minutes']
    actions = ['send_now', 'reschedule', 'cancel']
    # "Uložiť ako nový" = a new pending notification; readonly fields (state, event link) are not copied
    save_as = True

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
        # a bulk selection never sends a sent or cancelled notification again
        rows = list(queryset.filter(status__in=[EventNotification.Status.PENDING, EventNotification.Status.FAILED]))
        skipped = queryset.count() - len(rows)
        sent = sum(deliver(n) for n in rows)
        failed = len(rows) - sent
        if sent:
            self.message_user(request, f'Odoslané: {sent}', messages.SUCCESS)
        if failed:
            # the list has no error column, the reason is on the notification's page
            self.message_user(request, f'Neodoslané: {failed} – dôvod je v detaile (pole Chyba).', messages.ERROR)
        if skipped:
            self.message_user(request, f'Preskočené (odoslané alebo zrušené): {skipped}', messages.WARNING)

    @admin.action(description='Znova naplánovať (stav Naplánovaná)')
    def reschedule(self, request, queryset):
        # only failed and cancelled ones: a sent notification is never planned again
        rows = queryset.filter(status__in=[EventNotification.Status.FAILED, EventNotification.Status.CANCELLED])
        pending = EventNotification.objects.filter(status=EventNotification.Status.PENDING)
        planned = twins = stale = 0
        for n in rows.order_by('send_at', 'pk'):
            # a copy with the same title and time is already planned ("Uložiť ako nový" or an earlier row of this
            # selection): both would go out
            if pending.filter(title=n.title, send_at=n.send_at).exists():
                twins += 1
                continue
            n.status, n.error = EventNotification.Status.PENDING, ''
            n.save(update_fields=['status', 'error'])
            planned += 1
            stale += n.send_at < timezone.now() - MAX_DELAY
        skipped = queryset.count() - planned - twins
        if planned:
            self.message_user(request, f'Znova naplánované: {planned}', messages.SUCCESS)
        if skipped:
            self.message_user(request, f'Preskočené (odoslané alebo už naplánované): {skipped}', messages.WARNING)
        if twins:
            self.message_user(
                request, f'Preskočené – rovnaká pripomienka je už naplánovaná na ten istý čas: {twins}', messages.WARNING
            )
        if stale == 1:
            self.message_user(
                request,
                'Čas odoslania je starší ako 6 h – uprav ho, inak ju worker označí ako zmeškanú.',
                messages.WARNING,
            )
        elif stale:
            self.message_user(
                request,
                f'Pri {stale} notifikáciách je čas odoslania starší ako 6 h – uprav ho, inak ich worker označí '
                'ako zmeškané.',
                messages.WARNING,
            )

    @admin.action(description='Zrušiť (neposielať)')
    def cancel(self, request, queryset):
        cancelled = queryset.filter(status=EventNotification.Status.PENDING).update(
            status=EventNotification.Status.CANCELLED
        )
        self.message_user(request, f'Zrušené: {cancelled}', messages.SUCCESS)
