from django import template

from kingdom.overview import overview

register = template.Library()


@register.simple_tag(takes_context=True)
def kd_overview(context):
    """The overview panel of the admin start page – superusers only, checked before any query."""
    request = context.get('request')
    user = getattr(request, 'user', None)
    if not getattr(user, 'is_superuser', False):
        return None
    return overview()
