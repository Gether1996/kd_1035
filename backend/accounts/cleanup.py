"""The players' screenshots are gone (12. 10. 2026: marches and KvK sign-ups are clicked together, Gether): a daily
sweep removes the files left in the private folders (private_images.py) – no row points to any of them any more."""

from . import private_images


def sweep_files() -> int:
    return private_images.sweep(set())
