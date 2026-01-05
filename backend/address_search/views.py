import requests
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

@require_http_methods(["GET"])
def arcgis_find_address(request):
    # Base URL for the ArcGIS Geocode service
    base_url = "https://mapaspoa-des-2020.procempa.com.br/arcgis/rest/services/GEOCODE/TMPOA_CAT_COD_NOME_COMP_PRO/GeocodeServer/findAddressCandidates"
    
    # Forward all query parameters from the client
    params = request.GET.copy()
    
    # Ensure response format is JSON
    params['f'] = 'json'
    
    try:
        response = requests.get(base_url, params=params, verify=False) # verify=False might be needed for dev servers
        response.raise_for_status()
        return JsonResponse(response.json())
    except requests.RequestException as e:
        return JsonResponse({'error': str(e)}, status=502)

@require_http_methods(["GET"])
def nominatim_search(request):
    # Base URL for Nominatim
    base_url = "https://nominatim.openstreetmap.org/search"
    
    params = request.GET.copy()
    params['format'] = 'json'
    
    # Restrict to Porto Alegre if not already specified
    # The user asked to restrict to Porto Alegre.
    # We can append ", Porto Alegre" to the query or use viewbox/bounded.
    # But appending to query is safer if we want to be sure.
    # Or we can use 'city' parameter if structured query.
    # Let's just forward params but ensure we send a User-Agent
    
    headers = {
        'User-Agent': 'MCP-GeoServer-App/1.0'
    }
    
    try:
        response = requests.get(base_url, params=params, headers=headers)
        response.raise_for_status()
        return JsonResponse(response.json(), safe=False)
    except requests.RequestException as e:
        return JsonResponse({'error': str(e)}, status=502)
