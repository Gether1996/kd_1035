from django.conf import settings
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
