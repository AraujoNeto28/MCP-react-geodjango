import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MantineProvider } from "@mantine/core"

import Map from "ol/Map"
import View from "ol/View"
import { defaults as defaultControls, Attribution, ScaleLine } from "ol/control"
import { fromLonLat, toLonLat, transform } from "ol/proj"
import Overlay from "ol/Overlay"
import Draw, { createBox } from "ol/interaction/Draw"
import Modify from "ol/interaction/Modify"
import { never } from "ol/events/condition"
import VectorSource from "ol/source/Vector"
import VectorLayer from "ol/layer/Vector"
import { fromExtent as polygonFromExtent } from "ol/geom/Polygon"
import { Fill, Stroke, Style, Circle as CircleStyle } from "ol/style"

import type { RootGroupDto } from "../features/layers/types"
import { buildLayersFromTree, type GeoServerLayerAvailability, type LayerVisibilityState } from "./olLayerFactory"
import { createFeatureStyle } from "./olStyles"
import { buildPopupModel } from "../widgets/popup/popupTemplate"
import { Popup } from "../widgets/popup/Popup"
import { BASEMAPS, type BasemapId } from "../features/map/basemaps"
import { DrawTools } from "../widgets/drawTools/DrawTools"
import { MeasureTools } from "../widgets/measureTools/MeasureTools"
import LayerGroup from "ol/layer/Group"
import { ensureProjectionsRegistered } from "./projections"
import { MapContextMenu } from "./MapContextMenu"
import { LocationPopup } from "../widgets/popup/LocationPopup"
import { reverseGeocodeNominatim } from "../features/search/addressApi"

type Props = {
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
  availability?: GeoServerLayerAvailability
  activeBasemap?: BasemapId
  searchLocation?: { x: number; y: number } | null
  onMapReady?: (map: Map | null) => void
  printMode?: boolean
  onPrintSelectionExtentChange?: (extent: [number, number, number, number] | null) => void
  onPrintSelectionPointsChange?: (points: { start: [number, number]; end: [number, number] } | null) => void
}

const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-12 h-12 text-red-600 drop-shadow-xl">
  <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
