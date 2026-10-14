from django.urls import path

from . import alarm_views, evaluation_views, kvk_views, march_views, reminder_views, views

urlpatterns = [
    path('auth/discord/login/', views.discord_login),
    path('auth/discord/callback/', views.discord_callback),
    path('auth/me/', views.me),
    path('auth/logout/', views.sign_out),
    path('auth/terms/', views.accept_terms),
    path('me/reminders/', reminder_views.reminders),
    path('me/reminders/test/', reminder_views.test_dm),
    path('me/reminders/<int:event_id>/', reminder_views.event_reminder),
    path('me/alarms/', alarm_views.alarms),
    path('me/alarms/<int:alarm_id>/', alarm_views.alarm),
    path('kvk/', kvk_views.state),
    path('kvk/signup/', kvk_views.signup),
    path('kvk/settings/', kvk_views.settings),
    path('kvk/signups/', kvk_views.all_signups),
    path('kvk/signups/<int:signup_id>/', kvk_views.delete_signup),
    path('kvk/reviewers/', kvk_views.reviewers),
    path('kvk/reviewers/<int:player_id>/', kvk_views.reviewer),
    path('kvk/reviewers/auto-approve/', kvk_views.auto_approve),
    path('me/marches/', march_views.marches),
    path('me/marches/order/', march_views.march_order),
    path('me/marches/<int:march_id>/', march_views.march),
    path('marches/', march_views.players_marches),
    path('marches/notices/', march_views.march_notices),
    path('evaluation/', evaluation_views.evaluation),
    path('evaluation/settings/', evaluation_views.evaluation_settings),
    path('evaluation/overview/', evaluation_views.evaluation_overview),
    path('evaluation/players/', evaluation_views.evaluation_players),
    path('evaluation/players/<int:player_id>/', evaluation_views.evaluation_player),
]
