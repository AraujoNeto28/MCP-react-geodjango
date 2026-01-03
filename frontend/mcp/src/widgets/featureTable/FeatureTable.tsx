import { useEffect, useMemo, useState } from "react"

import type Map from "ol/Map"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import { getCenter } from "ol/extent"
import { toLonLat } from "ol/proj"
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style"
import GeoJSON from "ol/format/GeoJSON"

import type { LayerDto } from "../../features/layers/types"
import { readGeoJsonFeaturesRobust } from "../../map/geojsonUtils"

type Props = {
  map: Map | null
  layer: LayerDto | null
  geoserverBaseUrl?: string
  open: boolean
  minimized: boolean
  features?: any[]
  headerTitle?: string
  headerContext?: string
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
}

function tableIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  )
}

function minusIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

function expandIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 3H3v5" />
      <path d="M3 3l6 6" />
      <path d="M16 21h5v-5" />
      <path d="M21 21l-6-6" />
    </svg>
  )
}

function closeIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  )
}

function zoomIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 18a8 8 0 1 1 5.3-14" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M10 10h6" />
      <path d="M13 7v6" />
    </svg>
  )
}


function formatValue(v: any): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function FeatureTable(props: Props) {
  const [features, setFeatures] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedByKey, setSelectedByKey] = useState<Record<string, boolean>>({})
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const layerTitle = props.layer?.title ?? ""

  useEffect(() => {
    if (!props.open) return
    setSelectedByKey({})
    setHoveredKey(null)
  }, [props.open, props.layer?.id])

  useEffect(() => {
    if (!props.open) return

    // Mode 1: Search results passed in
    if (Array.isArray(props.features)) {
      setFeatures(props.features)
      setLoading(false)
      return
    }

    // Mode 2: Fetch all features for layer (WFS)
    if (props.layer && props.geoserverBaseUrl) {
      setLoading(true)
      const controller = new AbortController()

      const load = async () => {
        try {
          const urlBase = props.geoserverBaseUrl!.replace(/\/$/, "") + "/wfs"
          const typeNames = `${props.layer!.workspace}:${props.layer!.layerName}`
          const requestCrs = (props.layer!.nativeCrs || "").trim() || "EPSG:3857"

          const params = new URLSearchParams({
            service: "WFS",
            version: "2.0.0",
            request: "GetFeature",
            typeNames,
            outputFormat: "application/json",
            srsName: requestCrs,
          })

          // Apply seed filter if present
          if (Array.isArray(props.layer!.filter)) {
            const [op, field, value] = props.layer!.filter
            if (op === "==" && typeof field === "string") {
              const val = typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : String(value)
              params.set("cql_filter", `${field}=${val}`)
            }
          }

          const resp = await fetch(`${urlBase}?${params.toString()}`, { signal: controller.signal })
          if (!resp.ok) throw new Error(`WFS ${resp.status}`)
          const text = await resp.text()

          const geojson = new GeoJSON()
          // Use robust reader to handle CRS and reproject to map view (EPSG:3857)
          const { features: parsed } = readGeoJsonFeaturesRobust(geojson, text, "EPSG:3857", requestCrs)

          // Attach metadata needed for zoom/popup
          for (const f of parsed) {
            f.set("_popupTemplate", props.layer!.popupTemplate)
            f.set("_layerTitle", props.layer!.title)
            f.set("_serviceType", "WFS")
            f.set("_dataProjection", requestCrs)
            f.set("_geometryProjection", "EPSG:3857")
          }

          if (!controller.signal.aborted) {
            setFeatures(parsed)
            setLoading(false)
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error("Failed to load table features", err)
            setFeatures([])
            setLoading(false)
          }
        }
      }

      load()
      return () => controller.abort()
    }

    // Fallback
    setFeatures([])
    setLoading(false)
  }, [props.open, props.layer, props.geoserverBaseUrl, props.features])

  const columns = useMemo(() => {
    const set = new Set<string>()
    for (const f of features) {
      const propsObj = f?.getProperties?.() ?? null
      if (!propsObj || typeof propsObj !== "object") continue
      for (const k of Object.keys(propsObj)) {
        if (k === "geometry") continue
        if (k.startsWith("_")) continue
        set.add(k)
      }
    }
    return Array.from(set)
  }, [features])

  if (!props.open) return null

  const recordCount = features.length

  const getFeatureKey = (feature: any, fallbackIndex: number) => {
    const id = feature?.getId?.()
    if (id != null) return String(id)

    const propsObj = feature?.getProperties?.() ?? {}
    const candidates = [
      "objectid",
      "OBJECTID",
      "fid",
      "FID",
      "id",
      "ID",
      "uuid",
      "UUID",
    ]
    for (const k of candidates) {
      const v = (propsObj as any)?.[k]
      if (v != null && v !== "") return `${k}:${String(v)}`
    }

    // Worst-case fallback: stable only within current feature ordering.
    return `idx:${fallbackIndex}`
  }

  const selectionLayer = useMemo(() => {
    if (!props.map) return null

    const map: any = props.map
    const rootLayers = map.getLayers?.().getArray?.() ?? []

    const existing = rootLayers.find((l: any) => l?.get?.("kind") === "featureTableSelection")
    if (existing) return existing as VectorLayer<any>

    const layer = new VectorLayer({
      source: new VectorSource({ wrapX: false }),
      zIndex: 10_000,
      properties: { kind: "featureTableSelection" },
    })

    map.addLayer(layer)
    return layer
  }, [props.map])

  const hoverLayer = useMemo(() => {
    if (!props.map) return null

    const map: any = props.map
    const rootLayers = map.getLayers?.().getArray?.() ?? []

    const existing = rootLayers.find((l: any) => l?.get?.("kind") === "featureTableHover")
    if (existing) return existing as VectorLayer<any>

    const layer = new VectorLayer({
      source: new VectorSource({ wrapX: false }),
      // Slightly below the checkbox selection layer.
      zIndex: 9_999,
      properties: { kind: "featureTableHover" },
    })

    map.addLayer(layer)
    return layer
  }, [props.map])

  const selectionStyle = useMemo(() => {
    const pointStyle = new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "rgba(255, 255, 0, 0.35)" }),
        stroke: new Stroke({ color: "rgba(255, 215, 0, 1)", width: 3 }),
      }),
    })

    const lineStyle = new Style({
      stroke: new Stroke({ color: "rgba(255, 215, 0, 1)", width: 4 }),
    })

    const polyStyle = new Style({
      stroke: new Stroke({ color: "rgba(255, 215, 0, 1)", width: 3 }),
      fill: new Fill({ color: "rgba(255, 255, 0, 0.18)" }),
    })

    return { pointStyle, lineStyle, polyStyle }
  }, [])

  const hoverStyle = useMemo(() => {
    // light blue
    const pointStyle = new Style({
      image: new CircleStyle({
        // Larger than checkbox selection so it shows as a halo behind yellow.
        radius: 12,
        fill: new Fill({ color: "rgba(59, 130, 246, 0.18)" }),
        stroke: new Stroke({ color: "rgba(59, 130, 246, 1)", width: 4 }),
      }),
    })

    const lineStyle = new Style({
      // Thicker than yellow so it remains visible underneath.
      stroke: new Stroke({ color: "rgba(59, 130, 246, 1)", width: 8 }),
    })

    const polyStyle = new Style({
      stroke: new Stroke({ color: "rgba(59, 130, 246, 1)", width: 6 }),
      fill: new Fill({ color: "rgba(59, 130, 246, 0.12)" }),
    })

    return { pointStyle, lineStyle, polyStyle }
  }, [])

  useEffect(() => {
    if (!props.open) return
    if (!selectionLayer) return

    const source = selectionLayer.getSource?.() as VectorSource<any> | undefined
    if (!source) return

    const selected: any[] = []
    for (let idx = 0; idx < features.length; idx++) {
      const f = features[idx]
      const key = getFeatureKey(f, idx)
      if (!selectedByKey[key]) continue
      selected.push(f)
    }

    // Clone features into the overlay source. A feature can't live in two sources.
    const clones = selected
      .map((f) => {
        try {
          const c = f?.clone?.()
          return c ?? null
        } catch {
          return null
        }
      })
      .filter(Boolean)

    source.clear(true)
    if (clones.length) source.addFeatures(clones as any)

    // Set a style function that depends on geometry type.
    selectionLayer.setStyle((feature: any) => {
      const t = feature?.getGeometry?.()?.getType?.()
      if (t === "Point" || t === "MultiPoint") return selectionStyle.pointStyle
      if (t === "LineString" || t === "MultiLineString") return selectionStyle.lineStyle
      return selectionStyle.polyStyle
    })
  }, [props.open, selectionLayer, features, selectedByKey, selectionStyle])

  useEffect(() => {
    if (!props.open) return
    if (!hoverLayer) return

    const source = hoverLayer.getSource?.() as VectorSource<any> | undefined
    if (!source) return

    const featureToHover = hoveredKey
      ? features.find((f, idx) => getFeatureKey(f, idx) === hoveredKey)
      : null

    source.clear(true)
    if (featureToHover) {
      try {
        const c = featureToHover.clone?.()
        if (c) source.addFeature(c as any)
      } catch {
        // ignore
      }
    }

    hoverLayer.setStyle((feature: any) => {
      const t = feature?.getGeometry?.()?.getType?.()
      if (t === "Point" || t === "MultiPoint") return hoverStyle.pointStyle
      if (t === "LineString" || t === "MultiLineString") return hoverStyle.lineStyle
      return hoverStyle.polyStyle
    })
  }, [props.open, hoverLayer, features, hoveredKey, hoverStyle])

  useEffect(() => {
    if (!selectionLayer) return
    if (!props.open) {
      const source = selectionLayer.getSource?.() as VectorSource<any> | undefined
      source?.clear?.(true)
      return
    }
    return () => {
      const source = selectionLayer.getSource?.() as VectorSource<any> | undefined
      source?.clear?.(true)
    }
  }, [props.open, props.layer?.id, selectionLayer])

  useEffect(() => {
    if (!hoverLayer) return
    if (!props.open) {
      const source = hoverLayer.getSource?.() as VectorSource<any> | undefined
      source?.clear?.(true)
      return
    }
    return () => {
      const source = hoverLayer.getSource?.() as VectorSource<any> | undefined
      source?.clear?.(true)
    }
  }, [props.open, props.layer?.id, hoverLayer])

  const onZoom = (feature: any) => {
    const map = props.map
    if (!map) return
    const geom = feature?.getGeometry?.()
    if (!geom) return

    const view = map.getView?.()
    if (!view) return

    const viewProj = view.getProjection?.()?.getCode?.() ?? "EPSG:3857"

    const debug = (globalThis as any)?.__DEBUG_ZOOM === true

    try {
      // Ensure OL has the latest container size before fitting/animating.
      map.updateSize?.()

      // IMPORTANT: geometries returned by OL format.readFeatures() are already in featureProjection.
      // Do not transform again based on dataProjection, or we introduce an offset.
      const geomProj = feature?.get?.("_geometryProjection")
      const zGeom = (() => {
        try {
          const g = geom.clone?.() ?? geom
          if (geomProj && typeof geomProj === "string" && geomProj !== viewProj && typeof g.transform === "function") {
            g.transform(geomProj, viewProj)
          }
          return g
        } catch {
          return geom
        }
      })()

      if (debug) {
        const dataProj = feature?.get?.("_dataProjection")
        const extent = zGeom?.getExtent?.()
        const center = extent ? getCenter(extent) : null
        console.debug("[zoom]", {
          viewProj,
          geomProj,
          dataProj,
          type: zGeom?.getType?.(),
          extent,
          center,
          centerLonLat: center ? toLonLat(center, viewProj) : null,
          viewCenterBefore: view.getCenter?.() ?? null,
        })
      }

      const type = zGeom?.getType?.()

      // OL's fit() on points can be inconsistent (tiny extents). For points we explicitly center + zoom.
      if (type === "Point" || type === "MultiPoint") {
        const extent = zGeom.getExtent?.()
        if (!extent) return
        const center = getCenter(extent)
        const targetZoom = 20
        const zoom = Math.min(targetZoom, view.getMaxZoom?.() ?? targetZoom)
        view.animate(
          { center, zoom, duration: 400 },
          () => {
            if (!debug) return
            console.debug("[zoom.after]", {
              viewCenterAfter: view.getCenter?.() ?? null,
              viewZoomAfter: view.getZoom?.() ?? null,
              requestedCenter: center,
              requestedCenterLonLat: toLonLat(center, viewProj),
            })
          },
        )
        return
      }

      view.fit(zGeom, {
        maxZoom: 20,
        duration: 400,
        padding: [50, 50, 50, 50],
        size: map.getSize?.(),
      })

      if (debug) {
        window.setTimeout(() => {
          console.debug("[zoom.after]", {
            viewCenterAfter: view.getCenter?.() ?? null,
            viewZoomAfter: view.getZoom?.() ?? null,
          })
        }, 450)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-full w-full flex-col border-t border-zinc-200 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-sm font-semibold text-zinc-900">{props.headerTitle ?? "Tabela de atributos"}</div>
          <div className="truncate text-xs text-zinc-500">
            {layerTitle ? `(${layerTitle})` : ""}
            {props.headerContext ? ` ${props.headerContext}` : ""} ({recordCount} registros)
            {loading && " Carregando..."}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!props.minimized ? (
            <button
              type="button"
              className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              title="Minimizar"
              onClick={props.onMinimize}
            >
              {minusIcon("h-4 w-4")}
            </button>
          ) : (
            <button
              type="button"
              className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              title="Maximizar"
              onClick={props.onMaximize}
            >
              {expandIcon("h-4 w-4")}
            </button>
          )}

          <button
            type="button"
            className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            title="Fechar"
            onClick={props.onClose}
          >
            {closeIcon("h-4 w-4")}
          </button>
        </div>
      </div>

      {!props.minimized && (
        <div className="min-h-0 flex-1 w-full overflow-auto">
          {props.layer?.serviceType !== "WFS" && (
            <div className="p-4 text-sm text-zinc-600">A tabela de atributos está disponível apenas para camadas WFS.</div>
          )}

          {props.layer?.serviceType === "WFS" && (
            <>
              {loading && features.length === 0 && (
                <div className="p-4 text-sm text-zinc-600">Carregando feições...</div>
              )}
              {!loading && features.length === 0 && (
                <div className="p-4 text-sm text-zinc-600">Nenhuma feição encontrada.</div>
              )}
              {features.length > 0 && (
                <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-50">
                <tr>
                  <th className="w-10 border-b border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-600" />
                  <th className="w-12 border-b border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-600">#</th>
                  <th className="w-12 border-b border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-600">Zoom</th>
                  {columns.map((c) => (
                    <th key={c} className="border-b border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-600">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((f, idx) => {
                  const rowProps = f?.getProperties?.() ?? {}
                  const fKey = getFeatureKey(f, idx)
                  const checked = !!selectedByKey[fKey]
                  const isHovered = hoveredKey === fKey

                  return (
                    <tr
                      key={idx}
                      className={
                        isHovered
                          ? "bg-blue-50"
                          : idx % 2 === 0
                            ? "bg-white"
                            : "bg-zinc-50/40"
                      }
                      onMouseEnter={() => setHoveredKey(fKey)}
                      onMouseLeave={() => setHoveredKey((k) => (k === fKey ? null : k))}
                    >
                      <td className="border-b border-zinc-100 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedByKey((s) => ({
                              ...s,
                              [fKey]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="border-b border-zinc-100 px-2 py-2 text-zinc-600">{idx + 1}</td>
                      <td className="border-b border-zinc-100 px-2 py-2">
                        <button
                          type="button"
                          className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-white hover:text-zinc-900"
                          title="Zoom"
                          onClick={() => onZoom(f)}
                        >
                          {zoomIcon("h-4 w-4")}
                        </button>
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="max-w-xs truncate border-b border-zinc-100 px-2 py-2 text-zinc-900 hover:whitespace-normal hover:break-all hover:bg-white hover:shadow-lg hover:z-10 relative">
                          {formatValue((rowProps as any)[c])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
            </>
          )}
        </div>
      )}

      {/* small hint icon for minimized mode */}
      {props.minimized && (
        <div className="hidden">{tableIcon("h-4 w-4")}</div>
      )}
    </div>
  )
}
