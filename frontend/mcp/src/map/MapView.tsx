import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"

import Map from "ol/Map"
import View from "ol/View"
import { defaults as defaultControls, ScaleLine } from "ol/control"
import { fromLonLat } from "ol/proj"
import Overlay from "ol/Overlay"

import type { RootGroupDto } from "../features/layers/types"
import { buildLayersFromTree, type GeoServerLayerAvailability, type LayerVisibilityState } from "./olLayerFactory"
import { createFeatureStyle } from "./olStyles"
import { buildPopupModel } from "./popupTemplate"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card"
import { BASEMAPS, type BasemapId } from "../features/map/basemaps"
import { DrawTools } from "../features/map/DrawTools"
import { MeasureTools } from "../features/map/MeasureTools"
import LayerGroup from "ol/layer/Group"

type Props = {
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
  availability?: GeoServerLayerAvailability
  activeBasemap?: BasemapId
  searchLocation?: { x: number; y: number } | null
  onMapReady?: (map: Map | null) => void
}

const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-12 h-12 text-red-600 drop-shadow-xl">
  <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
</svg>
`

function PopupContent({ model }: { model: ReturnType<typeof buildPopupModel> }) {
  if (!model) return null
  return (
    <Card className="w-[320px] max-w-[80vw] shadow-md border-zinc-200">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold leading-tight">{model.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-1">
        {model.rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <div className="w-24 shrink-0 text-xs font-medium text-zinc-500">{row.label}</div>
            <div className="min-w-0 flex-1 break-words text-sm text-zinc-900">{row.value}</div>
          </div>
        ))}
        {model.rows.length === 0 && (
          <div className="text-sm text-zinc-500">Sem campos configurados no popupTemplate.</div>
        )}
      </CardContent>
    </Card>
  )
}

export function MapView(props: Props) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const [mapInstance, setMapInstance] = useState<Map | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(12)
  const [activeTool, setActiveTool] = useState<"draw" | "measure" | null>(null)
  const popupOverlayRef = useRef<Overlay | null>(null)
  const popupElementRef = useRef<HTMLDivElement | null>(null)
  const popupRootRef = useRef<Root | null>(null)

  const searchMarkerOverlayRef = useRef<Overlay | null>(null)
  const searchMarkerElRef = useRef<HTMLDivElement | null>(null)

  const layersBundle = useMemo(
    // Important: don't rebuild OL layers on availability updates, or we drop loaded vector features.
    () => buildLayersFromTree(props.tree, props.geoserverBaseUrl),
    [props.tree, props.geoserverBaseUrl],
  )

  const defaultsById = useMemo(() => {
    const rootDefaults: Record<string, boolean> = {}
    const groupDefaults: Record<string, boolean> = {}
    const layerDefaults: Record<string, boolean> = {}

    for (const root of props.tree) {
      rootDefaults[root.id] = root.visible
      for (const layer of root.layers) layerDefaults[layer.id] = layer.visible
      for (const group of root.thematicGroups) {
        groupDefaults[group.id] = group.visible
        for (const layer of group.layers) layerDefaults[layer.id] = layer.visible
      }
    }

    return { rootDefaults, groupDefaults, layerDefaults }
  }, [props.tree])

  useEffect(() => {
    if (!layersBundle.basemap) return
    if (!props.activeBasemap) return

    const def = BASEMAPS.find((b) => b.id === props.activeBasemap)
    if (def) {
      // basemap is now a LayerGroup
      const group = layersBundle.basemap as LayerGroup
      group.getLayers().clear()
      const newLayers = def.createLayers()
      newLayers.forEach((l) => group.getLayers().push(l))

      if (mapInstance) {
        const view = mapInstance.getView()
        view.setMaxZoom(def.maxZoom ?? 28)
      }
    }
  }, [layersBundle, props.activeBasemap, mapInstance])

  useEffect(() => {
    if (!targetRef.current || mapInstance) return

    const map = new Map({
      target: targetRef.current,
      layers: [layersBundle.basemap, layersBundle.overlays],
      controls: defaultControls({ zoom: false, rotate: false, attribution: true }).extend([
        new ScaleLine({ units: "metric" }),
      ]),
      view: new View({
        center: fromLonLat([-51.2177, -30.0346]),
        zoom: 12,
      }),
    })

    setMapInstance(map)
    props.onMapReady?.(map)

    // Update zoom level state
    const updateZoom = () => {
      const z = map.getView().getZoom()
      if (z !== undefined) setZoomLevel(z)
    }
    map.on("moveend", updateZoom)
    updateZoom()

    const popupEl = document.createElement("div")
    popupEl.className = "pointer-events-auto"
    popupElementRef.current = popupEl

    const overlay = new Overlay({
      element: popupEl,
      positioning: "bottom-center",
      offset: [0, -12],
      stopEvent: true,
      autoPan: { animation: { duration: 150 } },
    })
    popupOverlayRef.current = overlay
    map.addOverlay(overlay)

    // Search Marker Overlay
    const markerEl = document.createElement("div")
    markerEl.className = "pointer-events-none"
    searchMarkerElRef.current = markerEl

    const markerOverlay = new Overlay({
      element: markerEl,
      positioning: "bottom-center",
      offset: [0, -6], // Tip of the pin
      stopEvent: false,
    })
    searchMarkerOverlayRef.current = markerOverlay
    map.addOverlay(markerOverlay)

    return () => {
      if (popupRootRef.current) {
        popupRootRef.current.unmount()
        popupRootRef.current = null
      }
      if (popupOverlayRef.current) map.removeOverlay(popupOverlayRef.current)
      popupOverlayRef.current = null
      popupElementRef.current = null
      map.setTarget(undefined)
      setMapInstance(null)
      props.onMapReady?.(null)
    }
  }, [])

  useEffect(() => {
    const map = mapInstance
    const el = targetRef.current
    if (!map || !el) return

    // Keep OL internal size in sync with CSS/layout changes (e.g. attribute table height transitions).
    // When OL has a stale size, view center logs look correct but the rendered center on screen is offset.
    if (typeof ResizeObserver === "undefined") {
      map.updateSize?.()
      return
    }

    let raf: number | null = null
    const ro = new ResizeObserver(() => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        map.updateSize?.()
      })
    })

    ro.observe(el)
    map.updateSize?.()

    return () => {
      ro.disconnect()
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [mapInstance])

  useEffect(() => {
    if (!searchMarkerOverlayRef.current || !searchMarkerElRef.current) return

    if (props.searchLocation) {
      const coords = fromLonLat([props.searchLocation.x, props.searchLocation.y])
      searchMarkerOverlayRef.current.setPosition(coords)

      // Render pin
      searchMarkerElRef.current.innerHTML = `
        <div class="relative -top-2">
          <div id="search-pin-icon" class="transition-transform duration-300">
            ${PIN_SVG}
          </div>
        </div>
      `

      // Animate
      const pin = searchMarkerElRef.current.querySelector("#search-pin-icon")
      if (pin) {
        pin.classList.add("animate-bounce")
        // Stop bouncing after 10 seconds and hide
        const timer = setTimeout(() => {
          if (searchMarkerOverlayRef.current) searchMarkerOverlayRef.current.setPosition(undefined)
          if (searchMarkerElRef.current) searchMarkerElRef.current.innerHTML = ""
        }, 10000)
        return () => clearTimeout(timer)
      }
    } else {
      searchMarkerOverlayRef.current.setPosition(undefined)
      searchMarkerElRef.current.innerHTML = ""
    }
  }, [props.searchLocation])

  useEffect(() => {
    const map = mapInstance
    const overlay = popupOverlayRef.current
    const popupEl = popupElementRef.current
    if (!map || !overlay || !popupEl) return

    const renderPopup = (popupTemplate: unknown, feature: any) => {
      const model = buildPopupModel(popupTemplate, feature?.getProperties?.() ?? {})
      if (!model) return

      if (!popupRootRef.current) {
        popupRootRef.current = createRoot(popupEl)
      }
      popupRootRef.current.render(<PopupContent model={model} />)
    }

    const onClick = (evt: any) => {
      const hit = map.forEachFeatureAtPixel(
        evt.pixel,
        (feature: any, layer: any) => ({ feature, layer }),
        { hitTolerance: 5 },
      ) as { feature: any; layer: any } | undefined

      if (!hit?.feature) {
        overlay.setPosition(undefined)
        return
      }

      // Try to get metadata from feature first (more robust), then layer
      const serviceType = hit.feature.get("_serviceType") ?? hit.layer?.get?.("serviceType")
      
      if (serviceType !== "WFS") {
        overlay.setPosition(undefined)
        return
      }

      const template = hit.feature.get("_popupTemplate") ?? hit.layer?.get?.("popupTemplate")
      
      renderPopup(template, hit.feature)
      overlay.setPosition(evt.coordinate)
    }

    map.on("singleclick", onClick)
    return () => {
      map.un("singleclick", onClick)
    }
  }, [mapInstance])

  useEffect(() => {
    const map = mapInstance
    if (!map) return

    const layers = map.getLayers()
    const layersArray = layers.getArray()

    // Update Basemap
    const basemapIdx = layersArray.findIndex((l) => (l as any)?.get?.("id") === "basemap")
    if (basemapIdx >= 0) {
      if (layersArray[basemapIdx] !== layersBundle.basemap) {
        layers.setAt(basemapIdx, layersBundle.basemap)
      }
    } else {
      layers.insertAt(0, layersBundle.basemap)
    }

    // Replace overlays group when tree/visibility changes
    const idx = layersArray.findIndex((l) => (l as any)?.get?.("id") === "overlays")
    if (idx >= 0) {
      layers.setAt(idx, layersBundle.overlays)
    } else {
      map.addLayer(layersBundle.overlays)
    }

    return
  }, [layersBundle, mapInstance])

  useEffect(() => {
    const map = mapInstance
    if (!map) return

    const overlays = map
      .getLayers()
      .getArray()
      .find((l) => (l as any)?.get?.("id") === "overlays") as any

    if (!overlays || typeof overlays.getLayers !== "function") return

    const { rootDefaults, groupDefaults, layerDefaults } = defaultsById

    const rootVisible = (rootId: string) => props.visibility.rootVisibleById[rootId] ?? rootDefaults[rootId] ?? true
    const groupVisible = (groupId: string) =>
      props.visibility.groupVisibleById[groupId] ?? groupDefaults[groupId] ?? true
    const layerDesiredVisible = (layerId: string) =>
      props.visibility.layerVisibleById[layerId] ?? layerDefaults[layerId] ?? true
    const labelVisible = (layerId: string) => props.visibility.labelVisibleById[layerId] ?? true

    const isLayerAvailable = (olLayer: any) => {
      if (!props.availability) return true
      const workspace = olLayer?.get?.("workspace")
      const layerName = olLayer?.get?.("layerName")
      const serviceType = olLayer?.get?.("serviceType")
      if (!workspace || !layerName || !serviceType) return true

      const byWorkspace = props.availability[workspace]
      if (!byWorkspace) return true
      const byService = (byWorkspace as any)?.[serviceType] as Record<string, true> | undefined
      if (!byService) return true
      return Boolean(byService[layerName])
    }

    const applyToLayerCollection = (layers: any, currentRootVisible: boolean, currentGroupVisible: boolean) => {
      for (const olLayer of layers.getArray()) {
        const kind = olLayer?.get?.("kind")
        const id = olLayer?.get?.("id")

        if (kind === "rootGroup") {
          const rv = rootVisible(id)
          olLayer.setVisible(rv)
          applyToLayerCollection(olLayer.getLayers(), rv, true)
          continue
        }

        if (kind === "thematicGroup") {
          const gv = groupVisible(id)
          olLayer.setVisible(currentRootVisible && gv)
          applyToLayerCollection(olLayer.getLayers(), currentRootVisible, gv)
          continue
        }

        if (kind === "layer") {
          const dv = layerDesiredVisible(id)
          const av = isLayerAvailable(olLayer)
          olLayer.setVisible(currentRootVisible && currentGroupVisible && dv && av)

          // Update label visibility for WFS layers
          const serviceType = olLayer.get("serviceType")
          if (serviceType === "WFS") {
            const styleConfig = olLayer.get("styleConfig")
            if (styleConfig) {
              const showLabels = labelVisible(id)
              // We need to check if the style function needs updating.
              // Since createFeatureStyle returns a new function every time, we can just set it.
              // However, setting style triggers a redraw, so we should be careful.
              // But this effect runs when visibility changes, so it's fine.
              // To avoid unnecessary updates, we could store the current label state on the layer.
              const currentLabelState = olLayer.get("_labelVisible")
              if (currentLabelState !== showLabels) {
                olLayer.setStyle(createFeatureStyle(styleConfig, showLabels))
                olLayer.set("_labelVisible", showLabels)
              }
            }
          }
        }
      }
    }

    applyToLayerCollection(overlays.getLayers(), true, true)
  }, [props.visibility, defaultsById, layersBundle, props.availability])

  return (
    <div className="relative h-full w-full">
      <div ref={targetRef} className="h-full w-full" />
      <div className="absolute bottom-8 left-2 z-10 rounded bg-white/80 px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm pointer-events-none">
        Zoom: {zoomLevel.toFixed(1)}
      </div>
      <div className="absolute top-4 left-4 z-20 flex flex-row gap-2 items-start">
        <DrawTools 
          map={mapInstance} 
          isOpen={activeTool === "draw"} 
          onToggle={() => setActiveTool(prev => prev === "draw" ? null : "draw")} 
        />
        <MeasureTools 
          map={mapInstance} 
          isOpen={activeTool === "measure"} 
          onToggle={() => setActiveTool(prev => prev === "measure" ? null : "measure")} 
        />
      </div>
    </div>
  )
}
