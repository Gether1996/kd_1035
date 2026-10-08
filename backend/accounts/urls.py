from django.urls import path

from . import views

urlpatterns = [
    path('auth/discord/login/', views.discord_login),
    path('auth/discord/callback/', views.discord_callback),
    path('auth/me/', views.me),
    path('auth/logout/', views.sign_out),
]
