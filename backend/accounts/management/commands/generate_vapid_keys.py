import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.core.management.base import BaseCommand


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


class Command(BaseCommand):
    help = 'Prints a new VAPID key pair for web push (browser notifications) as .env lines.'

    def handle(self, *args, **options):
        key = ec.generate_private_key(ec.SECP256R1())
        public = key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        subject = settings.SITE_URL if settings.SITE_URL.startswith('https://') else 'https://kd1035.eu'
        self.stdout.write(f'VAPID_PUBLIC_KEY={b64url(public)}')
        self.stdout.write(f'VAPID_PRIVATE_KEY={b64url(key.private_numbers().private_value.to_bytes(32, "big"))}')
        self.stdout.write(f'VAPID_SUBJECT={subject}')
        self.stderr.write(
            'Skopíruj tieto riadky do .env. Nový kľúč zruší notifikácie, ktoré si hráči zapli so starým – '
            'musia ich zapnúť znova.'
        )
