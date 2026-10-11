"""Cleans pasted guide HTML: keeps formatting, tables, images and video embeds; drops scripts and styles."""

import nh3

TAGS = {
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'section', 'article', 'header', 'footer',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup', 'abbr', 'kbd', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure', 'figcaption', 'picture', 'source',
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'details', 'summary', 'iframe',
}  # fmt: skip

ATTRIBUTES = {
    '*': {'class', 'style', 'title', 'align'},
    'a': {'href', 'target'},
    'img': {'src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading'},
    'source': {'srcset', 'sizes', 'media', 'type'},
    'th': {'colspan', 'rowspan', 'scope'},
    'td': {'colspan', 'rowspan'},
    'col': {'span'},
    'colgroup': {'span'},
    'ol': {'start', 'type', 'reversed'},
    'iframe': {'src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading'},
}

# only video players may be embedded
EMBEDS = (
    'https://www.youtube.com/embed/',
    'https://www.youtube-nocookie.com/embed/',
    'https://player.twitch.tv/',
    'https://clips.twitch.tv/embed',
)
# YouTube players are switched to the privacy-enhanced mode (named on the privacy page)
YOUTUBE = 'https://www.youtube.com/embed/'
YOUTUBE_NOCOOKIE = 'https://www.youtube-nocookie.com/embed/'


def _local(url: str) -> bool:
    """an address on this site (/uploads/…, /static/…) – not //host/… and no scheme"""
    return url.startswith('/') and not url.startswith('//') and '\\' not in url


def _filter(tag: str, attr: str, value: str) -> str | None:
    # pictures only from this site: an outside one would tell its server the IP of every reader (the privacy page
    # names no such third party)
    if tag in ('img', 'source') and attr == 'src':
        return value if _local(value.strip()) else None
    if tag in ('img', 'source') and attr == 'srcset':
        urls = [candidate.strip().split()[0] for candidate in value.split(',') if candidate.strip()]
        return value if urls and all(_local(url) for url in urls) else None
    # url() or image-set() in a style loads an outside picture the same way; a backslash escape could hide either
    if attr == 'style' and any(part in value.lower() for part in ('url', 'image', '\\')):
        return None
    if tag == 'iframe' and attr == 'src':
        if not value.startswith(EMBEDS):
            return None
        if value.startswith(YOUTUBE):
            return YOUTUBE_NOCOOKIE + value.removeprefix(YOUTUBE)
    return value


def clean_html(html: str) -> str:
    if not html:
        return ''
    return nh3.clean(
        html,
        tags=TAGS,
        attributes=ATTRIBUTES,
        attribute_filter=_filter,
        url_schemes={'http', 'https', 'mailto'},
        link_rel='noopener noreferrer',
        strip_comments=True,
    ).strip()
