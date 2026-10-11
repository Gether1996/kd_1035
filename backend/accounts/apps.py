from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = 'accounts'
    verbose_name = 'Hráči'

    def ready(self):
        from . import cleanup  # noqa: F401 – deletes the screenshot files with their rows