</svg>
`

export function MapView(props: Props) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const [mapInstance, setMapInstance] = useState<Map | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(12)
  const [activeTool, setActiveTool] = useState<"draw" | "measure" | null>(null)
  const popupOverlayRef = useRef<Overlay | null>(null)
  const popupElementRef = useRef<HTMLDivElement | null>(null)
  const popupRootRef = useRef<Root | null>(null)

  const popupSelectionLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)
  const popupSelectionSourceRef = useRef<VectorSource<any> | null>(null)

  const popupHitsRef = useRef<Array<{ feature: any; layer: any }> | null>(null)
  const popupHitIndexRef = useRef<number>(0)
  const popupCoordinateRef = useRef<any>(null)

  const printLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)
  const printSourceRef = useRef<VectorSource<any> | null>(null)
  const printDrawRef = useRef<Draw | null>(null)
  const printModifyRef = useRef<Modify | null>(null)

  const searchMarkerOverlayRef = useRef<Overlay | null>(null)
  const searchMarkerElRef = useRef<HTMLDivElement | null>(null)

  const contextMenuOverlayRef = useRef<Overlay | null>(null)
  const contextMenuElRef = useRef<HTMLDivElement | null>(null)
  const contextMenuRootRef = useRef<Root | null>(null)
  const contextMenuCoordinateRef = useRef<[number, number] | null>(null)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)

  const locationOverlayRef = useRef<Overlay | null>(null)
  const locationElRef = useRef<HTMLDivElement | null>(null)
  const locationRootRef = useRef<Root | null>(null)

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
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }).extend([
        // Avoid the collapsible attribution toggle button ("i") on small screens.
        new Attribution({ collapsible: false }),
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

    // Context Menu Overlay
    const contextMenuEl = document.createElement("div")
    contextMenuEl.className = "pointer-events-auto"
    contextMenuElRef.current = contextMenuEl

    const contextMenuOverlay = new Overlay({
      element: contextMenuEl,
      positioning: "top-left",
      offset: [8, 8],
      stopEvent: true,
      autoPan: false,
    })
    contextMenuOverlayRef.current = contextMenuOverlay
    map.addOverlay(contextMenuOverlay)

    // Location Popup Overlay
    const locationEl = document.createElement("div")
    locationEl.className = "pointer-events-auto"
    locationElRef.current = locationEl

    const locationOverlay = new Overlay({
      element: locationEl,
      positioning: "bottom-center",
      offset: [0, -12],
      stopEvent: true,
      autoPan: { animation: { duration: 150 } },
    })
    locationOverlayRef.current = locationOverlay
    map.addOverlay(locationOverlay)

    // Popup selection highlight layer (so users know which feature the open popup belongs to)
    const popupSelSource = new VectorSource()
    // High-contrast highlight (white halo + blue stroke) so it shows above vivid basemaps.
    const popupSelHalo = new Stroke({ color: "rgba(255, 255, 255, 0.95)", width: 8 })
    const popupSelStroke = new Stroke({ color: "rgba(0, 132, 255, 1)", width: 4 })
    const popupSelFill = new Fill({ color: "rgba(0, 132, 255, 0.20)" })

    const popupSelPointStyle = [
      new Style({ image: new CircleStyle({ radius: 11, fill: popupSelFill, stroke: popupSelHalo }), zIndex: 10_000 }),
      new Style({ image: new CircleStyle({ radius: 11, fill: popupSelFill, stroke: popupSelStroke }), zIndex: 10_001 }),
    ]

    const popupSelGeomStyle = [
      new Style({ stroke: popupSelHalo, zIndex: 10_000 }),
      new Style({ stroke: popupSelStroke, fill: popupSelFill, zIndex: 10_001 }),
    ]

    const popupSelLayer = new VectorLayer({
      source: popupSelSource,
      style: (feature: any) => {
        const geom = feature?.getGeometry?.()
        const type = geom?.getType?.() as string | undefined
        if (type === "Point" || type === "MultiPoint") return popupSelPointStyle
        return popupSelGeomStyle
      },
    })
    popupSelLayer.set("id", "popupSelection")
    popupSelectionLayerRef.current = popupSelLayer
    popupSelectionSourceRef.current = popupSelSource
    map.addLayer(popupSelLayer)

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

      if (contextMenuRootRef.current) {
        contextMenuRootRef.current.unmount()
        contextMenuRootRef.current = null
      }
      if (contextMenuOverlayRef.current) map.removeOverlay(contextMenuOverlayRef.current)
      contextMenuOverlayRef.current = null
      contextMenuElRef.current = null
      contextMenuCoordinateRef.current = null

      if (locationRootRef.current) {
        locationRootRef.current.unmount()
        locationRootRef.current = null
      }
      if (locationOverlayRef.current) map.removeOverlay(locationOverlayRef.current)
      locationOverlayRef.current = null
      locationElRef.current = null

      if (popupSelectionLayerRef.current) map.removeLayer(popupSelectionLayerRef.current)
      popupSelectionLayerRef.current = null
      popupSelectionSourceRef.current = null

      map.setTarget(undefined)
      setMapInstance(null)
      props.onMapReady?.(null)
    }
  }, [])

  useEffect(() => {
    const map = mapInstance
    if (!map) return

    const viewport = map.getViewport()
    const closeContextMenu = () => {
      setIsContextMenuOpen(false)
      contextMenuCoordinateRef.current = null
      contextMenuOverlayRef.current?.setPosition(undefined)
      if (contextMenuRootRef.current) {
        try {
          contextMenuRootRef.current.unmount()
        } catch {
          // ignore
        }
        contextMenuRootRef.current = null
      }
    }

    const closeLocationPopup = () => {
      locationOverlayRef.current?.setPosition(undefined)
      if (locationRootRef.current) {
        try {
          locationRootRef.current.unmount()
        } catch {
          // ignore
        }
        locationRootRef.current = null
      }
    }

    const onIdentifyLocation = async () => {
      const mapCoord = contextMenuCoordinateRef.current
      closeContextMenu()
      if (!mapCoord) return

      // Convert clicked map coordinate (WebMercator) to WGS84 lon/lat
      const [lon, lat] = toLonLat(mapCoord)

      // Reverse geocode (best-effort)
      let streetValue: string | undefined
      let neighborhood: string | undefined
      let postcode: string | undefined

      try {
        const result = await reverseGeocodeNominatim(lat, lon)
        const addr = result?.address ?? {}

        const road = addr.road || addr.pedestrian || addr.footway || addr.path || addr.highway
        const houseNumber = addr.house_number
        const composedStreet = [road, houseNumber].filter(Boolean).join(", ")
        streetValue = composedStreet || result?.display_name || undefined

        neighborhood =
          addr.suburb ||
          addr.neighbourhood ||
          addr.city_district ||
          addr.district ||
          addr.quarter ||
          undefined

        postcode = addr.postcode || undefined
      } catch {
        // If reverse geocode fails, still show coordinates.
      }

      // TM-POA (EPSG:10665)
      ensureProjectionsRegistered()
      const [e, n] = transform([lon, lat], "EPSG:4326", "EPSG:10665") as [number, number]

      locationOverlayRef.current?.setPosition(mapCoord)
      if (locationElRef.current) {
        if (!locationRootRef.current) {
          locationRootRef.current = createRoot(locationElRef.current)
        }

        const googleMapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}`
        locationRootRef.current.render(
          <MantineProvider>
            <LocationPopup
              onClose={closeLocationPopup}
              streetValue={streetValue}
              neighborhood={neighborhood}
              postcode={postcode}
              wgs84={{ lat, lon }}
              tmpoa={{ e, n }}
              googleMapsUrl={googleMapsUrl}
            />
          </MantineProvider>,
        )
      }
    }

    const onContextMenu = (evt: MouseEvent) => {
      // Prevent browser context menu
      evt.preventDefault()
      evt.stopPropagation()

      const pixel = map.getEventPixel(evt)
      const coordinate = map.getCoordinateFromPixel(pixel)
      if (!Array.isArray(coordinate) || coordinate.length < 2) return

      const mapCoord: [number, number] = [Number(coordinate[0]), Number(coordinate[1])]
      contextMenuCoordinateRef.current = mapCoord
      contextMenuOverlayRef.current?.setPosition(mapCoord)
      setIsContextMenuOpen(true)

      if (!contextMenuElRef.current) return
      if (!contextMenuRootRef.current) {
        contextMenuRootRef.current = createRoot(contextMenuElRef.current)
      }

      contextMenuRootRef.current.render(
        <MapContextMenu
          onIdentifyLocation={onIdentifyLocation}
          onClose={closeContextMenu}
        />,
      )
    }

    const onPointerDown = (evt: PointerEvent) => {
      if (!isContextMenuOpen) return
      const target = evt.target as Node | null
      if (target && contextMenuElRef.current && contextMenuElRef.current.contains(target)) return
      closeContextMenu()
    }

    viewport.addEventListener("contextmenu", onContextMenu)
    viewport.addEventListener("pointerdown", onPointerDown)

    return () => {
      viewport.removeEventListener("contextmenu", onContextMenu)
      viewport.removeEventListener("pointerdown", onPointerDown)
    }
  }, [mapInstance, isContextMenuOpen])

  useEffect(() => {
    const map = mapInstance
    const el = targetRef.current
    if (!map || !el) return

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
    const popupSelSource = popupSelectionSourceRef.current
    if (!map || !overlay || !popupEl) return

    const closePopup = () => {
      overlay.setPosition(undefined)
      popupSelSource?.clear(true)
      popupHitsRef.current = null
      popupHitIndexRef.current = 0
      popupCoordinateRef.current = null
    }

    const setPopupSelection = (feature: any) => {
      if (!popupSelSource) return
      popupSelSource.clear(true)
      try {
        const clone = feature?.clone?.() ?? null
        if (clone) popupSelSource.addFeature(clone)
      } catch {
        // ignore
      }
    }

    const renderHitAtIndex = (index: number) => {
      const hits = popupHitsRef.current
      if (!hits || hits.length === 0) {
        closePopup()
        return
      }

      const safeIndex = Math.max(0, Math.min(index, hits.length - 1))
      popupHitIndexRef.current = safeIndex

      const hit = hits[safeIndex]
      const template = hit.feature.get("_popupTemplate") ?? hit.layer?.get?.("popupTemplate")
      const model = buildPopupModel(template, hit.feature?.getProperties?.() ?? {})
      if (!model) {
        closePopup()
        return
      }

      if (!popupRootRef.current) {
        popupRootRef.current = createRoot(popupEl)
      }

      const canPrev = safeIndex > 0
      const canNext = safeIndex < hits.length - 1
      const onPrev = () => {
        if (!canPrev) return
        renderHitAtIndex(safeIndex - 1)
      }
      const onNext = () => {
        if (!canNext) return
        renderHitAtIndex(safeIndex + 1)
      }

      popupRootRef.current.render(
		<MantineProvider>
			<Popup
				model={model}
				onClose={closePopup}
				onPrev={onPrev}
				onNext={onNext}
				canPrev={canPrev}
				canNext={canNext}
				positionLabel={`${safeIndex + 1} / ${hits.length}`}
			/>
		</MantineProvider>,
      )

      // Keep popup at the original click coordinate while navigating
      if (popupCoordinateRef.current) overlay.setPosition(popupCoordinateRef.current)

      setPopupSelection(hit.feature)
    }

    const onClick = (evt: any) => {
      const rawHits: Array<{ feature: any; layer: any }> = []
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature: any, layer: any) => {
          rawHits.push({ feature, layer })
          return undefined
        },
        // Drill: capture features at/near the clicked pixel
        { hitTolerance: 10 },
      )

      const unique = new Set<string>()
      const hits = rawHits
        .filter((h) => h?.feature)
        .filter((h) => h.layer?.get?.("id") !== "popupSelection")
        .filter((h) => {
          const serviceType = h.feature.get("_serviceType") ?? h.layer?.get?.("serviceType")
          return serviceType === "WFS"
        })
        .filter((h) => {
          const id = String(h.feature?.getId?.() ?? h.feature?.ol_uid ?? "")
          const key = id || String((h.feature as any)?.uid ?? "")
          if (!key) return true
          if (unique.has(key)) return false
          unique.add(key)
          return true
        })

      if (hits.length === 0) {
        closePopup()
        return
      }

      popupHitsRef.current = hits
      popupHitIndexRef.current = 0
      popupCoordinateRef.current = evt.coordinate
      overlay.setPosition(evt.coordinate)
      renderHitAtIndex(0)
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

    // Cleanup when leaving print mode
    if (!props.printMode) {
      if (printDrawRef.current) map.removeInteraction(printDrawRef.current)
      if (printModifyRef.current) map.removeInteraction(printModifyRef.current)
      printDrawRef.current = null
      printModifyRef.current = null

      if (printLayerRef.current) {
        map.removeLayer(printLayerRef.current)
      }
      printLayerRef.current = null
      printSourceRef.current = null
      props.onPrintSelectionExtentChange?.(null)
      props.onPrintSelectionPointsChange?.(null)
      try {
        map.getViewport().style.cursor = ""
      } catch {
        // ignore
      }
      return
    }

    // Setup print selection layer + interactions
    const source = new VectorSource()
    const layer = new VectorLayer({
      source,
      properties: { id: "printSelection" },
      style: new Style({
        stroke: new Stroke({ color: "#2563eb", width: 2, lineDash: [6, 4] }),
        fill: new Fill({ color: "rgba(37, 99, 235, 0.08)" }),
      }),
    })

    layer.setZIndex(10_000)
    map.addLayer(layer)

    // Keep the selection ALWAYS rectangular while editing.
    // OL's Modify interaction lets you drag a corner inward, deforming the polygon.
    // We snap the geometry back to a box from its extent on every change.
    let isSnapping = false
    const snapFeatureToExtent = (feature: any) => {
      if (isSnapping) return
      const geom = feature?.getGeometry?.()
      const ext = geom?.getExtent?.() as [number, number, number, number] | undefined
      if (!ext) return

      isSnapping = true
      try {
        // Important: do NOT replace the geometry object while Modify is active.
        // Replacing it detaches internal Modify listeners and can allow deformation.
        const minX = ext[0]
        const minY = ext[1]
        const maxX = ext[2]
        const maxY = ext[3]

        const ring = [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ]

        if (geom && typeof (geom as any).setCoordinates === "function" && (geom as any).getType?.() === "Polygon") {
          ;(geom as any).setCoordinates([ring])
        } else {
          feature.setGeometry(polygonFromExtent(ext))
        }
        props.onPrintSelectionExtentChange?.(ext)
        props.onPrintSelectionPointsChange?.({ start: [ext[0], ext[1]], end: [ext[2], ext[3]] })
      } finally {
        isSnapping = false
      }
    }

    const detachGeomListener = (feature: any) => {
      const geom = feature?.get?.("_printSelGeom")
      const handler = feature?.get?.("_printSelGeomChange")
      if (geom && handler && typeof geom.un === "function") {
        try {
          geom.un("change", handler)
        } catch {
          // ignore
        }
      }
      try {
        feature?.unset?.("_printSelGeom")
        feature?.unset?.("_printSelGeomChange")
      } catch {
        // ignore
      }
    }

    const attachGeomListener = (feature: any) => {
      detachGeomListener(feature)
      const geom = feature?.getGeometry?.()
      if (!geom || typeof geom.on !== "function") return

      const handler = () => snapFeatureToExtent(feature)
      geom.on("change", handler)
      feature.set("_printSelGeom", geom)
      feature.set("_printSelGeomChange", handler)

      // Ensure a clean rectangular geometry immediately.
      snapFeatureToExtent(feature)
    }

    const onAddFeature = (evt: any) => {
      if (evt?.feature) attachGeomListener(evt.feature)
    }
    const onRemoveFeature = (evt: any) => {
      if (evt?.feature) detachGeomListener(evt.feature)
    }

    source.on("addfeature", onAddFeature)
    source.on("removefeature", onRemoveFeature)

    // No initial rectangle: user draws the selection (or prints full screen).
    props.onPrintSelectionExtentChange?.(null)
    props.onPrintSelectionPointsChange?.(null)

    const draw = new Draw({
      source,
      type: "Circle",
      geometryFunction: createBox(),
    })

    let dragStart: [number, number] | null = null

    draw.on("drawstart", (evt: any) => {
      source.clear()
      const c = evt?.coordinate
      if (Array.isArray(c) && c.length >= 2) {
        dragStart = [Number(c[0]), Number(c[1])]
      } else {
        dragStart = null
      }
    })

    draw.on("drawend", (evt: any) => {
      const geom = evt.feature?.getGeometry?.()
      const ext = geom?.getExtent?.() as [number, number, number, number] | undefined
      if (ext) props.onPrintSelectionExtentChange?.(ext)

      const endCoord = evt?.coordinate
      if (dragStart && Array.isArray(endCoord) && endCoord.length >= 2) {
        props.onPrintSelectionPointsChange?.({
          start: dragStart,
          end: [Number(endCoord[0]), Number(endCoord[1])],
        })
      } else if (ext) {
        // Fallback: use extent corners if event coordinates are not available
        props.onPrintSelectionPointsChange?.({ start: [ext[0], ext[1]], end: [ext[2], ext[3]] })
      }
    })

    const modify = new Modify({ source, insertVertexCondition: never })
    modify.on("modifyend", () => {
      const features = source.getFeatures()
      const f0 = features[0]
      if (f0) snapFeatureToExtent(f0)
    })

    map.addInteraction(draw)
    map.addInteraction(modify)

    printLayerRef.current = layer
    printSourceRef.current = source
    printDrawRef.current = draw
    printModifyRef.current = modify

    try {
      map.getViewport().style.cursor = "crosshair"
    } catch {
      // ignore
    }

    return () => {
      map.removeInteraction(draw)
      map.removeInteraction(modify)
      map.removeLayer(layer)

      try {
        for (const f of source.getFeatures()) detachGeomListener(f)
      } catch {
        // ignore
      }

      try {
        source.un("addfeature", onAddFeature)
        source.un("removefeature", onRemoveFeature)
      } catch {
        // ignore
      }

      printDrawRef.current = null
      printModifyRef.current = null
      printLayerRef.current = null
      printSourceRef.current = null
      try {
        map.getViewport().style.cursor = ""
      } catch {
        // ignore
      }
    }
  }, [mapInstance, props.printMode])

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
