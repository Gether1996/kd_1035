from django.urls import path, re_path

from . import channel_api, manage_api, preview, views

urlpatterns = [
    path('health/', views.health),
    path('alliances/', views.AllianceList.as_view()),
    path('links/', views.SocialLinkList.as_view()),
    path('events/', views.EventCalendar.as_view()),
    path('events/<int:pk>/ics', views.event_ics),
    path('calendar.ics', views.calendar_feed),
    path('events/channel/', channel_api.channel),
    path('events/channel/<int:pk>/', channel_api.channel_event),
    path('events/manage/', manage_api.event_list),
    path('events/manage/<int:pk>/', manage_api.event_detail),
    path('events/manage/<int:pk>/date/', manage_api.irregular_date),
    path('events/manage/<int:pk>/run/', manage_api.run_variant),
    # nginx rewrites /[cz/]kalendar?event=<id> here for link-preview bots; kingdom.urls is included before
    # guides.urls, so this wins over guides' catch-all link-preview/<path>
    re_path(r'^link-preview/(?P<cz>cz/)?kalendar/?$', preview.event_preview),
]
