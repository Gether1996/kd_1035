import json
import re
from datetime import date
from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Max
from django.http import HttpResponse, HttpResponsePermanentRedirect
from django.shortcuts import render
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from django.utils.safestring import mark_safe
from django.views.decorators.clickjacking import xframe_options_exempt
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from . import armory, meta
from .commander_index import commander_index
from .models import Guide
from .roster import march_commanders
from .serializers import GuideDetailSerializer, GuideListSerializer

# Pages of the Angular app (Slovak paths; the Czech version lives under /cz)
STATIC_PAGES = ['', '/o-nas', '/kalendar', '/podmienky', '/ochrana-udajov', '/navody', '/slovnik'] + [f'/navody/{c}' for c in Guide.Category.values]

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
# What the head of a guide page needs from the app's dictionaries (sk.ts, cs.ts): the breadcrumbs (nav.home,
# nav.guides, guides.categories.*.title) and the meta of a missing guide (notFound.title, notFound.text)
GUIDE_PAGE_TEXT = {
    'sk': {
        'home': 'Domov',
        'guides': 'Návody',
        'categories': {'commanderi': 'Commanderi', 'vybava': 'Výbava', 'eventy': 'Eventy', 'tipy': 'Tipy a triky'},
        'not_found': (
            'Táto stránka neexistuje',
            'Odkaz je zrejme zastaraný alebo s preklepom – pokračuj na úvod alebo do návodov.',
        ),
    },
    'cs': {
        'home': 'Domů',
        'guides': 'Návody',
        'categories': {'commanderi': 'Commandeři', 'vybava': 'Výbava', 'eventy': 'Eventy', 'tipy': 'Tipy a triky'},
        'not_found': (
            'Tato stránka neexistuje',
            'Odkaz je nejspíš zastaralý nebo s překlepem – pokračuj na úvod nebo do návodů.',
        ),
    },
}
# Calendar page title and description (seo.calendar in sk.ts and cs.ts): the preview of an unknown or hidden event
CALENDAR_META = {
    'sk': (
        'Kalendár eventov · KD 1035 Rise of Kingdoms CZ/SK',
        'Všetky eventy slovensko-českého kráľovstva KD 1035 v Rise of Kingdoms na jednom mieste – v tvojom čase aj '
        'v hernom čase UTC.',
    ),
    'cs': (
        'Kalendář eventů · KD 1035 Rise of Kingdoms CZ/SK',
        'Všechny eventy česko-slovenského království KD 1035 v Rise of Kingdoms na jednom místě – ve tvém čase i '
        'v herním čase UTC.',
    ),
}
# Description of an event's preview (kingdom.preview): a run with its date / an event without one / a one-off event
# that is over. Only here – the web says the same with calendar.intro and calendar.irregularText in sk.ts and cs.ts;
# keep the tone in sync.
EVENT_META = {
    'sk': (
        'Kalendár eventov KD 1035 – termín v tvojom čase a pripomienka na Discorde.',
        'Ďalší termín oznámime v kalendári KD 1035.',
        'Event skončil.',
    ),
    'cs': (
        'Kalendář eventů KD 1035 – termín ve tvém čase a připomínka na Discordu.',
        'Další termín oznámíme v kalendáři KD 1035.',
        'Event skončil.',
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


class CommanderIndex(APIView):
    """Commander finder on /navody: every commander of the commander guides with the pairs recommended for them."""

    def get(self, request):
        response = Response(commander_index())
        # changes with the monthly meta update or when a guide is hidden in the admin – an hour late is fine
        response['Cache-Control'] = 'public, max-age=3600'
        return response


class MarchCommanders(APIView):
    """The commanders a march may name (guides/roster.py) with their portraits; pick=False are no longer offered."""

    def get(self, request):
        response = Response(march_commanders())
        response['Cache-Control'] = 'public, max-age=3600'
        return response


class Armory(APIView):
    """Every equipment item, set and armament inscription a march may name (guides/armory.py)."""

    def get(self, request):
        response = Response(armory.catalog())
        response['Cache-Control'] = 'public, max-age=3600'
        return response


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
    if not guide:
        # unknown, unpublished or malformed address: nothing about the guide, only the site itself
        return preview_page(
            request, lang, origin, 404, title=site_title, description=site_description, url=origin + (prefix or '/')
        )

    title = guide.title_cs if lang == 'cs' and guide.title_cs else guide.title_sk
    url = origin + prefix + guide.get_absolute_url()
    return preview_page(
        request,
        lang,
        origin,
        200,
        title=title,
        page_title=f'{title} | KD 1035',
        description=guide.excerpt(lang) or site_description,
        url=url,
        canonical=url,
        og_type='article',
        modified=guide.updated_at,
    )


@xframe_options_exempt  # nginx sends the site's own X-Frame-Options (security-headers.conf)
def guide_page(request, path):
    """
    The head of a guide page for everyone – search engines get the guide's meta without running JavaScript.

    Guide pages are rendered in the browser, so the app shell alone would carry the home page's title. nginx proxies
    /[cz/]navody/<category>/<slug> here with SSI on (frontend/nginx/default.conf.template): the template includes the
    deployed shell (guide-shell/<lang>.head.html and .tail.html, frontend/scripts/guide-shell.mjs) around the
    title, description, canonical, hreflang, Open Graph and JSON-LD that the app's Seo service sets in the browser.
    An unknown or hidden guide is a real 404 with noindex; a guide moved to another category redirects (301).
    """
    match = GUIDE_PATH.match(path)
    lang = 'cs' if path.startswith('cz/') else 'sk'
    prefix = '/cz' if lang == 'cs' else ''
    origin = settings.SITE_URL or f'{request.scheme}://{request.get_host()}'
    guide = Guide.objects.filter(is_published=True, slug=match[3]).first() if match else None
    text = GUIDE_PAGE_TEXT[lang]
    graph = [
        {
            '@type': 'WebSite',
            '@id': f'{origin}/#website',
            'name': 'Kingdom 1035',
            'alternateName': ['KD 1035', 'Rise of Kingdoms KD 1035', 'CZ/SK Kingdom 1035'],
            'url': f'{origin}/',
            'inLanguage': ['sk', 'cs'],
        },
        {
            '@type': 'Organization',
            '@id': f'{origin}/#kingdom',
            'name': 'Kingdom 1035 – Rise of Kingdoms CZ/SK',
            'url': f'{origin}/',
            'logo': f'{origin}/icons/icon-512.png',
            'description': SITE_META[lang][1],
        },
    ]
    context = {
        'lang': lang,
        'image': f'{origin}/og-image.jpg',
        'locale': 'cs_CZ' if lang == 'cs' else 'sk_SK',
        'locale_alternate': 'sk_SK' if lang == 'cs' else 'cs_CZ',
    }

    if not guide:
        title, description = text['not_found']
        context.update(title=f'{title} | KD 1035', description=description, url=f'{origin}/{path}', noindex=True)
        status = 404
    else:
        if match[2] != guide.category:
            return HttpResponsePermanentRedirect(prefix + guide.get_absolute_url())
        title = guide.title_cs if lang == 'cs' and guide.title_cs else guide.title_sk
        guide_path = guide.get_absolute_url()
        crumbs = [
            (text['home'], prefix or '/'),
            (text['guides'], f'{prefix}/navody'),
            (text['categories'].get(guide.category, guide.get_category_display()), f'{prefix}/navody/{guide.category}'),
            (title, prefix + guide_path),
        ]
        graph.append(
            {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': i, 'name': name, 'item': origin + link}
                    for i, (name, link) in enumerate(crumbs, 1)
                ],
            }
        )
        context.update(
            title=f'{title} | KD 1035',
            description=guide.excerpt(lang) or SITE_META[lang][1],
            url=origin + prefix + guide_path,
            url_sk=origin + guide_path,
            url_cs=origin + '/cz' + guide_path,
        )
        status = 200

    # like Django's json_script: no "</script>" (or an SSI comment) can come out of a guide title
    ld = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False)
    context['json_ld'] = mark_safe(ld.translate({ord('<'): '\\u003C', ord('>'): '\\u003E', ord('&'): '\\u0026'}))
    response = render(request, 'guide_page.html', context, status=status)
    # the shell names the build's hashed scripts: never serve an old one after a deploy (like the other pages)
    response['Cache-Control'] = 'no-cache'
    # link-preview bots get another page under the same address (link_preview)
    patch_vary_headers(response, ['User-Agent'])
    return response


def preview_page(request, lang: str, origin: str, status: int, **context):
    """link_preview.html (Open Graph tags for link-preview bots) with the headers every preview needs.

    `context` gives title, description and url; page_title (default: title), og_type (website), canonical and
    modified are optional. Shared by guide and calendar event previews (kingdom.preview).
    """
    context = {
        'lang': lang,
        'page_title': context['title'],
        'og_type': 'website',
        'image': f'{origin}/og-image.jpg',
        'locale': 'cs_CZ' if lang == 'cs' else 'sk_SK',
        'locale_alternate': 'sk_SK' if lang == 'cs' else 'cs_CZ',
        **context,
    }
    response = render(request, 'link_preview.html', context, status=status)
    response['Cache-Control'] = 'public, max-age=300'
    # bot-only HTML must never compete with the real page in search results
    response['X-Robots-Tag'] = 'noindex'
    # served under the public page address to bots only (shared caches must not hand it to browsers)
    patch_vary_headers(response, ['User-Agent'])
    return response
