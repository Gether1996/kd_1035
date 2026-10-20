from django.urls import path

from . import views

urlpatterns = [
    path('guides/', views.GuideList.as_view()),
    path('status/', views.SiteStatus.as_view()),
    # not under guides/: guides/<slug:slug>/ would take it
    path('commanders/', views.CommanderIndex.as_view()),
    path('commanders/marches/', views.MarchCommanders.as_view()),
    path('armory/', views.Armory.as_view()),
    path('guides/<slug:slug>/', views.GuideDetail.as_view()),
    # nginx rewrites guide pages here for link-preview bots: /api/link-preview/[cz/]navody/<category>/<slug>
    path('link-preview/<path:path>', views.link_preview),
    # nginx proxies guide pages here for everyone else (SSI around the app shell): /api/guide-page/[cz/]navody/…
    path('guide-page/<path:path>', views.guide_page),
]
