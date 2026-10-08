from datetime import date
from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Max
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from . import meta
from .models import Guide
from .serializers import GuideDetailSerializer, GuideListSerializer

# Pages of the Angular app (Slovak paths; the Czech version lives under /cz)
STATIC_PAGES = ['', '/o-nas', '/podmienky'] +[f'/navody/{c}' for c in Guide.Category.values]


class GuideList(ListAPIView):
    serializer_class = GuideListSerializer
    queryset = Guide.objects.filter(is_published=True)


class GuideDetail(RetrieveAPIView):
    serializer_class = GuideDetailSerializer
    queryset = Guide.objects.filter(is_published=True)
    lookup_field = 'slug'


class SiteStatus(APIView):
    """Footer "information updated on": the later of the monthly meta check and the last change of a guide."""

    def get(self, request):
        verified = date.fromisoformat(meta.LAST_UPDATE)
        changed = Guide.objects.filter(is_published=True).aggregate(last=Max('updated_at'))['last']
        updated = max(verified, timezone.localdate(changed)) if changed else verified
        return Response({'updated': updated.isoformat(), 'meta_verified': verified.isoformat()})


def sitemap(request):
    """sitemap.xml with every page in both languages (hreflang alternates), including published guides."""
    origin = settings.SITE_URL or f'{request.scheme}://{request.get_host()}'
    entries = [(path, None) for path in STATIC_PAGES]
    entries += [(g.get_absolute_url(), g.updated_at) for g in Guide.objects.filter(is_published=True)]

    def url(path, prefix=''):
        return escape(origin + (prefix + path or '/'))

    rows = []
    for path, updated in entries:
        alternates = (
            f'<xhtml:link rel="alternate" hreflang="sk" href="{url(path)}"/>'
            f'<xhtml:link rel="alternate" hreflang="cs" href="{url(path, "/cz")}"/>'
            f'<xhtml:link rel="alternate" hreflang="x-default" href="{url(path)}"/>'
        )
        lastmod = f'<lastmod>{updated.date().isoformat()}</lastmod>' if updated else ''
        for prefix in ('', '/cz'):
            rows.append(f'<url><loc>{url(path, prefix)}</loc>{lastmod}{alternates}</url>')

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
        + ''.join(rows)
        + '</urlset>\n'
    )
    return HttpResponse(xml, content_type='application/xml')
