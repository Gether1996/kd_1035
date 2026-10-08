from django.core.exceptions import NON_FIELD_ERRORS, ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

discord_id_validator = RegexValidator(r'^[0-9]{5,24}$', 'Iba číslice (Developer Mode → pravý klik → Copy ID).')
TWIN_EVENT_ERROR = 'Aktívny event s rovnakým názvom a prvým začiatkom už existuje – zmeň názov alebo čas.'

# minutes before the start → label in the admin
REMINDER_CHOICES = [
    (1440, '1 deň'),
    (180, '3 h'),
    (60, '1 h'),
    (30, '30 min'),
    (15, '15 min'),
    (0, 'pri začiatku'),
]


def default_reminders():
    return [60]


def validate_reminders(value):
    allowed = {minutes for minutes, _ in REMINDER_CHOICES}
    if not isinstance(value, list) or any(type(v) is not int or v not in allowed for v in value):
        raise ValidationError('Povolené sú len minúty %(allowed)s.', params={'allowed': sorted(allowed, reverse=True)})


# personal reminders (accounts app): at most a week before the start
MAX_REMINDER_MINUTES = 7 * 24 * 60
MAX_OFFERED_REMINDERS = 6


def default_player_reminders():
    return [10, 60]


def is_minutes_list(value) -> bool:
    """A list of unique whole minutes 0–10080 (bool is an int in Python, so it is checked by type)."""
    return (
        isinstance(value, list)
        and len(set(value)) == len(value)
        and all(type(v) is int and 0 <= v <= MAX_REMINDER_MINUTES for v in value)
    )


def validate_player_reminders(value):
    if not is_minutes_list(value) or len(value) > MAX_OFFERED_REMINDERS:
        raise ValidationError(
            'Najviac %(count)s rôznych čísel od 0 do %(max)s (minúty).',
            params={'count': MAX_OFFERED_REMINDERS, 'max': MAX_REMINDER_MINUTES},
        )


