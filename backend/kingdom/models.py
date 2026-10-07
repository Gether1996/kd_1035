from django.db import models


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


class EventNotification(models.Model):
    """A message the worker posts to the Discord channel (webhook) at `send_at`."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Naplánovaná'
        SENT = 'sent', 'Odoslaná'
        FAILED = 'failed', 'Chyba'

    title = models.CharField('nadpis', max_length=200)
    message = models.TextField('text', blank=True, max_length=3500)
    send_at = models.DateTimeField('odoslať', help_text='Čas v Európe/Bratislave.')
    mention_role = models.BooleanField(
        'označiť rolu', default=True, help_text='Pingne Discord rolu nastavenú v DISCORD_EVENT_ROLE_ID.'
    )
    status = models.CharField('stav', max_length=8, choices=Status.choices, default=Status.PENDING)
    sent_at = models.DateTimeField('odoslaná', null=True, blank=True)
    error = models.TextField('chyba', blank=True)

    class Meta:
        ordering = ['-send_at']
        verbose_name = 'Discord notifikácia'
        verbose_name_plural = 'Discord notifikácie'

    def __str__(self):
        return self.title
