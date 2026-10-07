from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
# Outside Docker the repo-level .env is read directly; in Docker it comes via env_file.
if (BASE_DIR.parent / '.env').exists():
    env.read_env(BASE_DIR.parent / '.env')

DEBUG = env.bool('DJANGO_DEBUG', default=False)
SECRET_KEY = env('DJANGO_SECRET_KEY', default='dev-insecure-key') if DEBUG else env('DJANGO_SECRET_KEY')
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])
CSRF_TRUSTED_ORIGINS = env.list('DJANGO_CSRF_TRUSTED_ORIGINS', default=[])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'whitenoise.runserver_nostatic',
    'django.contrib.staticfiles',
    'rest_framework',
    'kingdom',
    'guides',
    'accounts',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# --- Database: a single SQLite file (kept in a Docker volume on the server) ---
SQLITE_PATH = Path(env('SQLITE_PATH', default=str(BASE_DIR / 'data' / 'db.sqlite3')))
SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': SQLITE_PATH,
        'OPTIONS': {
            'transaction_mode': 'IMMEDIATE',
            'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;',
        },
    }
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Database snapshot synced between dev machines through git (.githooks/dbsync.sh). Not part of the
# production image (.dockerignore); the base file says which snapshot this database was last synced with.
SNAPSHOT_PATH = BASE_DIR / 'snapshot' / 'db.sqlite3'
SNAPSHOT_BASE_PATH = SQLITE_PATH.parent / 'snapshot_base'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'sk'
TIME_ZONE = 'Europe/Bratislava'
USE_I18N = True
USE_TZ = True

# --- Static & uploaded files ---
# /media/ is taken by the Angular build output, uploads live under /uploads/.
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/uploads/'
MEDIA_ROOT = Path(env('MEDIA_ROOT', default=str(BASE_DIR / 'media')))
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer']
    + (['rest_framework.renderers.BrowsableAPIRenderer'] if DEBUG else []),
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
    # the site's own session (Discord sign-in) with CSRF checks; no Basic auth
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
}

# Public address of the site, e.g. https://kd1035.sk (used in Discord messages)
SITE_URL = env('SITE_URL', default='').rstrip('/')

# --- Discord event notifications (sent by the worker container) ---
DISCORD_WEBHOOK_URL = env('DISCORD_WEBHOOK_URL', default='')
DISCORD_EVENT_ROLE_ID = env('DISCORD_EVENT_ROLE_ID', default='')

# --- Sign in with Discord (accounts app); both empty = login is switched off ---
DISCORD_CLIENT_ID = env('DISCORD_CLIENT_ID', default='')
DISCORD_CLIENT_SECRET = env('DISCORD_CLIENT_SECRET', default='')

# --- Database backups (worker container, folder is bind-mounted to the host) ---
BACKUP_DIR = Path(env('BACKUP_DIR', default=str(BASE_DIR / 'backups')))
BACKUP_INTERVAL_DAYS = env.int('BACKUP_INTERVAL_DAYS', default=7)
BACKUP_KEEP = env.int('BACKUP_KEEP', default=8)

# --- Security (TLS is terminated by the reverse proxy in front of Docker) ---
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = env.bool('DJANGO_SECURE_COOKIES', default=not DEBUG)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
# the redirect back from discord.com must carry the session cookie – never tighten to 'Strict'
SESSION_COOKIE_SAMESITE = 'Lax'
X_FRAME_OPTIONS = 'DENY'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
