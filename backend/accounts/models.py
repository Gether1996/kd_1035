from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
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


# the terms of use the players agree to after signing in (Gether 12. 10. 2026): the date "Platné od" of the terms page
# (frontend pages/terms/terms.ts validFrom) – change both together, every player is then asked again
TERMS_VERSION = '2026-10-12'

# players whose marches and KvK sign-ups the web shows: approved, or the superadmin themself. A player the superadmin
# un-approves keeps everything in the database, but nobody sees it – the superadmin neither – until approved again
# (Gether 20. 10. 2026; from 12. 10. the superadmin still saw it, marked).
APPROVED = models.Q(approved=True) | models.Q(user__is_superuser=True)


# the avatar of a player without Discord (frontend/public/img/avatar-local.svg)
LOCAL_AVATAR = '/img/avatar-local.svg'


class Player(models.Model):
    """A member signed in with Discord. Scope identify only: ID, name and avatar – no e-mail, no servers. The player
    adds their in-game name on /ucet themselves, so leadership recognises them.

    Or a member without Discord (Gether 17. 10. 2026, local_auth.py): no Discord ID, signs in with the in-game name
    (`login` = its casefolded key) and a password (the user's hash). No bot DMs reach them (remind_discord off).

    Personal data: these rows (and the discord_<id> users) never go into the git snapshot (kingdom/snapshot.py).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='player', verbose_name='používateľ'
    )
    # empty for a player without Discord
    discord_id = models.CharField('Discord ID', max_length=24, unique=True, null=True, blank=True)
    username = models.CharField('Discord meno', max_length=40, blank=True)
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
        help_text='Jazyk webu a správ od bota – vyberá si ho hráč na Môj účet (nový hráč dostane jazyk webu, '
        'na ktorom sa prvýkrát prihlásil).',
    )
    created_at = models.DateTimeField('registrovaný', auto_now_add=True)
    marches_public = models.BooleanField(
        'marche vidia všetci',
        default=False,
        help_text='Hráč povolil, aby jeho marche videli všetci schválení hráči prihlásení na webe (inak len R4).',
    )
    kvk_reviewer = models.BooleanField(
        'vidí KvK prihlášky',
        default=False,
        help_text='Hráč (napr. R4) vidí všetky prihlášky na KvK a marche všetkých hráčov. Nastavuje superadmin.',
    )
    # Gether 14. 10. 2026: one switch for the evaluation itself (the estimate and the variables), one for the published
    # overview of the required acclaim. `evaluator` was the table's own switch – not read any more (merged into
    # evaluation_settings by migration 0031), dropped later with Gether's yes.
    evaluator = models.BooleanField(
        'tabuľka vyhodnocovania (nepoužíva sa)',
        default=False,
        help_text='Nepoužíva sa od 14. 10. 2026 – tabuľku aj premenné povoľuje „nastavenia vyhodnocovania“.',
    )
    evaluation_settings = models.BooleanField(
        'nastavenia vyhodnocovania',
        default=False,
        help_text='Hráč vidí na /vyhodnocovanie odhad acclaimu schválených hráčov, zapisuje im power a T4, mení '
        'premenné výpočtu, páry a formácie commanderov (platí pre všetkých) a zverejňuje požadovaný acclaim. '
        'Nastavuje superadmin.',
    )
    # no longer read (Gether 23. 10. 2026): every approved player sees the published required acclaim; the column waits
    # for a migration that drops it (docs/odporucania.md)
    evaluation_overview = models.BooleanField(
        'požadovaný acclaim',
        default=False,
        help_text='Hráč vidí na /vyhodnocovanie zverejnený požadovaný acclaim schválených hráčov (iba čítanie). '
        'Nastavuje superadmin.',
    )
    approved = models.BooleanField(
        'schválený',
        default=False,
        help_text='Môže pridávať marche a prihlášky na KvK a vidí marche ostatných hráčov. Nového hráča schvaľuje '
        'superadmin (hráči z čias pred schvaľovaním sú schválení).',
    )
    # the superadmin's own list only (Gether 20. 10. 2026: "zneviditeľním určitých hráčov v zozname") – nothing else
    inactive = models.BooleanField(
        'neaktívny',
        default=False,
        help_text='Superadmin ho nevidí v zozname Hráči, kým nezapne „Zobraziť neaktívnych“. Na nič iné nemá vplyv.',
    )
    announced = models.BooleanField(
        'superadmin upozornený',
        default=False,
        help_text='Worker poslal superadminovi na Discord, že sa prihlásil nový hráč.',
    )
    welcome_due = models.BooleanField(
        'čaká správa o schválení',
        default=False,
        help_text='Superadmin hráča schválil a worker mu ešte neposlal súkromnú správu, že môže začať.',
    )
    terms_version = models.CharField(
        'verzia podmienok', max_length=10, blank=True, help_text='Dátum podmienok používania, s ktorými hráč súhlasil.'
    )
    terms_accepted_at = models.DateTimeField('súhlas s podmienkami', null=True, blank=True)
    # a player without Discord: the in-game name they sign in with, casefolded (local_auth.login_key)
    login = models.CharField(
        'prihlasovacie meno',
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        editable=False,
        help_text='Iba hráč bez Discordu – meno v hre, ktorým sa prihlasuje.',
    )
    # the one-off code for a new password the superadmin gives a player without Discord (sha256 of it), until when
    reset_code = models.CharField('kód na nové heslo (hash)', max_length=64, blank=True, editable=False)
    reset_until = models.DateTimeField('kód platí do', null=True, blank=True, editable=False)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'hráč'
        verbose_name_plural = 'hráči'

    def __str__(self):
        return self.name

    @property
    def name(self) -> str:
        return self.global_name or self.username or self.ingame_name

    @property
    def local(self) -> bool:
        """Signed up without Discord – the in-game name and a password."""
        return self.discord_id is None

    @property
    def terms_accepted(self) -> bool:
        """Agreed to the current terms of use (TERMS_VERSION) – asked again when they change."""
        return self.terms_version == TERMS_VERSION

    @property
    def may_post(self) -> bool:
        """Adds and changes marches and KvK sign-ups: approved by the superadmin, or the superadmin themself."""
        return self.approved or self.user.is_superuser

    def approval_changed(self, was_approved: bool) -> list[str]:
        """The superadmin approved the player (newcomers.send_welcomes tells them by a bot DM) or took the approval
        back (a message still waiting is cancelled). Returns the fields to save. The superadmin never waited, and
        the auto-approve at the first sign-in does not come here."""
        if self.approved == was_approved:
            return []
        # the welcome is a bot DM – a player without Discord learns it on the website
        self.welcome_due = self.approved and not self.user.is_superuser and not self.local
        return ['welcome_due']

    @property
    def avatar_url(self) -> str:
        if self.local:
            return LOCAL_AVATAR
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
    """No longer read (Gether 20. 10. 2026: the Nastavenia tab of /kvk "nesluzi to na nic"): once the heading of the
    KvK sign-ups the superuser set on /kvk. The table waits for a migration that drops it (docs/odporucania.md). No
    rounds: a sign-up stays until the player or the superuser withdraws it (Gether 11. 10. 2026)."""

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


class PlayerSettings(models.Model):
    """How new players get in (one row) – the superadmin switches it in the Hráči list on /ucet (Gether 12. 10. 2026:
    "dočasne to chcem nechať otvorené a časom zavriem")."""

    auto_approve = models.BooleanField(
        'schvaľovať automaticky',
        default=False,
        help_text='Nový hráč je schválený hneď pri prvom prihlásení a superadmin nedostane správu na Discord. '
        'Hráčov, ktorí už čakajú, to neschváli.',
    )

    class Meta:
        verbose_name = 'schvaľovanie hráčov'
        verbose_name_plural = 'schvaľovanie hráčov'

    def __str__(self):
        return 'Schvaľovanie hráčov'

    @classmethod
    def load(cls) -> 'PlayerSettings':
        return cls.objects.get_or_create(pk=1)[0]


# inscription counts: at most two digits
STAT_MAX = 99
STAT_LIMIT = [MaxValueValidator(STAT_MAX)]
# armament bonuses in percent with one decimal (Gether 12. 10. 2026: "povoľme aj desatinné čísla")
BONUS_MAX = Decimal('99.9')
BONUS_LIMIT = [MinValueValidator(0), MaxValueValidator(BONUS_MAX)]


def bonus_field(label):
    return models.DecimalField(label, max_digits=3, decimal_places=1, null=True, blank=True, validators=BONUS_LIMIT)


# the commander's skill levels: four digits 1–5, 5555 = expertise (Gether 12. 10. 2026)
EXPERTISE = '5555'
SKILLS_LIMIT = [RegexValidator(r'^[1-5]{4}$')]
MARCH_STATS = ('attack', 'defense', 'health', 'damage', 'white', 'blue', 'gold')


class ArmyFields(models.Model):
    """What a march and a KvK sign-up both say about an army (Gether 11. and 12. 10. 2026: the sign-up is filled in
    exactly like a march): the commander pair (names of guides/roster.py) with their skill levels, the build clicked
    together, the armament bonuses in percent with one decimal of the troop type ("Cav ATK" for cavalry…) and the
    number of inscriptions by colour (counted from the inscriptions clicked together); empty = not filled in."""

    primary = models.CharField('primárny commander', max_length=40, blank=True)
    secondary = models.CharField('sekundárny commander', max_length=40, blank=True)
    attack = bonus_field('ATK %')
    defense = bonus_field('DEF %')
    health = bonus_field('HP %')
    damage = bonus_field('All DMG %')
    white = models.PositiveSmallIntegerField('biele inscriptions', null=True, blank=True, validators=STAT_LIMIT)
    blue = models.PositiveSmallIntegerField('modré inscriptions', null=True, blank=True, validators=STAT_LIMIT)
    gold = models.PositiveSmallIntegerField('zlaté inscriptions', null=True, blank=True, validators=STAT_LIMIT)
    # skill levels of the commanders, 5555 = expertise (the default)
    primary_skills = models.CharField('skilly primárneho', max_length=4, default=EXPERTISE, validators=SKILLS_LIMIT)
    secondary_skills = models.CharField('skilly sekundárneho', max_length=4, default=EXPERTISE, validators=SKILLS_LIMIT)
    # the build clicked together (Gether 12. 10. 2026; guides/armory.py): slot → {item, crit, iconic}, the formation
    # and the ids of its inscriptions
    gear = models.JSONField('výbava', default=dict, blank=True)
    formation = models.CharField('formácia', max_length=20, blank=True)
    inscriptions = models.JSONField('inscriptions', default=list, blank=True)

    class Meta:
        abstract = True


# when the player is online for the KvK – any of them (the labels are on the web, i18n kvk.survey.online)
KVK_ONLINE = ['first_zone', 'mornings', 'afternoons', 'evenings', 'nights', 'weekends', 'on_call']


class KvkSignup(ArmyFields):
    """A player's sign-up for a KvK as rally or garrison, filled in exactly like a march (ArmyFields, no screenshot since
    12. 10. 2026) with a note. A player may sign up for both, each with its own
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

    class Budget(models.TextChoices):
        """how much the player puts into the KvK – one, in euros (the web adds a rough CZK)"""

        TO50 = 'to50', 'do 50 €'
        TO100 = 'to100', 'do 100 €'
        TO200 = 'to200', 'do 200 €'
        OVER200 = 'over200', 'nad 200 €'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='kvk_signups', verbose_name='hráč')
    role = models.CharField('rola', max_length=8, choices=Role.choices)
    # up to two sign-ups per role (Gether 22. 10. 2026: "2x rally a 2x garrison"); 1 = the first, 2 = the second
    slot = models.PositiveSmallIntegerField('poradie', default=1, choices=[(1, '1'), (2, '2')])
    # empty only for the sign-ups saved before the troops were asked for
    kind = models.CharField('jednotky', max_length=12, choices=Kind.choices, blank=True)
    note = models.CharField('poznámka', max_length=500, blank=True)
    # the survey of the sign-up form (Gether 20. 10. 2026) – a rough guess, nothing binding; empty only for the sign-ups
    # saved before it was asked for (the header then reminds the player)
    budget = models.CharField('koľko dáva do KvK', max_length=10, choices=Budget.choices, blank=True)
    online = models.JSONField(
        'kedy je online', default=list, blank=True, help_text=f'Jedna alebo viac z: {", ".join(KVK_ONLINE)}.'
    )
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'KvK prihláška'
        verbose_name_plural = 'KvK prihlášky'
        constraints = [models.UniqueConstraint(fields=['player', 'role', 'slot'], name='two_kvk_signups_per_role')]

    def __str__(self):
        return f'{self.player} · {self.get_role_display()}' + (f' {self.slot}' if self.slot > 1 else '')


