from django.contrib import admin
from django.urls import include, path
from .views import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/', include('layers_geoserver.urls')),
]