class Alliance(models.Model):
    """Only stable facts – Rise of Kingdoms has no API, so live stats (power, members…) would go stale."""

    tag = models.CharField('tag', max_length=8)
    name = models.CharField('názov', max_length=64)
    order = models.PositiveSmallIntegerField('poradie', default=0)
    is_active = models.BooleanField('zobraziť na webe', default=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'aliancia'
        verbose_name_plural = 'aliancie'

    def __str__(self):
        return f'[{self.tag}] {self.name}'


class Officer(models.Model):
    """Leadership shown on the alliance card (leader, chancellor, R4…) with an optional Discord contact."""

    alliance = models.ForeignKey(Alliance, on_delete=models.CASCADE, related_name='officers', verbose_name='aliancia')
    name = models.CharField('meno v hre', max_length=64)
    title_sk = models.CharField('funkcia (SK)', max_length=48, help_text='napr. Vodca, Kancelár, R4')
    title_cs = models.CharField('funkce (CZ)', max_length=48, help_text='např. Vůdce, Kancléř, R4')
    discord_id = models.CharField(
        'Discord User ID',
        max_length=24,
        blank=True,
        help_text='Číslo z Discordu (Developer Mode → pravý klik na profil → Copy User ID). Tlačidlo potom otvorí profil.',
    )
    discord_username = models.CharField(
        'Discord meno', max_length=40, blank=True, help_text='Bez ID tlačidlo skopíruje toto meno.'
    )
    order = models.PositiveSmallIntegerField('poradie', default=0)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'člen vedenia'
        verbose_name_plural = 'vedenie'

    def __str__(self):
        return f'{self.title_sk}: {self.name}'


class SocialLink(models.Model):
    class Platform(models.TextChoices):
        DISCORD = 'discord', 'Discord'
        FACEBOOK = 'facebook', 'Facebook'

    platform = models.CharField('platforma', max_length=16, choices=Platform.choices, unique=True)
    url = models.URLField('odkaz')
    is_active = models.BooleanField('zobraziť na webe', default=True)

    class Meta:
        ordering = ['platform']
        verbose_name = 'odkaz'
        verbose_name_plural = 'odkazy (Discord, Facebook)'

    def __str__(self):
        return self.get_platform_display()


class KingdomEvent(models.Model):
    """A one-off or repeating kingdom event; the worker turns it into EventNotification reminders (events.py).

    Active events shown on the web can also be picked by players for personal reminders (accounts.EventReminder).
    """

    class TimeBasis(models.TextChoices):
        UTC = 'utc', 'UTC – herný čas (u nás sa v lete/zime posunie o hodinu)'
        LOCAL = 'local', 'Europe/Bratislava (u nás rovnaká hodina celý rok)'

    name_sk = models.CharField('názov (SK)', max_length=80, help_text='Nadpis správy na Discorde.')
    name_cs = models.CharField(
        'název (CZ)', max_length=80, blank=True, help_text='Prázdne = použije sa slovenský názov.'
    )
    message = models.TextField(
        'text na Discord',
        blank=True,
        max_length=3000,
        help_text='Môžeš použiť {name} = názov, {start} = dátum a čas začiatku, {relative} = „o 2 hodiny“, '
        '{end} = čas konca. Discord ich každému ukáže v jeho časovom pásme.',
    )
    starts_at = models.DateTimeField(
        'prvý začiatok', help_text='Čas v Európe/Bratislave. Ďalšie termíny sa počítajú od neho.'
    )
    duration_minutes = models.PositiveIntegerField('trvanie (min)', default=60, help_text='0 = bez konca.')
    repeat_days = models.PositiveSmallIntegerField(
        'opakovať každých (dní)', default=0, help_text='0 = jednorazovo, 1 = denne, 7 = týždenne, 14 = každé 2 týždne.'
    )
    until = models.DateField('opakovať do (vrátane)', null=True, blank=True, help_text='Prázdne = bez konca.')
    irregular = models.BooleanField(
        'nepravidelný',
        default=False,
        help_text='Event bez pevného cyklu (napr. Silk Road, Shadow Legion). Pred každým konaním nastav „prvý '
        'začiatok“ na nový termín – hráčom, ktorí si ho vybrali, prídu pripomienky. Kým ďalší termín nie je, hráči ho '
        'vidia ako „ďalší termín oznámime“ a môžu si ho vybrať vopred.',
    )
    time_basis = models.CharField(
        'čas sa drží v',
        max_length=8,
        choices=TimeBasis.choices,
        default=TimeBasis.UTC,
        help_text='Herné eventy idú podľa UTC: u nás v lete o 2 h neskôr, v zime o 1 h.',
    )
    reminders = models.JSONField(
        'pripomienky',
        default=default_reminders,
        blank=True,
        validators=[validate_reminders],
        help_text='Kedy pred začiatkom poslať správu na Discord.',
    )
    mention_role_id = models.CharField(
        'ID roly (nepovinné)',
        max_length=24,
        blank=True,
        validators=[discord_id_validator],
        help_text='Discord Role ID len pre tento event. Prázdne = DISCORD_EVENT_ROLE_ID z .env.',
    )
    mention_role = models.BooleanField('označiť rolu', default=True)
    notify_discord = models.BooleanField('posielať na Discord', default=True)
    show_on_web = models.BooleanField(
        'zobraziť na webe',
        default=True,
        help_text='Hráči si ho môžu vybrať v pripomienkach na webe (Môj účet).',
    )
    player_reminders = models.JSONField(
        'časy pre hráčov',
        default=default_player_reminders,
        blank=True,
        validators=[validate_player_reminders],
        help_text='Minúty pred začiatkom, ktoré hráčom ponúkneme na webe.',
    )
    guide = models.ForeignKey(
        'guides.Guide',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'category': 'eventy'},
        related_name='kingdom_events',
        verbose_name='návod',
        help_text='Návod z kategórie Eventy (nepovinné).',
    )
    is_active = models.BooleanField('aktívny', default=True, help_text='Neaktívny event neposiela pripomienky.')
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['starts_at']
        verbose_name = 'event kráľovstva'
        verbose_name_plural = 'eventy kráľovstva'

    def __str__(self):
        return self.name_sk

    def active_twins(self):
        """Other active events with the same name and first start – each would send every reminder again."""
        twins = KingdomEvent.objects.filter(is_active=True, name_sk=self.name_sk, starts_at=self.starts_at)
        return twins.exclude(pk=self.pk)

    def clean(self):
        from .events import render  # events.py imports this module

        errors = {}
        if self.until and self.starts_at and self.until < timezone.localdate(self.starts_at):
            errors['until'] = 'Dátum je pred prvým začiatkom.'
        if self.irregular and self.repeat_days:
            errors['repeat_days'] = 'Nepravidelný event nemá cyklus – nechaj 0 a pred každým konaním zmeň termín.'
        if '{end}' in self.message and not self.duration_minutes:
            errors['message'] = 'Pri trvaní 0 nemá event koniec – odstráň {end} z textu.'
        elif self.starts_at:
            # the generated notification keeps the expanded text ({start} → <t:1760000000:F>)
            limit = EventNotification._meta.get_field('message').max_length
            if len(render(self, self.starts_at)) > limit:
                errors['message'] = f'Po doplnení časov je text dlhší ako {limit} znakov – skráť ho.'
        # here and not in the admin form: the list's "aktívny" checkbox saves through another form
        if self.is_active and self.name_sk and self.starts_at and self.active_twins().exists():
            errors[NON_FIELD_ERRORS] = TWIN_EVENT_ERROR
        if errors:
            raise ValidationError(errors)


