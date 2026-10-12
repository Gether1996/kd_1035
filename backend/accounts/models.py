from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator
from django.db import models, transaction
from django.utils import timezone

from kingdom.models import EVENING_BEFORE, MAX_REMINDER_MINUTES, is_minutes_list

CDN = 'https://cdn.discordapp.com'
MAX_PLAYER_REMINDERS = 5


def validate_offsets(value):
    if not is_minutes_list(value) or not 1 <= len(value) <= MAX_PLAYER_REMINDERS:
        raise ValidationError(
            '1 až %(count)s rôznych čísel od 0 do %(max)s (minúty) alebo %(evening)s (deň vopred o 18:00).',
            params={'count': MAX_PLAYER_REMINDERS, 'max': MAX_REMINDER_MINUTES, 'evening': EVENING_BEFORE},
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
    marches_public = models.BooleanField(
        'marche vidia všetci',
        default=False,
        help_text='Hráč povolil, aby jeho marche a screenshoty videli všetci hráči prihlásení na webe (inak len R4).',
    )
    kvk_reviewer = models.BooleanField(
        'vidí KvK prihlášky',
        default=False,
        help_text='Hráč (napr. R4) vidí všetky prihlášky na KvK aj so screenshotmi. Nastavuje superadmin.',
    )

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
        """Deletes the whole site account: the user cascades to this player, their reminders and sent reminders.
        Admin history about them goes too – it names the player ("Nelly · MGE") and the privacy page promises nothing
        is left. Entries the user made themselves go with the user's cascade."""
        from django.contrib.admin.models import LogEntry
        from django.contrib.contenttypes.models import ContentType

        about = {
            type(self.user): [self.user.pk],
            Player: [self.pk],
            EventReminder: self.event_reminders.values_list('pk', flat=True),
            Alarm: self.alarms.values_list('pk', flat=True),
            KvkSignup: KvkSignup.objects.filter(player=self).values_list('pk', flat=True),
            March: self.marches.values_list('pk', flat=True),
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
    # unique minutes or kingdom.models.EVENING_BEFORE, largest first (lead_order)
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


class SentReminder(models.Model):
    """Log of personal reminders, one row per channel – the worker never sends the same one twice. Kept 30 days.

    Discord DM from the bot is the only channel; the field stays so another channel would need no new constraint."""

    class Channel(models.TextChoices):
        DISCORD = 'discord', 'Discord'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='+', verbose_name='hráč')
    event = models.ForeignKey('kingdom.KingdomEvent', on_delete=models.CASCADE, related_name='+', verbose_name='event')
    occurrence = models.DateTimeField('termín eventu')
    offset = models.IntegerField('minút pred začiatkom')  # or EVENING_BEFORE (negative)
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


MAX_ALARMS = 5
# how far ahead an alarm may ring (a peace shield, a pass opening in KvK…)
MAX_ALARM_DAYS = 14


class Alarm(models.Model):
    """A one-off alarm the player sets on /pripomienky ("my shield ends in 7 h 30 min, remind me 15 min before"):
    the bot sends a DM at remind_at. Deleted a day after it went out (prune_alarms)."""

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='alarms', verbose_name='hráč')
    note = models.CharField('text', max_length=100, blank=True)
    target_at = models.DateTimeField('čas udalosti')
    remind_at = models.DateTimeField('poslať')
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    # set when the worker takes the alarm (also a missed one); empty = waiting
    sent_at = models.DateTimeField('odoslané', null=True, blank=True)
    ok = models.BooleanField('doručené', default=False)
    error = models.CharField('chyba', max_length=300, blank=True)

    class Meta:
        ordering = ['remind_at']
        verbose_name = 'budík hráča'
        verbose_name_plural = 'budíky hráčov'
        indexes = [models.Index(fields=['sent_at', 'remind_at'], name='alarm_due')]

    def __str__(self):
        return f'{self.player} · {self.note or "budík"}'


class KvkSettings(models.Model):
    """The heading of the KvK sign-ups (one row) – the superuser writes the date of the next KvK into it on /kvk. No
    rounds: a sign-up stays until the player or the superuser withdraws it (Gether 11. 10. 2026: "nech to nemusia
    rally a garrisoni vypĺňať každé jedno KvK")."""

    title_sk = models.CharField('názov (SK)', max_length=80, blank=True)
    title_cs = models.CharField('názov (CZ)', max_length=80, blank=True, help_text='Prázdne = slovenský názov.')

    class Meta:
        verbose_name = 'KvK prihlasovanie'
        verbose_name_plural = 'KvK prihlasovanie'

    def __str__(self):
        return self.title_sk or 'KvK prihlasovanie'

    @classmethod
    def load(cls) -> 'KvkSettings':
        return cls.objects.get_or_create(pk=1)[0]


# armament bonuses and inscription counts: at most two digits
STAT_MAX = 99
STAT_LIMIT = [MaxValueValidator(STAT_MAX)]
MARCH_STATS = ('attack', 'defense', 'health', 'damage', 'white', 'blue', 'gold')


