from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from guides.views import sitemap

admin.site.site_header = 'KD 1035 – správa'
admin.site.site_title = 'KD 1035'
admin.site.index_title = 'Obsah webu'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('kingdom.urls')),
    path('api/', include('guides.urls')),
    path('api/', include('accounts.urls')),
    path('sitemap.xml', sitemap),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
