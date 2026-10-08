"""Guides kept up to date automatically: commander pairs, equipment and events.

Each module holds its guides as data (CATEGORY, VERIFIED, NOTE, GUIDES – each with slug, title, blocks and an
optional unit: the troop type shown as an icon in the guide list). `manage.py sync_meta_guides` (run on
every start by entrypoint.sh) renders them and writes them into the database – only into guides with
auto_update=True, so guides written or edited by hand in the admin are never overwritten.
The monthly meta update (.claude/workflows/kd-meta-update.js) edits these modules, not the database.
"""

from . import commanders, equipment, events

# day of the last monthly meta update (bumped by kd-meta-update even without changes) – shown in the site footer
LAST_UPDATE = '2026-10-07'

MODULES = (commanders, equipment, events)