# Gether 12. 10. 2026: up to 10 (players with 9 marches could not fill them in; 7 before)
MAX_MARCHES = 10



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
    created_at = models.DateTimeField('vytvorené', auto_now_add=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['player', 'position', 'pk']
        verbose_name = 'march hráča'
        verbose_name_plural = 'marche hráčov'

    def __str__(self):
        return f'{self.player} · {self.position}. march'


class EvaluationChange(models.Model):
    """One save in the KvK evaluation (Gether 24. 10. 2026: "aby som videl, čo kto kedy zmení"): who, when, what –
    [path or pair or field, before, after]; written by the server (evaluation_history.py), deleted after 180 days."""

    class Kind(models.TextChoices):
        SETTINGS = 'settings', 'premenné'
        PAIRS = 'pairs', 'páry commanderov'
        FORMATIONS = 'formations', 'formácie commanderov'
        PLAYER = 'player', 'power a T4 hráča'
        PUBLISH = 'publish', 'zverejnenie'

    created_at = models.DateTimeField('kedy', auto_now_add=True, db_index=True)
    # kept when the account goes – "zmazaný účet"
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+', verbose_name='kto'
    )
    kind = models.CharField('čo', max_length=12, choices=Kind.choices)
    # the player whose power / T4 changed
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE, null=True, blank=True, related_name='+', verbose_name='hráč'
    )
    changes = models.JSONField('zmeny', default=list)
    truncated = models.PositiveIntegerField('ďalšie zmeny', default=0)

    class Meta:
        ordering = ['-created_at', '-pk']
        verbose_name = 'zmena vyhodnocovania'
        verbose_name_plural = 'história vyhodnocovania'

    def __str__(self):
        return f'{self.created_at:%d. %m. %Y %H:%M} · {self.get_kind_display()}'


