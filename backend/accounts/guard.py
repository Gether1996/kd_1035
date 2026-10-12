"""Admin rights only for the admins named in .env (Gether 12. 10. 2026: "superadmin ostanem len ja, aj keď bude mať
kamarát prístup k DB").

The database alone never makes anyone an admin. is_staff / is_superuser count only in a session that proved it is one
of the admins when it signed in:
- Discord sign-in of an ID in DISCORD_ADMIN_IDS (the ID comes from Discord's OAuth answer, views.discord_callback), or
- the password sign-in of DJANGO_SUPERUSER_USERNAME whose password is DJANGO_SUPERUSER_PASSWORD from .env.

The proof is a key in the session. Session data in the database is signed with DJANGO_SECRET_KEY, so whoever edits
the database (a flag on their own user, a new superuser, another password hash) gets no admin rights without .env.
Every other session keeps the user's flags only in the database: for the request the user is a plain player, and a
warning goes to the log. Switched on in production (SUPERUSER_GUARD, default: not DEBUG).
"""

import logging

from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver

log = logging.getLogger(__name__)

SESSION_KEY = 'kd_admin'
DISCORD = 'discord:'
PASSWORD = 'password'


def admin_ids() -> set[str]:
    return {str(i) for i in settings.DISCORD_ADMIN_IDS if i}


def prove_discord(request, discord_id: str) -> None:
    """After a Discord sign-in: the session belongs to an admin when Discord said it is one of the admin IDs."""
    if discord_id in admin_ids():
        request.session[SESSION_KEY] = DISCORD + discord_id


@receiver(user_logged_in)
def prove_password(sender, request, user, **kwargs):
    """The password sign-in of the admin account from .env (Django admin): its password must be the one in .env –
    a hash changed in the database does not count."""
    if request is None or not hasattr(request, 'session'):
        return
    name, password = settings.SUPERUSER_USERNAME, settings.SUPERUSER_PASSWORD
    if name and password and user.username == name and user.check_password(password):
        request.session[SESSION_KEY] = PASSWORD


def proven(request) -> bool:
    value = request.session.get(SESSION_KEY, '')
    if value == PASSWORD:
        return bool(settings.SUPERUSER_USERNAME) and request.user.username == settings.SUPERUSER_USERNAME
    if value.startswith(DISCORD):
        discord_id = value.removeprefix(DISCORD)
        player = getattr(request.user, 'player', None)
        return discord_id in admin_ids() and player is not None and player.discord_id == discord_id
    return False


class SuperuserGuard:
    """After AuthenticationMiddleware: admin flags from the database count only in a proven session."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.SUPERUSER_GUARD:
            user = request.user
            if user.is_authenticated and (user.is_superuser or user.is_staff) and not proven(request):
                log.warning('Admin flags of user %s ignored: the session did not sign in as an admin from .env', user.pk)
                user.is_superuser = user.is_staff = False  # this request only – the database is left as it is
        return self.get_response(request)
