from django.urls import path

from . import alarm_views, kvk_views, march_views, reminder_views, views

urlpatterns = [
    path('auth/discord/login/', views.discord_login),
    path('auth/discord/callback/', views.discord_callback),
    path('auth/me/', views.me),
    path('auth/logout/', views.sign_out),
    path('me/reminders/', reminder_views.reminders),
    path('me/reminders/test/', reminder_views.test_dm),
    path('me/reminders/<int:event_id>/', reminder_views.event_reminder),
    path('me/alarms/', alarm_views.alarms),
    path('me/alarms/<int:alarm_id>/', alarm_views.alarm),
    path('kvk/', kvk_views.state),
    path('kvk/signup/', kvk_views.signup),
    path('kvk/signup/images/', kvk_views.upload),
    path('kvk/signup/images/<int:image_id>/', kvk_views.delete_image),
    path('kvk/images/<int:image_id>/', kvk_views.image),
    path('kvk/settings/', kvk_views.settings),
    path('kvk/signups/', kvk_views.all_signups),
    path('kvk/signups/<int:signup_id>/', kvk_views.delete_signup),
    path('kvk/reviewers/', kvk_views.reviewers),
    path('kvk/reviewers/<int:player_id>/', kvk_views.reviewer),
    path('me/marches/', march_views.marches),
    path('me/marches/<int:march_id>/', march_views.march),
    path('me/marches/<int:march_id>/images/', march_views.upload),
    path('me/marches/images/<int:image_id>/', march_views.delete_image),
    path('marches/images/<int:image_id>/', march_views.image),
    path('marches/', march_views.players_marches),
]
