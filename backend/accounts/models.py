from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

CDN = 'https://cdn.discordapp.com'


class Player(models.Model):
    """A member signed in with Discord. Scope identify only: ID, name and avatar – no e-mail, no servers.

    Personal data: these rows (and the discord_<id> users) never go into the git snapshot (kingdom/snapshot.py).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='player', verbose_name='používateľ'
    )
    discord_id = models.CharField('Discord ID', max_length=24, unique=True)
    username = models.CharField('Discord meno', max_length=40)
    global_name = models.CharField('zobrazované meno', max_length=64, blank=True)
    avatar = models.CharField('avatar (hash)', max_length=64, blank=True)
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


# the same limit in the frontend: core/governors-api.ts
MAX_GOVERNORS = 5
governor_id_validator = RegexValidator(r'^[0-9]{6,12}$', 'Governor ID má 6 až 12 číslic.')


class Governor(models.Model):
    """A Governor ID (in-game account) a player registered on /ucet.

    Rise of Kingdoms has no API, so R4 confirm it in the game and approve it in the admin. One Governor ID can be
    claimed only once at a time; after a rejection it can be submitted again. Personal data like Player.
    """

    class Kind(models.TextChoices):
        MAIN = 'main', 'Hlavný účet'
        FARM = 'farm', 'Farma'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Čaká na schválenie'
        APPROVED = 'approved', 'Schválený'
        REJECTED = 'rejected', 'Zamietnutý'

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='governors', verbose_name='hráč')
    governor_id = models.CharField('Governor ID', max_length=12, validators=[governor_id_validator])
    name = models.CharField('meno v hre', max_length=32)
    kind = models.CharField('typ', max_length=8, choices=Kind.choices, default=Kind.MAIN)
    alliance = models.ForeignKey(
        'kingdom.Alliance',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='governors',
        verbose_name='aliancia',
        help_text='Prázdne = iná / žiadna.',
    )
    status = models.CharField(
        'stav',
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        help_text='Pred schválením over v hre meno a Governor ID (profil governora, zoznam členov aliancie).',
    )
    review_note = models.CharField(
        'poznámka pre hráča',
        max_length=200,
        blank=True,
        help_text='Hráč ju uvidí pri governorovi na webe, napr. dôvod zamietnutia. Hromadné schválenie ju vymaže.',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='posúdil',
    )
    reviewed_at = models.DateTimeField('posúdené', null=True, blank=True)
    created_at = models.DateTimeField('registrovaný', auto_now_add=True)
    updated_at = models.DateTimeField('upravený', auto_now=True)

    class Meta:
        # waiting registrations first
        ordering = [models.Case(models.When(status='pending', then=0), default=1), '-created_at']
        verbose_name = 'governor'
        verbose_name_plural = 'governori'
        constraints = [
            models.UniqueConstraint(
                fields=['governor_id'], condition=~models.Q(status='rejected'), name='governor_id_taken'
            )
        ]

    def __str__(self):
        return f'{self.name} ({self.governor_id})'

    def clean(self):
        # the admin form leaves governor_id out (read-only), so Django skips the unique constraint there –
        # without this check, turning a rejected entry back on would end in an IntegrityError
        if self.status != self.Status.REJECTED and self.governor_id and self.is_taken(self.governor_id, self.pk):
            raise ValidationError('Tento Governor ID už má iný záznam, ktorý čaká alebo je schválený.')

    @classmethod
    def is_taken(cls, governor_id: str, exclude_pk: int | None = None) -> bool:
        """Claimed by an entry that is pending or approved (rejected ones do not count)."""
        return (
            cls.objects.filter(governor_id=governor_id)
            .exclude(status=cls.Status.REJECTED)
            .exclude(pk=exclude_pk)
            .exists()
        )