class ArmyFields(models.Model):
    """What a march and a KvK sign-up both say about an army (Gether 11. 10. 2026: the sign-up is filled in like a
    march): the commander pair (names of guides/roster.py) and the armament bonuses in whole percent, rounded up, of
    the march's troop type ("Cav ATK" for a cavalry march…) with the number of inscriptions by colour; empty = not
    filled in."""

    primary = models.CharField('primárny commander', max_length=40, blank=True)
    secondary = models.CharField('sekundárny commander', max_length=40, blank=True)
    attack = models.PositiveSmallIntegerField('ATK %', null=True, blank=True, validators=STAT_LIMIT)
    defense = models.PositiveSmallIntegerField('DEF %', null=True, blank=True, validators=STAT_LIMIT)
    health = models.PositiveSmallIntegerField('HP %', null=True, blank=True, validators=STAT_LIMIT)
    damage = models.PositiveSmallIntegerField('All DMG %', null=True, blank=True, validators=STAT_LIMIT)
    white = models.PositiveSmallIntegerField('biele inscriptions', null=True, blank=True, validators=STAT_LIMIT)
    blue = models.PositiveSmallIntegerField('modré inscriptions', null=True, blank=True, validators=STAT_LIMIT)
    gold = models.PositiveSmallIntegerField('zlaté inscriptions', null=True, blank=True, validators=STAT_LIMIT)

    class Meta:
        abstract = True


class KvkSignup(ArmyFields):
    """A player's sign-up for a KvK as rally or garrison: commander pair, armament bonuses, note and one screenshot of
    the equipment and one of the armaments (KvkImage) – like a march. A player may sign up for both, each with its own
    army (Gether 11. 10. 2026). It stays until the player or the superuser withdraws it. Seen only by the player, the
    players with Player.kvk_reviewer and the superuser."""

    class Role(models.TextChoices):
        RALLY = 'rally', 'rally'
        GARRISON = 'garrison', 'garrison'

    class Kind(models.TextChoices):
        """the troops of the army (Gether 11. 10. 2026) – its bonuses are read as theirs ("Cav ATK"); the values are the
        march types"""

        INFANTRY = 'infantry', 'pechota'
        CAVALRY = 'cavalry', 'jazda'
        ARCHER = 'archer', 'lukostrelci'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='kvk_signups', verbose_name='hráč')
    role = models.CharField('rola', max_length=8, choices=Role.choices)
    # empty only for the sign-ups saved before the troops were asked for
    kind = models.CharField('jednotky', max_length=12, choices=Kind.choices, blank=True)
    note = models.CharField('poznámka', max_length=500, blank=True)
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'KvK prihláška'
        verbose_name_plural = 'KvK prihlášky'
        constraints = [models.UniqueConstraint(fields=['player', 'role'], name='one_kvk_signup_per_role')]

    def __str__(self):
        return f'{self.player} · {self.get_role_display()}'


class KvkImage(models.Model):
    """One screenshot of a sign-up, re-encoded without metadata (private_images.py) under PRIVATE_MEDIA_ROOT, plus a
    thumbnail. The files go with the row (post_delete in cleanup.py)."""

    class Kind(models.TextChoices):
        EQUIPMENT = 'equipment', 'výbava'
        ARMAMENTS = 'armaments', 'armamenty'

    signup = models.ForeignKey(KvkSignup, on_delete=models.CASCADE, related_name='images', verbose_name='prihláška')
    kind = models.CharField('čo je na obrázku', max_length=12, choices=Kind.choices)
    # relative to PRIVATE_MEDIA_ROOT
    path = models.CharField('súbor', max_length=200)
    thumb = models.CharField('náhľad', max_length=200)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField('nahrané', auto_now_add=True)

    class Meta:
        ordering = ['kind', 'created_at']
        verbose_name = 'screenshot prihlášky'
        verbose_name_plural = 'screenshoty prihlášok'

    def __str__(self):
        return f'{self.signup} · {self.get_kind_display()}'


MAX_MARCHES = 7



class March(ArmyFields):
    """One of the player's marches on /marche ("Prehľad marchov"): its type, the army (ArmyFields) and the equipment and
    armaments clicked together (gear, formation, inscriptions; the screenshot of the equipment is gone, Gether
    12. 10. 2026). Seen by the player, the reviewers and the superuser – and every signed-in
    player when the player makes the marches public."""

    class Kind(models.TextChoices):
        INFANTRY = 'infantry', 'pechota'
        CAVALRY = 'cavalry', 'jazda'
        ARCHER = 'archer', 'lukostrelci'
        LEADERSHIP = 'leadership', 'mix (leadership)'
        # the in-game tag of siege commanders (Gether 11. 10. 2026: no gathering or barbarian marches, siege instead)
        ENGINEERING = 'engineering', 'siege'
        GARRISON = 'garrison', 'garrison'
        CONQUERING = 'conquering', 'rally'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='marches', verbose_name='hráč')
    position = models.PositiveSmallIntegerField('poradie', default=1)
    kind = models.CharField('typ', max_length=12, choices=Kind.choices, blank=True)
    # the build clicked together on /marche (Gether 12. 10. 2026; guides/armory.py): slot → {item, crit, iconic}, the
    # formation and the ids of its inscriptions – optional, next to the screenshot
    gear = models.JSONField('výbava', default=dict, blank=True)
    formation = models.CharField('formácia', max_length=20, blank=True)
    inscriptions = models.JSONField('inscriptions', default=list, blank=True)
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['player', 'position', 'pk']
        verbose_name = 'march hráča'
        verbose_name_plural = 'marche hráčov'

    def __str__(self):
        return f'{self.player} · {self.position}. march'
