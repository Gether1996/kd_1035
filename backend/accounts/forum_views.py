"""The forum on /forum (Gether 25. 10. 2026: "spoločná inkognito roomka, kde ktokoľvek povolený hráč môže pridať
vlákno a v ňom bude diskusia, všetci inkognito"; later the same day: open to everyone, also without signing in):
threads and their messages like a chat room. Nobody learns who wrote what – the database keeps no player with a
thread or a message, only the writer's number in the thread ("Anonym 2").

Which threads and messages are yours (to delete them), your number in each thread and the time of your last message
(one message per 5 minutes, Gether: "nech tam nie je spam", "len na session") live in a signed cookie in your browser
only – the server keeps none of it. Another browser, or a deleted cookie, is a new anonym who cannot delete the old
messages. The superadmin deletes any thread or message (moderation), still without seeing who wrote it.

Bots (Gether: "ochrana proti botom, nech tam nie je spam"), on top of nginx's limits:
- the CSRF token also for a visitor who is not signed in (Csrf),
- a field hidden from people (`website`) and the time the form was open (`elapsed`, ms),
- one message per 5 minutes per browser (the cookie) and FORUM_IP_RATE per IP – counted in memory, no IP is stored,
- no links from a visitor who is not signed in,
- at most BUSY_POSTS messages and BUSY_THREADS new threads an hour on the whole forum (the superadmin is never held).
"""

import re
import time
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Count, F, Max, OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .local_auth import MIN_ELAPSED_MS, Csrf
from .models import MAX_FORUM_POST, MAX_FORUM_TITLE, ForumPost, ForumThread
from .reminder_views import iso

# the list shows the most recent threads, a thread its latest messages
MAX_THREADS = 200
MAX_POSTS = 300
COOLDOWN = timedelta(minutes=5)

COOKIE = 'kd1035_forum'
COOKIE_AGE = 60 * 60 * 24 * 90
SALT = 'accounts.forum'
# what the cookie remembers at most – the newest win (a browser cookie holds about 4 kB)
KEEP_POSTS = 150
KEEP_THREADS = 60
KEEP_LIKES = 300
# the quoted message above a reply, the last message under a thread's title in the list
QUOTE = 140
PREVIEW = 90
# the whole forum in the last hour – a bot with many IPs and fresh cookies still stops here
BUSY_POSTS = 120
BUSY_THREADS = 15
# what a spam bot posts: an address, a Discord invite, a domain
LINK = re.compile(r'https?://|www\.|discord\.gg|\b[\w-]+\.(?:com|net|org|ru|xyz|io|me|link|top|sk|cz|eu)\b', re.I)


class ForumIpThrottle(SimpleRateThrottle):
    """Messages and threads per IP (in memory, per process) – a browser that throws its cookie away still waits"""

    scope = 'forum'
    rate = '20/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class PostSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=MAX_FORUM_POST, trim_whitespace=True)


class ReplySerializer(PostSerializer):
    reply_to = serializers.IntegerField(required=False, allow_null=True)


class LikeThrottle(SimpleRateThrottle):
    """Likes per IP (in memory, per process) – a browser that throws its cookie away cannot pile them up"""

    scope = 'forum_like'
    rate = '120/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class TitleSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=MAX_FORUM_TITLE, trim_whitespace=True)


class ThreadSerializer(PostSerializer, TitleSerializer):
    pass


