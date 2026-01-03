import { httpGetJson } from "../../lib/http"
import type { ServiceType } from "../layers/types"

export type GeoServerLayer = {
  name: string
  qualifiedName: string
}

export type GeoServerWorkspaceLayersResponse = {
  workspace: string
  serviceType: string
  layers: GeoServerLayer[]
}

export type GeoServerLayerAttribute = {
  name: string
  type: string
}

export type GeoServerLayerAttributesResponse = {
  workspace: string
  layerName: string
  attributes: GeoServerLayerAttribute[]
}

export type GeoServerLayerSuggestResponse = {
  workspace: string
  layerName: string
  field: string
  q: string
  suggestions: string[]
}

export type GeoServerFieldSuggestionsResponse = {
  workspace: string
  layerName: string
  field: string
  q: string
  suggestions: string[]
}

export async function fetchGeoServerWorkspaceLayers(
  apiBaseUrl: string,
  workspace: string,
  serviceType: ServiceType,
  signal?: AbortSignal,
) {
  const base = apiBaseUrl.replace(/\/$/, "")
  const url = `${base}/geoserver/workspaces/${encodeURIComponent(workspace)}/layers/?service_type=${encodeURIComponent(serviceType)}`
  return httpGetJson<GeoServerWorkspaceLayersResponse>(url, { signal })
}

export async function fetchGeoServerLayerAttributes(
  apiBaseUrl: string,
  workspace: string,
  layerName: string,
  signal?: AbortSignal,
) {
  const base = apiBaseUrl.replace(/\/$/, "")
  const url = `${base}/geoserver/workspaces/${encodeURIComponent(workspace)}/layers/${encodeURIComponent(layerName)}/attributes/`
  return httpGetJson<GeoServerLayerAttributesResponse>(url, { signal })
}

export async function fetchGeoServerLayerFieldSuggestions(
  apiBaseUrl: string,
  workspace: string,
  layerName: string,
  field: string,
  q: string,
  limit = 10,
  signal?: AbortSignal,
) {
  const base = apiBaseUrl.replace(/\/$/, "")
  const url = `${base}/geoserver/workspaces/${encodeURIComponent(workspace)}/layers/${encodeURIComponent(layerName)}/suggest/?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`
  return httpGetJson<GeoServerLayerSuggestResponse>(url, { signal })
}

export async function fetchGeoServerFieldSuggestions(
  apiBaseUrl: string,
  workspace: string,
  layerName: string,
  field: string,
  q: string,
  limit = 10,
  signal?: AbortSignal,
) {
  const base = apiBaseUrl.replace(/\/$/, "")
  const url =
    `${base}/geoserver/workspaces/${encodeURIComponent(workspace)}` +
    `/layers/${encodeURIComponent(layerName)}/suggest/` +
    `?field=${encodeURIComponent(field)}&q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`
  return httpGetJson<GeoServerFieldSuggestionsResponse>(url, { signal })
}
