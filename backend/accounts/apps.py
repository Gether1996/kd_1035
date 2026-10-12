from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = 'accounts'
    verbose_name = 'Hráči'

    def ready(self):
        from . import guard  # noqa: F401 – the admin password sign-in proves the session (signal)
