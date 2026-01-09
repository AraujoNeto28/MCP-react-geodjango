from django.urls import path
from . import views

urlpatterns = [
    path('arcgis/find/', views.arcgis_find_address, name='arcgis_find_address'),
    path('nominatim/search/', views.nominatim_search, name='nominatim_search'),
    path('nominatim/reverse/', views.nominatim_reverse, name='nominatim_reverse'),
]
