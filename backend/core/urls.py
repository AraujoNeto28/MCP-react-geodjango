from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path

from .views import health_check
from authentication.admin_keycloak import admin_keycloak_callback, admin_keycloak_login

urlpatterns = [
    path('admin/keycloak/login/', admin_keycloak_login, name='admin_keycloak_login'),
    path('admin/keycloak/callback/', admin_keycloak_callback, name='admin_keycloak_callback'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/search/', include('address_search.urls')),
    path('api/', include('layers_geoserver.urls')),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