class Mine:
    """The browser's own forum cookie: {u: the signed-in user it belongs to (another account in the same browser starts
    empty), p: my message ids, t: my thread ids, a: {thread id: my number in it}, l: when I last wrote (unix), k: the
    messages I like}"""

    def __init__(self, request):
        self.user = request.user.pk
        try:
            data = signing.loads(request.COOKIES.get(COOKIE, ''), salt=SALT)
        except signing.BadSignature:
            data = {}
        if not isinstance(data, dict) or data.get('u') != self.user:
            data = {}
        self.posts: list[int] = data.get('p', [])
        self.threads: list[int] = data.get('t', [])
        self.aliases: dict[str, int] = data.get('a', {})
        self.last: float = data.get('l', 0)
        self.likes: list[int] = data.get('k', [])
        self.superuser = request.user.is_superuser

    def wait(self) -> int:
        """seconds until this browser may write again – the web counts them down at the message box"""
        if self.superuser:
            return 0
        left = self.last + COOLDOWN.total_seconds() - time.time()
        return int(left) + 1 if left > 0 else 0

    def wrote(self, post: ForumPost, thread: ForumThread | None = None):
        self.posts = [*self.posts, post.pk][-KEEP_POSTS:]
        if thread:
            self.threads = [*self.threads, thread.pk][-KEEP_THREADS:]
        self.aliases[str(post.thread_id)] = post.alias
        self.aliases = dict(list(self.aliases.items())[-KEEP_THREADS:])
        self.last = time.time()

    def save(self, response: Response) -> Response:
        value = signing.dumps(
            {
                'u': self.user,
                'p': self.posts,
                't': self.threads,
                'a': self.aliases,
                'l': int(self.last),
                'k': self.likes,
            },
            salt=SALT,
            compress=True,
        )
        response.set_cookie(
            COOKIE,
            value,
            max_age=COOKIE_AGE,
            httponly=True,
            samesite='Lax',
            secure=settings.SESSION_COOKIE_SECURE,
        )
        return response


def thread_data(thread: ForumThread, mine: Mine, posts: int, last: str = '') -> dict:
    return {
        'id': thread.pk,
        'title': thread.title,
        'created_at': iso(thread.created_at),
        'last_post_at': iso(thread.last_post_at),
        'posts': posts,
        'mine': thread.pk in mine.threads,
        'pinned': thread.pinned,
        'last': shorten(last, PREVIEW),
    }


def shorten(text: str, length: int) -> str:
    return text if len(text) <= length else text[: length - 1].rstrip() + '…'


def post_data(post: ForumPost, mine: Mine) -> dict:
    return {
        'id': post.pk,
        'body': post.body,
        'at': iso(post.created_at),
        'alias': post.alias,
        'mine': post.pk in mine.posts,
        'edited': iso(post.edited_at) if post.edited_at else None,
        'likes': post.likes,
        'liked': post.pk in mine.likes,
        'reply': quote(post.reply_to, mine) if post.reply_to_id else None,
    }


def quote(post: ForumPost, mine: Mine) -> dict:
    """the answered message as the reply shows it above its text"""
    return {'id': post.pk, 'alias': post.alias, 'mine': post.pk in mine.posts, 'body': shorten(post.body, QUOTE)}


def no_links(request, texts: list[str]) -> Response | None:
    """a visitor who is not signed in sends no addresses – in a new message nor in an edit"""
    if not request.user.is_authenticated and any(LINK.search(t) for t in texts):
        return Response({'detail': 'links'}, status=400)
    return None


def refused(request, mine: Mine, texts: list[str], thread: bool = False) -> Response | None:
    """Why a new message (or thread) is not taken – None when it is"""
    if mine.superuser:
        return None
    body = request.data if isinstance(request.data, dict) else {}
    elapsed = body.get('elapsed')
    if body.get('website') or not isinstance(elapsed, int) or elapsed < MIN_ELAPSED_MS:
        return Response({'detail': 'invalid'}, status=400)
    if wait := mine.wait():
        return Response({'detail': 'cooldown', 'wait': wait}, status=429)
    if links := no_links(request, texts):
        return links
    hour = timezone.now() - timedelta(hours=1)
    busy = ForumPost.objects.filter(created_at__gte=hour).count() >= BUSY_POSTS or (
        thread and ForumThread.objects.filter(created_at__gte=hour).count() >= BUSY_THREADS
    )
    if busy or not ForumIpThrottle().allow_request(request, None):
        return Response({'detail': 'busy'}, status=429)
    return None


