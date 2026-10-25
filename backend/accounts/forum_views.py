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
from django.db.models import Count, F, Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
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


class ThreadSerializer(PostSerializer):
    title = serializers.CharField(max_length=MAX_FORUM_TITLE, trim_whitespace=True)


class Mine:
    """The browser's own forum cookie: {u: the signed-in user it belongs to (another account in the same browser starts
    empty), p: my message ids, t: my thread ids, a: {thread id: my number in it}, l: when I last wrote (unix)}"""

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
            {'u': self.user, 'p': self.posts, 't': self.threads, 'a': self.aliases, 'l': int(self.last)}, salt=SALT
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


def thread_data(thread: ForumThread, mine: Mine, posts: int) -> dict:
    return {
        'id': thread.pk,
        'title': thread.title,
        'created_at': iso(thread.created_at),
        'last_post_at': iso(thread.last_post_at),
        'posts': posts,
        'mine': thread.pk in mine.threads,
    }


def post_data(post: ForumPost, mine: Mine) -> dict:
    return {
        'id': post.pk,
        'body': post.body,
        'at': iso(post.created_at),
        'alias': post.alias,
        'mine': post.pk in mine.posts,
    }


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
    if not request.user.is_authenticated and any(LINK.search(t) for t in texts):
        return Response({'detail': 'links'}, status=400)
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
    """GET: the threads, the latest activity first. POST {title, body}: a new thread with its first message."""
    mine = Mine(request)
    if request.method == 'GET':
        # an aggregate drops Meta.ordering – the latest activity first, said again
        rows = ForumThread.objects.annotate(count=Count('posts')).order_by('-last_post_at', '-pk')[:MAX_THREADS]
        return Response({'threads': [thread_data(t, mine, t.count) for t in rows], 'wait': mine.wait()})

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
@api_view(['GET', 'POST', 'DELETE'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def thread(request, thread_id):
    """GET ?after=<message id>: the thread and its latest messages (only the newer ones with after – the open room
    asks again every few seconds). POST {body}: a message. DELETE: the whole thread with every message in it – only
    its author or the superadmin (Gether 25. 10. 2026)."""
    mine = Mine(request)
    item = get_object_or_404(ForumThread, pk=thread_id)

    if request.method == 'GET':
        posts = item.posts.all()
        after = request.query_params.get('after', '')
        if after.isdigit():
            posts = posts.filter(pk__gt=int(after))
        latest = list(posts.order_by('-created_at', '-pk')[:MAX_POSTS])[::-1]
        return Response(
            {
                'thread': thread_data(item, mine, item.posts.count()),
                'posts': [post_data(p, mine) for p in latest],
                'wait': mine.wait(),
            }
        )

    if request.method == 'DELETE':
        if not (request.user.is_superuser or item.pk in mine.threads):
            return Response({'detail': 'forbidden'}, status=403)
        item.delete()
        return Response(status=204)

    serializer = PostSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    if refusal := refused(request, mine, [serializer.validated_data['body']]):
        return refusal
    with transaction.atomic():
        alias = alias_in(item, mine)
        post = ForumPost.objects.create(thread=item, alias=alias, body=serializer.validated_data['body'])
        ForumThread.objects.filter(pk=item.pk).update(last_post_at=post.created_at)
    mine.wrote(post)
    return mine.save(Response({**post_data(post, mine), 'wait': mine.wait()}, status=201))


@api_view(['DELETE'])
@authentication_classes([Csrf])
@permission_classes([AllowAny])
def post(request, post_id):
    """DELETE: one message – its author or the superadmin. A thread left without messages goes with it."""
    mine = Mine(request)
    item = get_object_or_404(ForumPost, pk=post_id)
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
