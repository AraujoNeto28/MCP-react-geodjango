import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"

import Map from "ol/Map"
import View from "ol/View"
import { defaults as defaultControls } from "ol/control"
import { fromLonLat } from "ol/proj"
import Overlay from "ol/Overlay"

import type { RootGroupDto } from "../features/layers/types"
import { buildLayersFromTree, type GeoServerLayerAvailability, type LayerVisibilityState } from "./olLayerFactory"
import { buildPopupModel } from "./popupTemplate"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card"

type Props = {
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
  availability?: GeoServerLayerAvailability
  onMapReady?: (map: Map | null) => void
}

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
  const popupOverlayRef = useRef<Overlay | null>(null)
  const popupElementRef = useRef<HTMLDivElement | null>(null)
  const popupRootRef = useRef<Root | null>(null)

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
    if (!targetRef.current || mapInstance) return

    const map = new Map({
      target: targetRef.current,
      layers: [layersBundle.basemap, layersBundle.overlays],
      controls: defaultControls({ zoom: true, rotate: false, attribution: true }),
      view: new View({
        center: fromLonLat([-51.2177, -30.0346]),
        zoom: 12,
      }),
    })

    setMapInstance(map)
    props.onMapReady?.(map)

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

    // Replace overlays group when tree/visibility changes
    const layers = map.getLayers().getArray()
    const idx = layers.findIndex((l) => (l as any)?.get?.("id") === "overlays")
    if (idx >= 0) {
      map.getLayers().setAt(idx, layersBundle.overlays)
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
        }
      }
    }

    applyToLayerCollection(overlays.getLayers(), true, true)
  }, [props.visibility, defaultsById, layersBundle, props.availability])

  return <div ref={targetRef} className="h-full w-full" />
}