class EvaluationSettings(models.Model):
    """The variables of the KvK evaluation on /vyhodnocovanie (one row; Gether 13. 10. 2026: the "KVK Requirements"
    spreadsheet on the web, every variable adjustable). `data` is the JSON the page edits – the page fills in its
    defaults (the spreadsheet's constants) for anything missing; the server only checks it is plain JSON of a sane
    size (evaluation_views.clean_settings)."""

    data = models.JSONField('premenné', default=dict, blank=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)
    # "Požadovaný acclaim" (Gether 14. 10. 2026): what the evaluation counted when it was published – [{id, marches,
    # missing, required}], the names are joined when read. The players with the overview switch see this, never the
    # variables, the pairs or anyone's power.
    overview = models.JSONField('zverejnený požadovaný acclaim', default=list, blank=True)
    overview_at = models.DateTimeField('zverejnené', null=True, blank=True)

    class Meta:
        verbose_name = 'premenné vyhodnocovania'
        verbose_name_plural = 'premenné vyhodnocovania'

    def __str__(self):
        return 'Premenné vyhodnocovania'

    @classmethod
    def load(cls) -> 'EvaluationSettings':
        return cls.objects.get_or_create(pk=1)[0]


class PlayerEvaluation(models.Model):
    """What is written down about a player for the KvK evaluation and the game has no API for: the power in millions
    (the player on /ucet too, since 14. 10. 2026), T4 troops only and a correction of the recommended power. Seen by
    the superadmin and the players with the switch of the evaluation (approved players
    only), the power by the player too; gone with the account (the privacy page says so)."""

    player = models.OneToOneField(Player, on_delete=models.CASCADE, related_name='evaluation', verbose_name='hráč')
    power = models.DecimalField(
        'power (mil.)', max_digits=6, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(Decimal('9999.9'))],
    )  # fmt: skip
    # not written down any more (Gether 14. 10. 2026: "aktuálny acclaim dajme preč") – dropped later with Gether's yes
    acclaim = models.PositiveBigIntegerField(
        'aktuálny acclaim (nepoužíva sa)', null=True, blank=True, validators=[MaxValueValidator(10**12)]
    )
    t4 = models.BooleanField('iba T4 jednotky', default=False)
    power_bonus = models.DecimalField(
        'úprava odporúčanej power (mil.)', max_digits=5, decimal_places=1, default=0,
        validators=[MinValueValidator(Decimal('-999.9')), MaxValueValidator(Decimal('999.9'))],
    )  # fmt: skip
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        verbose_name = 'vyhodnocovanie hráča'
        verbose_name_plural = 'vyhodnocovanie hráčov'

    def __str__(self):
        return f'{self.player} · vyhodnocovanie'


