import TileLayer from "ol/layer/Tile"
import VectorImageLayer from "ol/layer/VectorImage"
import LayerGroup from "ol/layer/Group"
import OSM from "ol/source/OSM"
import TileWMS from "ol/source/TileWMS"
import VectorSource from "ol/source/Vector"
import GeoJSON from "ol/format/GeoJSON"
import { bbox as bboxStrategy } from "ol/loadingstrategy"
import { transformExtent } from "ol/proj"

import type { RootGroupDto, LayerDto } from "../features/layers/types"
import { createFeatureStyle } from "./olStyles"
import { readGeoJsonFeaturesRobust } from "./geojsonUtils"
import { ensureProjectionsRegistered } from "./projections"

export type GeoServerLayerAvailability = Record<
  string,
  {
    WFS?: Record<string, true>
    WMS?: Record<string, true>
  }
>

export type LayerVisibilityState = {
  rootVisibleById: Record<string, boolean>
  groupVisibleById: Record<string, boolean>
  layerVisibleById: Record<string, boolean>
  labelVisibleById: Record<string, boolean>
}

function getCqlFilter(layer: LayerDto): string | undefined {
  // backend seed uses array filters like ['==','item','-CE RNP']
  // For now we only support this shape.
  if (!Array.isArray(layer.filter)) return undefined
  const [op, field, value] = layer.filter
  if (op === "==" && typeof field === "string") {
    if (typeof value === "string") return `${field}='${value.replaceAll("'", "''")}'`
    if (typeof value === "number") return `${field}=${value}`
  }
  return undefined
}

function createWmsLayer(geoserverBaseUrl: string, layer: LayerDto) {
  const url = geoserverBaseUrl.replace(/\/$/, "") + "/wms"
  return new TileLayer({
    visible: layer.visible,
    minZoom: layer.minZoom ?? undefined,
    zIndex: layer.order,
    source: new TileWMS({
      url,
      params: {
        LAYERS: `${layer.workspace}:${layer.layerName}`,
        TILED: true,
      },
      crossOrigin: "anonymous",
    }),
    properties: {
      id: layer.id,
      kind: "layer",
      serviceType: "WMS",
      workspace: layer.workspace,
      layerName: layer.layerName,
      desiredVisible: layer.visible,
      popupTemplate: layer.popupTemplate,
      title: layer.title,
    },
  })
}

function createWfsLayer(geoserverBaseUrl: string, layer: LayerDto) {
  ensureProjectionsRegistered()

  const urlBase = geoserverBaseUrl.replace(/\/$/, "") + "/wfs"
  const typeNames = `${layer.workspace}:${layer.layerName}`
  const initialCql = getCqlFilter(layer)

  const requestCrs = (layer.nativeCrs || "").trim() || "EPSG:3857"

  const geojson = new GeoJSON()

  // Custom loader to:
  // - abort in-flight requests during fast pan/zoom
  // - retry once without CQL if CQL causes errors
  // - stop hammering GeoServer if the layer consistently errors (bad typeName, server error, etc.)
  const source = new VectorSource({
    strategy: bboxStrategy,
    loader: (() => {
      let inflight: AbortController | null = null
      let debounceTimer: number | undefined = undefined
      let cqlDisabled = false
      let permanentlyDisabled = false
      let cooldownUntilMs = 0
      let lastLoggedErrorKey: string | null = null

      class WfsHttpError extends Error {
        status: number
        url: string
        body: string
        constructor(status: number, url: string, body: string) {
          super(`WFS ${status}`)
          this.status = status
          this.url = url
          this.body = body
        }
      }

      const buildUrl = (extent: number[], cql?: string) => {
        let bboxExtent = extent
        let bboxCrs = requestCrs

        if (requestCrs !== "EPSG:3857") {
          try {
            bboxExtent = transformExtent(extent, "EPSG:3857", requestCrs)
          } catch {
            // If transform fails (unknown CRS), fall back to map CRS.
            bboxExtent = extent
            bboxCrs = "EPSG:3857"
          }
        }

        const params = new URLSearchParams({
          service: "WFS",
          version: "2.0.0",
          request: "GetFeature",
          typeNames,
          outputFormat: "application/json",
          srsName: bboxCrs,
          bbox: `${bboxExtent.join(",")},${bboxCrs}`,
        })
        if (cql) params.set("cql_filter", cql)
        return `${urlBase}?${params.toString()}`
      }

      const parseFeatures = (text: string) => {
        const { features, dataProjection } = readGeoJsonFeaturesRobust(geojson, text, "EPSG:3857", requestCrs)
        
        // Attach metadata to features to ensure popup works even if layer reference is lost
        for (const f of features) {
          f.set("_popupTemplate", layer.popupTemplate)
          f.set("_layerTitle", layer.title)
          f.set("_serviceType", "WFS")
          f.set("_dataProjection", dataProjection)
          // Geometry returned by readFeatures is already reprojected to featureProjection.
          f.set("_geometryProjection", "EPSG:3857")
        }
        
        return features
      }

      return (extent, _resolution, _projection, success, failure) => {
        if (permanentlyDisabled) {
          success?.([])
          return
        }

        const now = Date.now()
        if (cooldownUntilMs && now < cooldownUntilMs) {
          success?.([])
          return
        }

        // Abort previous request when user is still moving.
        if (inflight) inflight.abort()
        if (debounceTimer) clearTimeout(debounceTimer)

        debounceTimer = window.setTimeout(async () => {
          inflight = new AbortController()

          const effectiveCql = !cqlDisabled ? initialCql : undefined
          const urlWithCql = buildUrl(extent, effectiveCql)
          const urlWithoutCql = buildUrl(extent, undefined)

          const fetchAndAdd = async (url: string) => {
            const resp = await fetch(url, { signal: inflight?.signal })
            const bodyText = await resp.text()
            if (!resp.ok) {
              const errorKey = `${typeNames}|${resp.status}`
              if (lastLoggedErrorKey !== errorKey) {
                lastLoggedErrorKey = errorKey
                console.warn("[WFS] GeoServer request failed", {
                  typeNames,
                  status: resp.status,
                  url,
                  body: bodyText.slice(0, 2000),
                })
              }
              throw new WfsHttpError(resp.status, url, bodyText)
            }

            const features = parseFeatures(bodyText)
            // Keep only the latest viewport data. Without this, features accumulate as the user pans/zooms,
            // making interaction increasingly laggy.
            source.clear(true)
            source.addFeatures(features as any)
            success?.(features as any)
            return true
          }

          try {
            await fetchAndAdd(urlWithCql)
          } catch (err) {
            // Aborts are expected during fast pan/zoom; never treat as fatal.
            if ((err as any)?.name === "AbortError") {
              return
            }

            const httpErr = err instanceof WfsHttpError ? err : undefined
            const status = httpErr?.status

            // If CQL is present, try once without it; some layers/fields break filtering.
            // Do NOT retry if the server is throwing 500s (internal error) - it's likely overloaded.
            if (effectiveCql && (!status || status < 500)) {
              try {
                await fetchAndAdd(urlWithoutCql)
                cqlDisabled = true
                return
              } catch (err2) {
                if ((err2 as any)?.name === "AbortError") {
                  return
                }
                // fallthrough
              }
            }

            const body = httpErr?.body ?? ""
            const isUnknownTypeName =
              status === 400 &&
              /InvalidParameterValue/i.test(body) &&
              /locator=\"typeName\"/i.test(body) &&
              /unknown/i.test(body)

            if (isUnknownTypeName) {
              permanentlyDisabled = true
            } else if (status && status >= 500) {
              // Back off significantly on server errors
              cooldownUntilMs = Date.now() + 30_000
            } else {
              // Avoid hammering GeoServer on other errors.
              cooldownUntilMs = Date.now() + 15_000
            }

            failure?.()
            success?.([])
          }
        }, 500)
      }
    })(),
  })

  return new VectorImageLayer({
    visible: layer.visible,
    minZoom: layer.minZoom ?? undefined,
    zIndex: layer.order,
    source,
    style: createFeatureStyle(layer.styleConfig),
    properties: {
      id: layer.id,
      kind: "layer",
      serviceType: "WFS",
      workspace: layer.workspace,
      layerName: layer.layerName,
      desiredVisible: layer.visible,
      popupTemplate: layer.popupTemplate,
      title: layer.title,
      styleConfig: layer.styleConfig, // Save style config for dynamic updates
    },
  })
}

