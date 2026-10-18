"""What is left of the players' private screenshots (KvK sign-ups, marches). Since 12. 10. 2026 nothing is uploaded –
marches and sign-ups are clicked together (Gether) – and the daily sweep removes the old files from PRIVATE_MEDIA_ROOT
(the folder stays in the weekly backup until it is empty). can_review: who sees every player's sign-up and marches.
"""

import time
from pathlib import Path

from django.conf import settings

from .views import player_of

# the folders the screenshots were stored in
FOLDERS = ('kvk', 'marches')
# a file younger than this was kept by the sweep (an upload whose row was not written yet)
SWEEP_GRACE_SECONDS = 3600


def root() -> Path:
    return Path(settings.PRIVATE_MEDIA_ROOT)


def can_review(user) -> bool:
    """The superuser and the players the superuser marked as reviewers see every player's sign-ups and marches – a
    reviewer only while approved: taking the approval back cuts R4 off too, the switch stays for a new approval."""
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    player = player_of(user)
    return bool(player and player.kvk_reviewer and player.approved)


def sweep(referenced: set[str], now: float | None = None) -> int:
    """Deletes the files in FOLDERS that no row references and that are older than SWEEP_GRACE_SECONDS."""
    now = now or time.time()
    deleted = 0
    for folder in FOLDERS:
        directory = root() / folder
        if not directory.is_dir():
            continue
        for file in directory.iterdir():
            relative = f'{folder}/{file.name}'
            if relative in referenced or now - file.stat().st_mtime < SWEEP_GRACE_SECONDS:
                continue
            file.unlink(missing_ok=True)
            deleted += 1
    return deleted
