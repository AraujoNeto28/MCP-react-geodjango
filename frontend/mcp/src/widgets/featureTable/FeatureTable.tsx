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
import { Button } from "../../components/ui/Button"
import { Checkbox } from "../../components/ui/Checkbox"

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
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 9H21M3 15H21M9 9L9 20M15 9L15 20M6.2 20H17.8C18.9201 20 19.4802 20 19.908 19.782C20.2843 19.5903 20.5903 19.2843 20.782 18.908C21 18.4802 21 17.9201 21 16.8V7.2C21 6.0799 21 5.51984 20.782 5.09202C20.5903 4.71569 20.2843 4.40973 19.908 4.21799C19.4802 4 18.9201 4 17.8 4H6.2C5.0799 4 4.51984 4 4.09202 4.21799C3.71569 4.40973 3.40973 4.71569 3.21799 5.09202C3 5.51984 3 6.07989 3 7.2V16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.71569 19.5903 4.09202 19.782C4.51984 20 5.07989 20 6.2 20Z" />
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

  const [page, setPage] = useState(1)
  const pageSize = 50

  const layerTitle = props.layer?.title ?? ""

  useEffect(() => {
    if (!props.open) return
    setSelectedByKey({})
    setHoveredKey(null)
    setPage(1)
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

  const hasInlineFeatures = Array.isArray(props.features)
  const isWfsLayer = props.layer?.serviceType === "WFS"

  if (!props.open) return null

  const recordCount = features.length
  const totalPages = Math.ceil(recordCount / pageSize)
  const visibleFeatures = features.slice((page - 1) * pageSize, page * pageSize)

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
      <div className="flex min-h-12 shrink-0 items-start justify-between border-b border-zinc-200 px-4 py-2 sm:h-12 sm:items-center sm:py-0">
        <div className="min-w-0 flex flex-col gap-0 sm:flex-row sm:items-center sm:gap-2">
          <div className="text-xs font-semibold text-zinc-900 sm:text-sm">{props.headerTitle ?? "Tabela de atributos"}</div>
          <div className="text-[11px] text-zinc-500 leading-tight break-words whitespace-normal sm:truncate sm:whitespace-nowrap sm:text-xs">
            {layerTitle ? `(${layerTitle})` : ""}
            {props.headerContext ? ` ${props.headerContext}` : ""} ({recordCount} registros)
            {loading && " Carregando..."}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!props.minimized ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-600"
              title="Minimizar"
              onClick={props.onMinimize}
            >
              {minusIcon("h-4 w-4")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-600"
              title="Maximizar"
              onClick={props.onMaximize}
            >
              {expandIcon("h-4 w-4")}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-600 hover:text-red-600 hover:bg-red-50"
            title="Fechar"
            onClick={props.onClose}
          >
            {closeIcon("h-4 w-4")}
          </Button>
        </div>
      </div>

      {!props.minimized && (
        <>
        <div className="min-h-0 flex-1 w-full overflow-auto">
          {!isWfsLayer && !hasInlineFeatures && (
            <div className="p-4 text-sm text-zinc-600">A tabela de atributos está disponível apenas para camadas WFS.</div>
          )}

          {(isWfsLayer || hasInlineFeatures) && (
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
                {visibleFeatures.map((f, idx) => {
                  const globalIdx = (page - 1) * pageSize + idx
                  const rowProps = f?.getProperties?.() ?? {}
                  const fKey = getFeatureKey(f, globalIdx)
                  const checked = !!selectedByKey[fKey]
                  const isHovered = hoveredKey === fKey

                  return (
                    <tr
                      key={globalIdx}
                      className={
                        isHovered
                          ? "bg-blue-50"
                          : globalIdx % 2 === 0
                            ? "bg-white"
                            : "bg-zinc-50/40"
                      }
                      onMouseEnter={() => setHoveredKey(fKey)}
                      onMouseLeave={() => setHoveredKey((k) => (k === fKey ? null : k))}
                    >
                      <td className="border-b border-zinc-100 px-2 py-2">
                        <Checkbox
                          checked={checked}
                          onChange={(e) =>
                            setSelectedByKey((s) => ({
                              ...s,
                              [fKey]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="border-b border-zinc-100 px-2 py-2 text-zinc-600">{globalIdx + 1}</td>
                      <td className="border-b border-zinc-100 px-2 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-zinc-600"
                          title="Zoom"
                          onClick={() => onZoom(f)}
                        >
                          {zoomIcon("h-4 w-4")}
                        </Button>
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="border-b border-zinc-100 px-2 py-2 text-zinc-900">
                          <div className="max-w-xs truncate" title={formatValue((rowProps as any)[c])}>
                            {formatValue((rowProps as any)[c])}
                          </div>
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
        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 shrink-0">
            <div className="text-xs text-zinc-500">
                Página {page} de {totalPages || 1}
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                </Button>
            </div>
        </div>
        </>
      )}

      {/* small hint icon for minimized mode */}
      {props.minimized && (
        <div className="hidden">{tableIcon("h-4 w-4")}</div>
      )}
    </div>
  )
}
