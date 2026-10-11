"""Deleting the players' private screenshots: their files go with their rows, KvK rounds go KVK_KEEP_DAYS after they
closed, and a daily sweep removes files no row points to (private_images.py)."""

from datetime import timedelta

from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from . import private_images
from .models import KvkImage, KvkRound, MarchImage

# a closed round with its sign-ups and screenshots is deleted this long after it closed (privacy page: 60 days)
KVK_KEEP_DAYS = 60


@receiver(post_delete, sender=KvkImage)
@receiver(post_delete, sender=MarchImage)
def delete_files(sender, instance, **kwargs):
    """Also when a whole round, sign-up, march or player account is deleted (cascades send post_delete per row)."""
    private_images.unlink_on_commit(instance.path, instance.thumb)


def prune_kvk(now=None) -> int:
    """Rounds closed more than KVK_KEEP_DAYS ago, with every sign-up and screenshot."""
    now = now or timezone.now()
    old = KvkRound.objects.filter(is_open=False, closed_at__lt=now - timedelta(days=KVK_KEEP_DAYS))
    count = 0
    for kvk_round in old:
        kvk_round.delete()
        count += 1
    return count


def sweep_files() -> int:
    referenced = set()
    for model in (KvkImage, MarchImage):
        for path, thumb in model.objects.values_list('path', 'thumb'):
            referenced.update((path, thumb))
    return private_images.sweep(referenced)
