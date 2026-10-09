from django.urls import path

from . import reminder_views, views

urlpatterns = [
    path('auth/discord/login/', views.discord_login),
    path('auth/discord/callback/', views.discord_callback),
    path('auth/me/', views.me),
    path('auth/logout/', views.sign_out),
    path('me/reminders/', reminder_views.reminders),
    path('me/reminders/<int:event_id>/', reminder_views.event_reminder),
]
