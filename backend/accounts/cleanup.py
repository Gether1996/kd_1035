"""Deleting the players' private screenshots: their files go with their rows, and a daily sweep removes files no
row points to (private_images.py)."""

from django.db.models.signals import post_delete
from django.dispatch import receiver

from . import private_images
from .models import KvkImage


@receiver(post_delete, sender=KvkImage)
def delete_files(sender, instance, **kwargs):
    """Also when a whole sign-up or player account is deleted (cascades send post_delete per row)."""
    private_images.unlink_on_commit(instance.path, instance.thumb)


def sweep_files() -> int:
    referenced = set()
    for path, thumb in KvkImage.objects.values_list('path', 'thumb'):
        referenced.update((path, thumb))
    return private_images.sweep(referenced)