class MarchNotice(models.Model):
    """A Discord DM from the bot telling a player which of their marches the KvK evaluation does not like – a wrong
    commander pair or formation, what /marche shows them in red (Gether 14. 10. 2026: "hromadné odoslanie discord
    správy"). The superadmin queues it from a preview, the worker sends it (accounts/notices.py). Kept 30 days, the
    privacy page says so; gone with the account."""

    class State(models.TextChoices):
        PENDING = 'pending', 'čaká'
        SENT = 'sent', 'odoslané'
        FAILED = 'failed', 'neodoslané'
        # the marches were fixed before it went out
        SKIPPED = 'skipped', 'netreba'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='march_notices', verbose_name='hráč')
    # what was wrong when it was queued (and sent) – the same problems are not told twice
    fingerprint = models.CharField('chyby', max_length=40)
    text = models.TextField('správa', blank=True)
    state = models.CharField('stav', max_length=8, choices=State.choices, default=State.PENDING)
    error = models.CharField('chyba', max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+', verbose_name='od'
    )
    created_at = models.DateTimeField('zaradené', auto_now_add=True)
    claimed_at = models.DateTimeField('posiela sa od', null=True, blank=True)
    sent_at = models.DateTimeField('odoslané', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'upozornenie na marche'
        verbose_name_plural = 'upozornenia na marche'

    def __str__(self):
        return f'{self.player} · {self.get_state_display()}'


# the forum on /forum (Gether 25. 10. 2026: "spoločná inkognito roomka … nikto nevedel, kto čo pridal")
MAX_FORUM_TITLE = 120
MAX_FORUM_POST = 1000


class ForumThread(models.Model):
    """A thread of the anonymous forum of the approved players. Nothing links it or its posts to a player – which
    ones are yours only your browser knows (a signed cookie, accounts/forum_views.py)."""

    title = models.CharField('názov', max_length=MAX_FORUM_TITLE)
    created_at = models.DateTimeField('založené', auto_now_add=True)
    last_post_at = models.DateTimeField('posledný príspevok', db_index=True)
    # the last "Anonym N" handed out in the thread
    aliases = models.PositiveIntegerField('anonymov', default=0)
    # the superadmin keeps it on top of the list (rules, a KvK thread)
    pinned = models.BooleanField('pripnuté', default=False)

    class Meta:
        ordering = ['-pinned', '-last_post_at', '-pk']
        verbose_name = 'vlákno fóra'
        verbose_name_plural = 'vlákna fóra'

    def __str__(self):
        return self.title


class ForumPost(models.Model):
    """A message in a thread – the text, when, and the writer's number in the thread ("Anonym 2"), no player."""

    thread = models.ForeignKey(ForumThread, on_delete=models.CASCADE, related_name='posts', verbose_name='vlákno')
    alias = models.PositiveIntegerField('anonym')
    body = models.TextField('text', max_length=MAX_FORUM_POST)
    created_at = models.DateTimeField('napísané', auto_now_add=True, db_index=True)
    # its author changed the text (Gether 25. 10. 2026) – "upravené" next to the time
    edited_at = models.DateTimeField('upravené', null=True, blank=True, db_index=True)
    # the message it answers (Gether 25. 10. 2026: "reagovať na určitý príspevok"); gone with it
    reply_to = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='+', verbose_name='odpoveď na'
    )
    # how many browsers like it – which ones only their own cookie knows
    likes = models.PositiveIntegerField('páči sa', default=0)

    class Meta:
        ordering = ['created_at', 'pk']
        verbose_name = 'príspevok fóra'
        verbose_name_plural = 'príspevky fóra'

    def __str__(self):
        return f'{self.thread} · {self.created_at:%d. %m. %Y %H:%M}'


