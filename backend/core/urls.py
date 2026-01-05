from django.contrib import admin
from django.urls import include, path
from .views import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/search/', include('address_search.urls')),
    path('api/', include('layers_geoserver.urls')),
]