def alias_in(thread: ForumThread, mine: Mine) -> int:
    """my number in the thread – the next free one the first time I write there"""
    if alias := mine.aliases.get(str(thread.pk)):
        return alias
    ForumThread.objects.filter(pk=thread.pk).update(aliases=F('aliases') + 1)
    thread.refresh_from_db(fields=['aliases'])
    return thread.aliases


@never_cache
@api_view(['GET', 'POST'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def threads(request):
    """GET: the threads, pinned and the latest activity first (?brief=1: only id, time and mine – the account menu).
    POST {title, body}: a new thread with its first message."""
    mine = Mine(request)
    if request.method == 'GET' and request.query_params.get('brief'):
        # the account menu's "new messages" (core/forum-unread.ts): no counts, no texts
        rows = ForumThread.objects.order_by('-last_post_at', '-pk')[:MAX_THREADS]
        return Response(
            {'threads': [{'id': t.pk, 'last_post_at': iso(t.last_post_at), 'mine': t.pk in mine.threads} for t in rows]}
        )
    if request.method == 'GET':
        newest = ForumPost.objects.filter(thread=OuterRef('pk')).order_by('-created_at', '-pk').values('body')[:1]
        # an aggregate drops Meta.ordering – pinned, then the latest activity first, said again
        rows = (
            ForumThread.objects.annotate(count=Count('posts'), last=Subquery(newest))
            .order_by('-pinned', '-last_post_at', '-pk')[:MAX_THREADS]
        )
        return Response({'threads': [thread_data(t, mine, t.count, t.last or '') for t in rows], 'wait': mine.wait()})

    serializer = ThreadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    data = serializer.validated_data
    if refusal := refused(request, mine, [data['title'], data['body']], thread=True):
        return refusal
    with transaction.atomic():
        title = serializer.validated_data['title']
        thread = ForumThread.objects.create(title=title, aliases=1, last_post_at=timezone.now())
        post = ForumPost.objects.create(thread=thread, alias=1, body=serializer.validated_data['body'])
        ForumThread.objects.filter(pk=thread.pk).update(last_post_at=post.created_at)
    mine.wrote(post, thread)
    return mine.save(Response({**thread_data(thread, mine, 1), 'wait': mine.wait()}, status=201))


@never_cache
@api_view(['GET', 'POST', 'PATCH', 'DELETE'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def thread(request, thread_id):
    """GET ?after=<message id>&since=<time>: the thread and its latest messages (with after only the newer ones, with
    since also the older ones edited from then on – the open room asks again every few seconds; `now` is the next
    since). POST {body}: a message. PATCH {title}: a new title – its author only; PATCH {pinned}: on top of the list
    – the superadmin only. DELETE: the whole thread with every message in it – only its author or the superadmin
    (Gether 25. 10. 2026)."""
    mine = Mine(request)
    item = get_object_or_404(ForumThread, pk=thread_id)

    if request.method == 'GET':
        now = timezone.now()
        posts = item.posts.select_related('reply_to')
        edited = []
        after = request.query_params.get('after', '')
        if after.isdigit():
            posts = posts.filter(pk__gt=int(after))
            try:
                since = parse_datetime(request.query_params.get('since', ''))
            except ValueError:
                since = None
            if since:
                edited = item.posts.select_related('reply_to').filter(pk__lte=int(after), edited_at__gte=since)
        latest = list(posts.order_by('-created_at', '-pk')[:MAX_POSTS])[::-1]
        # every message of the window with its hearts: the open room refreshes the counts and drops the deleted ones
        # (those from `window` on that are missing here)
        likes = list(item.posts.order_by('-pk').values_list('pk', 'likes')[:MAX_POSTS])
        window = likes[-1][0] if len(likes) == MAX_POSTS else 0
        return Response(
            {
                'thread': thread_data(item, mine, item.posts.count()),
                'posts': [post_data(p, mine) for p in latest],
                'edited': [post_data(p, mine) for p in edited],
                'likes': {str(pk): count for pk, count in likes},
                'window': window,
                'now': iso(now),
                'wait': mine.wait(),
            }
        )

    if request.method == 'PATCH' and 'pinned' in request.data:
        if not request.user.is_superuser:
            return Response({'detail': 'forbidden'}, status=403)
        item.pinned = request.data['pinned'] is True
        item.save(update_fields=['pinned'])
        return Response(thread_data(item, mine, item.posts.count()))

    if request.method == 'PATCH':
        if item.pk not in mine.threads:
            return Response({'detail': 'forbidden'}, status=403)
        serializer = TitleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        if links := no_links(request, [serializer.validated_data['title']]):
            return links
        item.title = serializer.validated_data['title']
        item.save(update_fields=['title'])
        return Response(thread_data(item, mine, item.posts.count()))

    if request.method == 'DELETE':
        if not (request.user.is_superuser or item.pk in mine.threads):
            return Response({'detail': 'forbidden'}, status=403)
        item.delete()
        return Response(status=204)

    serializer = ReplySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    if refusal := refused(request, mine, [serializer.validated_data['body']]):
        return refusal
    # an answer to a message of this thread; a gone one is no answer
    answered = item.posts.filter(pk=serializer.validated_data.get('reply_to') or 0).first()
    with transaction.atomic():
        alias = alias_in(item, mine)
        post = ForumPost.objects.create(
            thread=item, alias=alias, body=serializer.validated_data['body'], reply_to=answered
        )
        ForumThread.objects.filter(pk=item.pk).update(last_post_at=post.created_at)
    mine.wrote(post)
    return mine.save(Response({**post_data(post, mine), 'wait': mine.wait()}, status=201))


@api_view(['PATCH', 'DELETE'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def post(request, post_id):
    """PATCH {body}: a new text – its author only (Gether 25. 10. 2026: "edit nech majú autori povolený"); no pause,
    marked "upravené". DELETE: one message – its author or the superadmin. A thread left without messages goes with
    it."""
    mine = Mine(request)
    item = get_object_or_404(ForumPost, pk=post_id)
    if request.method == 'PATCH':
        if item.pk not in mine.posts:
            return Response({'detail': 'forbidden'}, status=403)
        serializer = PostSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        if links := no_links(request, [serializer.validated_data['body']]):
            return links
        if serializer.validated_data['body'] != item.body:
            item.body = serializer.validated_data['body']
            item.edited_at = timezone.now()
            item.save(update_fields=['body', 'edited_at'])
        return Response(post_data(item, mine))
    if not (request.user.is_superuser or item.pk in mine.posts):
        return Response({'detail': 'forbidden'}, status=403)
    with transaction.atomic():
        thread = item.thread
        item.delete()
        last = thread.posts.aggregate(last=Max('created_at'))['last']
        if last is None:
            thread.delete()
        else:
            ForumThread.objects.filter(pk=thread.pk).update(last_post_at=last)
    return Response({'thread_deleted': last is None})


@api_view(['POST'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def like(request, post_id):
    """POST {liked: true|false}: a heart for someone else's message, or taken back (Gether 25. 10. 2026). Which
    messages this browser likes only its cookie knows – the database keeps the count."""
    mine = Mine(request)
    item = get_object_or_404(ForumPost, pk=post_id)
    if item.pk in mine.posts:
        return Response({'detail': 'own'}, status=400)
    liked = request.data.get('liked') is True if isinstance(request.data, dict) else False
    if liked != (item.pk in mine.likes):
        if not LikeThrottle().allow_request(request, None):
            return Response({'detail': 'busy'}, status=429)
        if liked:
            ForumPost.objects.filter(pk=item.pk).update(likes=F('likes') + 1)
            mine.likes = [*mine.likes, item.pk][-KEEP_LIKES:]
        else:
            ForumPost.objects.filter(pk=item.pk, likes__gt=0).update(likes=F('likes') - 1)
            mine.likes = [pk for pk in mine.likes if pk != item.pk]
        item.refresh_from_db(fields=['likes'])
    return mine.save(Response({'likes': item.likes, 'liked': liked}))