class HallEntry(models.Model):
    """A place in the Hall of Fame on /sien-slavy (Gether 28. 10. 2026: "kde budú určití naši hráči vyznamenaní za
    určité kritériá"): a category, its place (one champion per category, 1–2 in the mascots' corner), a player of the website
    or just a name, a short reason in SK/CZ and a photo the superadmin uploads (accounts/hall.py, stored in
    PRIVATE_MEDIA_ROOT/hall – only approved players see it). Goes with the player's account, the photo with the row."""

    class Category(models.TextChoices):
        FORTS = 'forts', 'ničiteľ pevností'
        KP = 'kp', 'top KP'
        RALLY = 'rally', 'rally líder'
        GARRISON = 'garrison', 'strážca garrisonu'
        HELPER = 'helper', 'pomocná ruka'
        # Gether 28. 10. 2026: "najlepší diplomat posledného KvK", the same day renamed "KvK Leader"
        DIPLOMAT = 'diplomat', 'KvK Leader'
        MASCOT = 'mascot', 'maskot KD'
        # the other corner: who was zeroed most in the last KvK (Gether 28. 10. 2026)
        ZERO = 'zero', 'top zero minulého KvK'

    category = models.CharField('kategória', max_length=12, choices=Category.choices)
    place = models.PositiveSmallIntegerField('miesto', validators=[MinValueValidator(1), MaxValueValidator(3)])
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE, null=True, blank=True, related_name='hall_entries', verbose_name='hráč'
    )
    # without a player the name alone; with one it replaces the player's name on the page
    name = models.CharField('meno', max_length=40, blank=True)
    note_sk = models.CharField('dôvod SK', max_length=120, blank=True)
    note_cs = models.CharField('dôvod CZ', max_length=120, blank=True)
    # the number behind the place – forts of the last week, kill points of the last KvK (Gether 28. 10. 2026)
    count = models.PositiveBigIntegerField('počet', null=True, blank=True)
    # relative to PRIVATE_MEDIA_ROOT, e.g. hall/mascot-1-3f2a….webp
    photo = models.CharField('fotka', max_length=120, blank=True)
    updated_at = models.DateTimeField('upravené', auto_now=True)

    class Meta:
        ordering = ['category', 'place']
        verbose_name = 'miesto v sieni slávy'
        verbose_name_plural = 'sieň slávy'
        constraints = [models.UniqueConstraint(fields=['category', 'place'], name='one_entry_per_hall_place')]

    def __str__(self):
        return f'{self.get_category_display()} · {self.place}.'


@receiver(post_delete, sender=HallEntry)
def _delete_hall_photo(sender, instance, **kwargs):
    """the photo goes with its row – also when the account cascades it away"""
    if instance.photo:
        from . import hall

        hall.remove_photo(instance.photo)
