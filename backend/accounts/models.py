from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from kingdom.models import MAX_REMINDER_MINUTES, is_minutes_list

CDN = 'https://cdn.discordapp.com'
MAX_PLAYER_REMINDERS = 5


def validate_offsets(value):
    if not is_minutes_list(value) or not 1 <= len(value) <= MAX_PLAYER_REMINDERS:
        raise ValidationError(
            '1 až %(count)s rôznych čísel od 0 do %(max)s (minúty).',
            params={'count': MAX_PLAYER_REMINDERS, 'max': MAX_REMINDER_MINUTES},
        )


class Player(models.Model):
    """A member signed in with Discord. Scope identify only: ID, name and avatar – no e-mail, no servers. The player
    adds their in-game name on /ucet themselves, so leadership recognises them.

    Personal data: these rows (and the discord_<id> users) never go into the git snapshot (kingdom/snapshot.py).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='player', verbose_name='používateľ'
    )
    discord_id = models.CharField('Discord ID', max_length=24, unique=True)
    username = models.CharField('Discord meno', max_length=40)
    global_name = models.CharField('zobrazované meno', max_length=64, blank=True)
    avatar = models.CharField('avatar (hash)', max_length=64, blank=True)
    ingame_name = models.CharField(
        'meno v hre', max_length=32, blank=True, help_text='Vyplní si ho hráč sám na webe (Môj účet).'
    )
    remind_discord = models.BooleanField(
        'pripomienky na Discord', default=True, help_text='Súkromná správa od bota pred eventmi, ktoré si vybral.'
    )
    lang = models.CharField(
        'jazyk',
        max_length=2,
        choices=[('sk', 'slovenčina'), ('cs', 'čeština')],
        default='sk',
        help_text='Jazyk pripomienok – podľa verzie webu, na ktorej bol hráč naposledy.',
    )
    created_at = models.DateTimeField('registrovaný', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'hráč'
        verbose_name_plural = 'hráči'

    def __str__(self):
        return self.name

    @property
    def name(self) -> str:
        return self.global_name or self.username

    @property
    def avatar_url(self) -> str:
        if self.avatar:
            return f'{CDN}/avatars/{self.discord_id}/{self.avatar}.png?size=64'
        # Discord's default avatar for accounts with the new username system
        return f'{CDN}/embed/avatars/{(int(self.discord_id) >> 22) % 6}.png'

    @transaction.atomic
    def delete_account(self):
        """Deletes the whole site account: the user cascades to this player, their reminders, browsers and sent
        reminders. Admin history about them goes too – it names the player ("Nelly · MGE") and the privacy page
        promises nothing is left. Entries the user made themselves go with the user's cascade."""
        from django.contrib.admin.models import LogEntry
        from django.contrib.contenttypes.models import ContentType

        about = {
            type(self.user): [self.user.pk],
            Player: [self.pk],
            EventReminder: self.event_reminders.values_list('pk', flat=True),
            PushSubscription: self.push_subscriptions.values_list('pk', flat=True),
            SentReminder: SentReminder.objects.filter(player=self).values_list('pk', flat=True),
        }
        for model, pks in about.items():
            LogEntry.objects.filter(
                content_type=ContentType.objects.get_for_model(model), object_id__in=[str(pk) for pk in pks]
            ).delete()
        self.user.delete()


class EventReminder(models.Model):
    """A kingdom event the player wants to be reminded of, and how many minutes before each start."""

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='event_reminders', verbose_name='hráč')
    event = models.ForeignKey(
        'kingdom.KingdomEvent', on_delete=models.CASCADE, related_name='subscriptions', verbose_name='event'
    )
    # unique minutes, largest first
    offsets = models.JSONField('minút pred začiatkom', validators=[validate_offsets])
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['event', 'player']
        verbose_name = 'pripomienka hráča'
        verbose_name_plural = 'pripomienky hráčov'
        constraints = [models.UniqueConstraint(fields=['player', 'event'], name='one_reminder_per_player_event')]

    def __str__(self):
        return f'{self.player} · {self.event}'


class PushSubscription(models.Model):
    """One browser (phone, PC) where the player switched on notifications. The keys only encrypt the messages."""

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='push_subscriptions', verbose_name='hráč')
    endpoint = models.URLField('adresa push služby', max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    last_used_at = models.DateTimeField('naposledy odoslané', null=True, blank=True)
    # failed sends in a row; the subscription is dropped after a few
    failures = models.PositiveSmallIntegerField('chyby za sebou', default=0)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'prehliadač s notifikáciami'
        verbose_name_plural = 'prehliadače s notifikáciami'

    def __str__(self):
        return f'{self.player} · {self.endpoint[:40]}…'


class SentReminder(models.Model):
    """Log of personal reminders, one row per channel – the worker never sends the same one twice. Kept 30 days."""

    class Channel(models.TextChoices):
        DISCORD = 'discord', 'Discord'
        PUSH = 'push', 'prehliadač'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='+', verbose_name='hráč')
    event = models.ForeignKey('kingdom.KingdomEvent', on_delete=models.CASCADE, related_name='+', verbose_name='event')
    occurrence = models.DateTimeField('termín eventu')
    offset = models.PositiveIntegerField('minút pred začiatkom')
    channel = models.CharField('kanál', max_length=8, choices=Channel.choices)
    sent_at = models.DateTimeField('odoslané', default=timezone.now)
    ok = models.BooleanField('doručené', default=False)
    error = models.CharField('chyba', max_length=300, blank=True)

    class Meta:
        ordering = ['-sent_at']
        verbose_name = 'odoslaná pripomienka'
        verbose_name_plural = 'odoslané pripomienky'
        constraints = [
            models.UniqueConstraint(
                fields=['player', 'event', 'occurrence', 'offset', 'channel'], name='one_personal_reminder_per_channel'
            )
        ]

    def __str__(self):
        return f'{self.player} · {self.event} · {self.get_channel_display()}'
