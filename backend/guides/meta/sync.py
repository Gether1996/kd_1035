from ..models import Guide
from ..sanitize import clean_html
from . import MODULES
from .render import render, verified_note


def rendered_guides(modules=MODULES):
    """Every guide of the meta modules as Guide field values (HTML already in its sanitized form)."""
    for module in modules:
        note = verified_note(module.VERIFIED, module.NOTE)
        for order, guide in enumerate(module.GUIDES):
            yield {
                'slug': guide['slug'],
                'category': module.CATEGORY,
                'title_sk': guide['title']['sk'],
                'title_cs': guide['title']['cs'],
                'html_sk': clean_html(render(guide['blocks'], 'sk', note)),
                'html_cs': clean_html(render(guide['blocks'], 'cs', note)),
                'order': order,
            }


def sync_guides(modules=MODULES) -> dict:
    """Creates missing guides and updates the auto_update ones; saves only real changes (keeps updated_at)."""
    stats = {'created': 0, 'updated': 0, 'unpublished': 0}
    slugs = set()
    for data in rendered_guides(modules):
        slugs.add(data['slug'])
        guide = Guide.objects.filter(slug=data['slug']).first()
        if guide is None:
            Guide.objects.create(**data, auto_update=True, is_published=True)
            stats['created'] += 1
        elif guide.auto_update:
            changed = [field for field, value in data.items() if getattr(guide, field) != value]
            if changed:
                for field in changed:
                    setattr(guide, field, data[field])
                guide.save()
                stats['updated'] += 1
    # a guide dropped from the content is hidden, not deleted (its images and links stay)
    stats['unpublished'] = (
        Guide.objects.filter(auto_update=True, is_published=True).exclude(slug__in=slugs).update(is_published=False)
    )
    return stats