class EventNotification(models.Model):
    """A message the worker posts to the Discord channel (webhook) at `send_at`.

    Written by hand in the admin, or generated from a KingdomEvent (event + occurrence_start + offset_minutes).
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Naplánovaná'
        SENT = 'sent', 'Odoslaná'
        FAILED = 'failed', 'Chyba'
        CANCELLED = 'cancelled', 'Zrušená'

    title = models.CharField('nadpis', max_length=200)
    message = models.TextField('text', blank=True, max_length=3500)
    send_at = models.DateTimeField('odoslať', help_text='Čas v Európe/Bratislave.')
    event_start = models.DateTimeField(
        'začiatok eventu (nepovinné)',
        null=True,
        blank=True,
        help_text='Discord ho každému ukáže v jeho časovom pásme aj s odpočtom.',
    )
    mention_role = models.BooleanField(
        'označiť rolu', default=True, help_text='Pingne rolu z poľa ID roly, inak DISCORD_EVENT_ROLE_ID.'
    )
    mention_role_id = models.CharField(
        'ID roly (nepovinné)',
        max_length=24,
        blank=True,
        validators=[discord_id_validator],
        help_text='Prázdne = rola eventu, inak DISCORD_EVENT_ROLE_ID z .env.',
    )
    status = models.CharField('stav', max_length=16, choices=Status.choices, default=Status.PENDING)
    sent_at = models.DateTimeField('odoslaná', null=True, blank=True)
    error = models.TextField('chyba', blank=True)
    event = models.ForeignKey(
        KingdomEvent,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
        verbose_name='event kráľovstva',
    )
    occurrence_start = models.DateTimeField('termín eventu', null=True, blank=True)
    offset_minutes = models.PositiveIntegerField('minút pred začiatkom', null=True, blank=True)

    class Meta:
        ordering = ['-send_at']
        verbose_name = 'Discord notifikácia'
        verbose_name_plural = 'Discord notifikácie'
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'occurrence_start', 'offset_minutes'],
                condition=models.Q(event__isnull=False),
                name='one_reminder_per_occurrence',
            )
        ]

    def __str__(self):
        return self.title
