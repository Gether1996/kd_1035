from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health),
    path('alliances/', views.AllianceList.as_view()),
    path('links/', views.SocialLinkList.as_view()),
    path('events/', views.EventCalendar.as_view()),
]
