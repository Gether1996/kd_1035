from django.urls import path

from . import views

urlpatterns = [
    path('guides/', views.GuideList.as_view()),
    path('guides/<slug:slug>/', views.GuideDetail.as_view()),
]
