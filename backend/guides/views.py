import re
from datetime import date
from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Max
from django.http import HttpResponse
from django.shortcuts import render
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from . import meta
from .models import Guide
from .serializers import GuideDetailSerializer, GuideListSerializer

# Pages of the Angular app (Slovak paths; the Czech version lives under /cz)
STATIC_PAGES = ['', '/o-nas', '/kalendar', '/podmienky', '/ochrana-udajov', '/navody'] + [f'/navody/{c}' for c in Guide.Category.values]

# Guide address as nginx passes it to link_preview(): [cz/]navody/<category>/<slug>
GUIDE_PATH = re.compile(r'^(cz/)?navody/([a-z]+)/([-\w]+)/?$')
# Home page title and description of the app (seo.home in frontend/src/app/core/i18n/sk.ts and cs.ts)
SITE_META = {
    'sk': (
        'KD 1035 · Slovenské a české kráľovstvo v Rise of Kingdoms',
        'Kingdom 1035 je jediné čisto CZ/SK kráľovstvo v Rise of Kingdoms. Hráme po slovensky a po česky – spoločné '
        'KvK, Discord a pomoc nováčikom.',
    ),
    'cs': (
        'KD 1035 · České a slovenské království v Rise of Kingdoms',
        'Kingdom 1035 je jediné čistě CZ/SK království v Rise of Kingdoms. Hrajeme česky a slovensky – společné KvK, '
        'Discord a pomoc nováčkům.',
    ),
}


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


def link_preview(request, path):
    """
    Open Graph page of a guide for link-preview bots (Discord, Facebook…), which do not run JavaScript.

    Guide pages are rendered in the browser, so their app shell has only the generic site meta. nginx sends known
    preview bots here (frontend/nginx/default.conf.template); the page carries the same title and intro as the guide.
    """
    match = GUIDE_PATH.match(path)
    lang = 'cs' if path.startswith('cz/') else 'sk'
    prefix = '/cz' if lang == 'cs' else ''
    origin = settings.SITE_URL or f'{request.scheme}://{request.get_host()}'
    guide = Guide.objects.filter(is_published=True, slug=match[3]).first() if match else None

    site_title, site_description = SITE_META[lang]
    if guide:
        title = guide.title_cs if lang == 'cs' and guide.title_cs else guide.title_sk
        description = guide.excerpt(lang) or site_description
        url = origin + prefix + guide.get_absolute_url()
    else:
        # unknown, unpublished or malformed address: nothing about the guide, only the site itself
        title, description, url = site_title, site_description, origin + (prefix or '/')

    context = {
        'lang': lang,
        'guide': guide,
        'title': title,
        'page_title': f'{title} | KD 1035' if guide else title,
        'description': description,
        'url': url,
        'image': f'{origin}/og-image.jpg',
        'locale': 'cs_CZ' if lang == 'cs' else 'sk_SK',
        'locale_alternate': 'sk_SK' if lang == 'cs' else 'cs_CZ',
    }
    response = render(request, 'guides/link_preview.html', context, status=200 if guide else 404)
    response['Cache-Control'] = 'public, max-age=300'
    # bot-only HTML must never compete with the real page in search results
    response['X-Robots-Tag'] = 'noindex'
    # served under the public guide address to bots only (shared caches must not hand it to browsers)
    patch_vary_headers(response, ['User-Agent'])
    return response
