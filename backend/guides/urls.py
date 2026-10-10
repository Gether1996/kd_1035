from django.urls import path

from . import views

urlpatterns = [
    path('guides/', views.GuideList.as_view()),
    path('status/', views.SiteStatus.as_view()),
    # not under guides/: guides/<slug:slug>/ would take it
    path('commanders/', views.CommanderIndex.as_view()),
    path('guides/<slug:slug>/', views.GuideDetail.as_view()),
    # nginx rewrites guide pages here for link-preview bots: /api/link-preview/[cz/]navody/<category>/<slug>
    path('link-preview/<path:path>', views.link_preview),
]