export function buildLayersFromTree(
  tree: RootGroupDto[],
  geoserverBaseUrl: string,
  availability?: GeoServerLayerAvailability,
) {
  const rootGroups = tree.slice().sort((a, b) => a.order - b.order)

  const isLayerAvailable = (layer: LayerDto) => {
    const byWorkspace = availability?.[layer.workspace]
    if (!byWorkspace) return true
    const byService = (byWorkspace as any)?.[layer.serviceType] as Record<string, true> | undefined
    if (!byService) return true
    return Boolean(byService[layer.layerName])
  }

  const overlayRootGroups = rootGroups.map((root) => {
    const rootVisible = root.visible

    const directLayers = root.layers
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((layer) => {
        const merged = { ...layer, visible: rootVisible && layer.visible }

        if (!geoserverBaseUrl) {
          return null
        }

        if (!isLayerAvailable(merged)) {
          return null
        }

        return root.serviceType === "WMS"
          ? createWmsLayer(geoserverBaseUrl, merged)
          : createWfsLayer(geoserverBaseUrl, merged)
      })
      .filter(Boolean)

    const thematicGroups = root.thematicGroups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => {
        const groupVisible = group.visible
        const layers = group.layers
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((layer) => {
            const merged = { ...layer, visible: rootVisible && groupVisible && layer.visible }

            if (!geoserverBaseUrl) {
              return null
            }

            if (!isLayerAvailable(merged)) {
              return null
            }

            return root.serviceType === "WMS"
              ? createWmsLayer(geoserverBaseUrl, merged)
              : createWfsLayer(geoserverBaseUrl, merged)
          })
          .filter(Boolean)

        return new LayerGroup({
          layers: layers as any,
          visible: rootVisible && groupVisible,
          properties: { id: group.id, kind: "thematicGroup" },
        })
      })

    return new LayerGroup({
      layers: [...(directLayers as any), ...(thematicGroups as any)],
      visible: rootVisible,
      properties: { id: root.id, kind: "rootGroup" },
    })
  })

  const basemap = new LayerGroup({
    layers: [new TileLayer({ source: new OSM({ crossOrigin: "anonymous" }) })],
    zIndex: -1,
    properties: { id: "basemap", kind: "basemap" },
  })

  return {
    basemap,
    overlays: new LayerGroup({
      layers: overlayRootGroups as any,
      properties: { id: "overlays", kind: "overlays" },
    }),
  }
}
