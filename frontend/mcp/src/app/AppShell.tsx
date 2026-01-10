import { AppShellContainer } from "../AppShellContainer"

export function AppShell() {
  return <AppShellContainer />
}

/*
Legacy (unused) implementation kept for reference.
It depended on removed/moved modules and the removed `order` field.
*/
/*
import { useEffect, useMemo, useRef, useState } from "react"
import { fromLonLat, transformExtent } from "ol/proj"

import { env } from "../config/env"
import { fetchGeoServerWorkspaceLayers } from "../features/geoserver/api"
import { LayerTree } from "../features/layers/LayerTree"
import { useLayersTree } from "../features/layers/useLayersTree"
import type { LayerDto, RootGroupDto, ServiceType, ThematicGroupDto } from "../features/layers/types"
import { LegendsPanel } from "../features/layers/LegendsPanel"
import { SearchPanel } from "../features/search/SearchPanel"
import { SearchAddressPanel } from "../features/search/SearchAddressPanel"
import { CoordinateLocatorPanel } from "../features/search/CoordinateLocatorPanel"
import { BasemapsPanel } from "../features/map/BasemapsPanel"
import type { BasemapId } from "../features/map/basemaps"
import { MapView } from "../map/MapView"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "../map/olLayerFactory"
import { FeatureTable } from "../widgets/featureTable/FeatureTable"
import { Button } from "../components/ui/Button"
import { cn } from "../lib/utils"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/Alert"
import { Checkbox } from "../components/ui/Checkbox"
import { Label } from "../components/ui/Label"
import { printMapSelection } from "../map/print"
import { Input } from "../components/ui/Input"
import { Select } from "../components/ui/Select"

import { UploadLayerPanel } from "../features/upload/UploadLayerPanel"
import type { UploadLayerResponse } from "../features/upload/types"

import { ActionIcon, AppShell as MantineAppShell, Box, Burger, Group, ScrollArea, Text } from "@mantine/core"

import GeoJSON from "ol/format/GeoJSON"
import LayerGroup from "ol/layer/Group"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import { readGeoJsonFeaturesRobust } from "../map/geojsonUtils"

import type OlMap from "ol/Map"

const UPLOADS_ROOT_ID = "userUploads"
const UPLOAD_LAYER_PREFIX = "userUpload:"

function olGeomToDtoType(t: string | undefined | null): "Point" | "LineString" | "Polygon" {
  if (!t) return "Point"
  if (t === "Point" || t === "MultiPoint") return "Point"
  if (t === "LineString" || t === "MultiLineString") return "LineString"
  return "Polygon"
}

function buildInitialVisibility(tree: RootGroupDto[]): LayerVisibilityState {
  const rootVisibleById: Record<string, boolean> = {}
  const groupVisibleById: Record<string, boolean> = {}
  const layerVisibleById: Record<string, boolean> = {}
  const labelVisibleById: Record<string, boolean> = {}

  for (const root of tree) {
    rootVisibleById[root.id] = root.visible
    for (const l of root.layers) {
      layerVisibleById[l.id] = l.visible
      labelVisibleById[l.id] = true
    }
    for (const g of root.thematicGroups) {
      groupVisibleById[g.id] = g.visible
      for (const l of g.layers) {
        layerVisibleById[l.id] = l.visible
        labelVisibleById[l.id] = true
      }
    }
  }

  return { rootVisibleById, groupVisibleById, layerVisibleById, labelVisibleById }
}

export function AppShell() {
  const { data, loading, error } = useLayersTree(env.apiBaseUrl)

  const [visibility, setVisibility] = useState<LayerVisibilityState>(() => ({
    rootVisibleById: {},
    groupVisibleById: {},
    layerVisibleById: {},
    labelVisibleById: {},
  }))

  const tree = useMemo(() => data ?? [], [data])

  const [uploadedLayers, setUploadedLayers] = useState<LayerDto[]>([])
  const uploadedOlLayersByIdRef = useRef<Record<string, VectorLayer<any>>>({})

  const uploadsRoot: RootGroupDto = useMemo(
    () => ({
      id: UPLOADS_ROOT_ID,
      title: "Camadas carregadas",
      serviceType: "LOCAL",
      workspace: "__uploads__",
      visible: true,
      order: 10_000,
      layers: uploadedLayers.slice(),
      thematicGroups: [],
    }),
    [uploadedLayers],
  )

  const layerTreeView = useMemo(() => {
    // Sidebar-only tree: includes GeoServer roots + synthetic uploads root.
    return [...tree, uploadsRoot]
  }, [tree, uploadsRoot])

  const [availability, setAvailability] = useState<GeoServerLayerAvailability>({})
  const [searchLocation, setSearchLocation] = useState<{ x: number; y: number } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Initialize visibility when tree loads
  useEffect(() => {
    if (!data) return
    setVisibility((prev) => {
      const base = buildInitialVisibility(data)
      const uploadLayerVis: Record<string, boolean> = {}
      const uploadLabelVis: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(prev.layerVisibleById)) {
        if (!k.startsWith(UPLOAD_LAYER_PREFIX)) continue
        uploadLayerVis[k] = v
        uploadLabelVis[k] = prev.labelVisibleById[k] ?? true
      }

      return {
        rootVisibleById: {
          ...base.rootVisibleById,
          [UPLOADS_ROOT_ID]: prev.rootVisibleById[UPLOADS_ROOT_ID] ?? true,
        },
        groupVisibleById: { ...base.groupVisibleById },
        layerVisibleById: { ...base.layerVisibleById, ...uploadLayerVis },
        labelVisibleById: { ...base.labelVisibleById, ...uploadLabelVis },
      }
    })
  }, [data])

  useEffect(() => {
    if (!env.geoserverBaseUrl) return
    if (!data) return

    const controller = new AbortController()

    const pairs = new Map<string, { workspace: string; serviceType: ServiceType }>()
    for (const root of data) {
      const key = `${root.workspace}|${root.serviceType}`
      pairs.set(key, { workspace: root.workspace, serviceType: root.serviceType })
    }

    ;(async () => {
      try {
        const next: GeoServerLayerAvailability = {}

        for (const { workspace, serviceType } of pairs.values()) {
          const resp = await fetchGeoServerWorkspaceLayers(env.apiBaseUrl, workspace, serviceType, controller.signal)
          const layerMap: Record<string, true> = {}
          for (const layer of resp.layers ?? []) layerMap[layer.name] = true
          next[workspace] = { ...(next[workspace] ?? {}), [serviceType]: layerMap } as any
        }

        if (!controller.signal.aborted) setAvailability(next)
      } catch (e) {
        // Fail-open: if validation endpoint fails, we still try to render.
        if (!controller.signal.aborted) setAvailability({})
      }
    })()

    return () => controller.abort()
  }, [data, env.apiBaseUrl, env.geoserverBaseUrl])

  const onToggleRoot = (rootId: string, visible: boolean) => {
    const root = layerTreeView.find((r) => r.id === rootId)
    if (!root) return

    setVisibility((s) => {
      const nextLayers = { ...s.layerVisibleById }
      const nextGroups = { ...s.groupVisibleById }

      for (const l of root.layers) {
        nextLayers[l.id] = visible
      }

      for (const g of root.thematicGroups) {
        nextGroups[g.id] = visible
        for (const l of g.layers) {
          nextLayers[l.id] = visible
        }
      }

      return {
        ...s,
        rootVisibleById: { ...s.rootVisibleById, [rootId]: visible },
        groupVisibleById: nextGroups,
        layerVisibleById: nextLayers,
      }
    })

    // Apply to local uploaded OL layers if needed.
    if (rootId === UPLOADS_ROOT_ID) {
      for (const [id, l] of Object.entries(uploadedOlLayersByIdRef.current)) {
        if (!id.startsWith(UPLOAD_LAYER_PREFIX)) continue
        try {
          l.setVisible(visible)
        } catch {
          // ignore
        }
      }
    }
  }

  const onToggleGroup = (groupId: string, visible: boolean) => {
    let group: ThematicGroupDto | undefined
    for (const r of layerTreeView) {
      group = r.thematicGroups.find((g) => g.id === groupId)
      if (group) break
    }
    if (!group) return

    setVisibility((s) => {
      const nextLayers = { ...s.layerVisibleById }
      for (const l of group.layers) {
        nextLayers[l.id] = visible
      }

      return {
        ...s,
        groupVisibleById: { ...s.groupVisibleById, [groupId]: visible },
        layerVisibleById: nextLayers,
      }
    })
  }

  const onToggleLayer = (layerId: string, visible: boolean) => {
    setVisibility((s) => ({
      ...s,
      layerVisibleById: { ...s.layerVisibleById, [layerId]: visible },
    }))

    if (layerId.startsWith(UPLOAD_LAYER_PREFIX)) {
      const l = uploadedOlLayersByIdRef.current[layerId]
      if (l) {
        try {
          l.setVisible(visible)
        } catch {
          // ignore
        }
      }
    }
  }

  const onToggleLabel = (layerId: string, visible: boolean) => {
    setVisibility((s) => ({
      ...s,
      labelVisibleById: { ...s.labelVisibleById, [layerId]: visible },
    }))
  }

  const [activeBasemap, setActiveBasemap] = useState<BasemapId>("carto-positron")

  const [sidebarView, setSidebarView] = useState<
    "actions" | "layers" | "search" | "basemaps" | "searchAddress" | "legends" | "coordinateLocator" | "print" | "upload"
  >("actions")

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [map, setMap] = useState<OlMap | null>(null)
  const userUploadsGroupRef = useRef<LayerGroup | null>(null)
  const [printMode, setPrintMode] = useState(false)
  const [printIncludeLegends, setPrintIncludeLegends] = useState(true)
  const [printSelectionExtent, setPrintSelectionExtent] = useState<[number, number, number, number] | null>(null)
  const [printSelectionPoints, setPrintSelectionPoints] = useState<
    { start: [number, number]; end: [number, number] } | null
  >(null)
  const [printTitle, setPrintTitle] = useState("Mapa Porto Alegre")
  const [printDpi, setPrintDpi] = useState<72 | 96 | 150 | 300>(150)
  const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("landscape")
  const [printPaper, setPrintPaper] = useState<"A4" | "A3" | "Letter" | "Legal">("A4")
  const [featureTableLayerId, setFeatureTableLayerId] = useState<string | null>(null)
  const [featureTableMinimized, setFeatureTableMinimized] = useState<boolean>(false)
  const [featureTableMode, setFeatureTableMode] = useState<"layer" | "search">("layer")
  const [featureTableFeatures, setFeatureTableFeatures] = useState<any[] | null>(null)
  const [featureTableContext, setFeatureTableContext] = useState<string | null>(null)

  const selectedFeatureTableLayer = useMemo(() => {
    if (!featureTableLayerId) return null
    for (const root of layerTreeView) {
      for (const l of root.layers) if (l.id === featureTableLayerId) return l
      for (const g of root.thematicGroups) for (const l of g.layers) if (l.id === featureTableLayerId) return l
    }
    return null
  }, [featureTableLayerId, layerTreeView])

  const featureTableOpen = !!featureTableLayerId
  const featureTableHeightClass = featureTableOpen ? (featureTableMinimized ? "h-12" : "h-[40vh]") : "h-0"

  useEffect(() => {
    // OL needs an explicit resize notification when the map container changes size.
    // Opening/minimizing the attribute table changes available height, so updateSize keeps fit/zoom accurate.
    map?.updateSize?.()
  }, [map, featureTableOpen, featureTableMinimized])

  const ensureUserUploadsGroup = (m: OlMap | null) => {
    if (!m) return null
    if (userUploadsGroupRef.current) return userUploadsGroupRef.current

    const existing = (m.getLayers?.().getArray?.() ?? []).find((l: any) => l?.get?.("kind") === "userUploads")
    if (existing) {
      userUploadsGroupRef.current = existing as any
      return existing as any
    }

    const group = new LayerGroup({
      layers: [],
      properties: { id: "userUploads", kind: "userUploads", title: "Uploads" },
    })
    group.setZIndex(10_000)
    m.addLayer(group)
    userUploadsGroupRef.current = group
    return group
  }

  const addUploadedLayerToMap = (resp: UploadLayerResponse) => {
    if (!map) return

    const group = ensureUserUploadsGroup(map)
    if (!group) return

    const fmt = new GeoJSON()
    const text = JSON.stringify(resp.geojson ?? {})
    const { features } = readGeoJsonFeaturesRobust(fmt, text, "EPSG:3857", "EPSG:4326")

    const source = new VectorSource({ wrapX: false })
    source.addFeatures(features as any)

    const layer = new VectorLayer({
      source,
      properties: {
        id: `${UPLOAD_LAYER_PREFIX}${Date.now()}`,
        kind: "userUpload",
        title: resp.name,
        sourceCrs: resp.sourceCrs,
      },
    })
    const layerId = String(layer.get("id"))
    layer.setZIndex(10_001 + (group.getLayers().getLength?.() ?? 0))
    group.getLayers().push(layer)

    uploadedOlLayersByIdRef.current[layerId] = layer as any

    const geomType = (() => {
      try {
        const first = (features as any[])?.[0]
        const t = first?.getGeometry?.()?.getType?.()
        return olGeomToDtoType(t)
      } catch {
        return "Point" as const
      }
    })()

    // Add to sidebar tree
    setUploadedLayers((prev) => {
      const dto: LayerDto = {
        id: layerId,
        rootGroupId: UPLOADS_ROOT_ID,
        thematicGroupId: null,
        title: resp.name,
        layerName: layerId,
        workspace: "__uploads__",
        serviceType: "LOCAL",
        nativeCrs: resp.sourceCrs ?? null,
        visible: true,
        order: 10_000 + prev.length,
        geometryType: geomType,
        minZoom: null,
        queryable: false,
        queryableFields: null,
        tableFields: null,
        filter: null,
        popupTemplate: null,
        styleConfig: null,
      }
      return [...prev, dto]
    })

    setVisibility((s) => ({
      ...s,
      rootVisibleById: { ...s.rootVisibleById, [UPLOADS_ROOT_ID]: s.rootVisibleById[UPLOADS_ROOT_ID] ?? true },
      layerVisibleById: { ...s.layerVisibleById, [layerId]: true },
      labelVisibleById: { ...s.labelVisibleById, [layerId]: true },
    }))

    if (resp.bbox && resp.bbox.length === 4) {
      try {
        const extent3857 = transformExtent(resp.bbox as any, "EPSG:4326", "EPSG:3857")
        map.getView().fit(extent3857 as any, { padding: [40, 40, 40, 40], maxZoom: 19, duration: 250 })
      } catch {
        // ignore fit errors
      }
    }
  }

  const onMapReady = (m: OlMap | null) => {
    setMap(m)
    ensureUserUploadsGroup(m)
  }

  const sidebarSubtitle =
    sidebarView === "actions"
      ? "Menu Principal"
      : sidebarView === "layers"
        ? "Camadas"
        : sidebarView === "search"
          ? "Buscar"
          : sidebarView === "legends"
            ? "Legendas"
            : sidebarView === "upload"
              ? "Upload Camada"
              : sidebarView === "searchAddress"
                ? "Buscar Endereços"
                : sidebarView === "coordinateLocator"
                  ? "Localizar Coordenada"
                  : sidebarView === "print"
                    ? "Imprimir"
                    : "Mapas Base"

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: 320,
        breakpoint: "sm",
        collapsed: { mobile: !mobileSidebarOpen, desktop: !sidebarOpen },
      }}
      padding={0}
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={mobileSidebarOpen} onClick={() => setMobileSidebarOpen((v) => !v)} hiddenFrom="sm" size="sm" />
            <Text fw={700}>WebGIS</Text>
          </Group>

          <ActionIcon
            variant="subtle"
            visibleFrom="sm"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Esconder menu" : "Mostrar menu"}
          >
            {sidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </ActionIcon>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar>
        <MantineAppShell.Section>
          <Box p="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  WebGIS
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {sidebarSubtitle}
                </Text>
              </div>

              {sidebarView !== "actions" && (
                <ActionIcon
                  variant="subtle"
                  onClick={() => {
                    setSidebarView("actions")
                    setPrintMode(false)
                    setMobileSidebarOpen(false)
                  }}
                  title="Voltar"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    width="18"
                    height="18"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </ActionIcon>
              )}
            </Group>
          </Box>
        </MantineAppShell.Section>

        <MantineAppShell.Section grow component={ScrollArea}>
          <div className="min-h-0 flex-1 overflow-auto bg-zinc-50/50">
            {sidebarView === "actions" && (
              <div className="p-4 space-y-3">
                <button
                  onClick={() => setSidebarView("layers")}
                  className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
                >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Camadas</div>
                    <div className="text-xs text-zinc-500">Gerenciar visibilidade</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("search")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Buscar</div>
                    <div className="text-xs text-zinc-500">Pesquisar feições nas camadas</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("legends")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Legendas</div>
                    <div className="text-xs text-zinc-500">Visualizar legendas das camadas</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("upload")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 group-hover:bg-zinc-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M12 3v12" />
                      <path d="M7 8l5-5 5 5" />
                      <path d="M5 21h14" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Upload camada</div>
                    <div className="text-xs text-zinc-500">CSV, GeoJSON, SHP ou GPKG</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("searchAddress")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600 group-hover:bg-orange-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Buscar Endereços</div>
                    <div className="text-xs text-zinc-500">Localizar endereços e lugares</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("coordinateLocator")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Localizar Coordenada</div>
                    <div className="text-xs text-zinc-500">Ir para coordenada (WGS84 / TM-POA)</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => setSidebarView("basemaps")}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Mapas Base</div>
                    <div className="text-xs text-zinc-500">Alterar mapa de fundo</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button
                onClick={() => {
                  setSidebarView("print")
                  setMobileSidebarOpen(false)
                }}
                className="group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 group-hover:bg-zinc-100 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M6 9V2h12v7" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <path d="M6 14h12v8H6z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Imprimir mapa</div>
                    <div className="text-xs text-zinc-500">Selecionar área para impressão</div>
                  </div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}

          {sidebarView === "basemaps" && (
            <BasemapsPanel activeBasemap={activeBasemap} onBasemapChange={setActiveBasemap} />
          )}

          {sidebarView === "upload" && (
            <UploadLayerPanel
              apiBaseUrl={env.apiBaseUrl}
              onUploaded={(resp) => {
                addUploadedLayerToMap(resp)
                setMobileSidebarOpen(false)
              }}
            />
          )}

          {sidebarView === "layers" && (
            <>
              {loading && <div className="p-4 text-sm text-zinc-600 animate-pulse">Carregando camadas…</div>}
              {error && (
                <div className="p-4">
                  <Alert variant="destructive">
                    <AlertTitle>Erro</AlertTitle>
                    <AlertDescription>Falha ao carregar: {error}</AlertDescription>
                  </Alert>
                </div>
              )}
              {!loading && !error && data && (
                <LayerTree
                  tree={layerTreeView}
                  visibility={visibility}
                  onToggleRoot={onToggleRoot}
                  onToggleGroup={onToggleGroup}
                  onToggleLayer={onToggleLayer}
                  onOpenFeatureTable={(layerId) => {
                    // For uploaded layers, use inline features from OL source.
                    if (layerId.startsWith(UPLOAD_LAYER_PREFIX)) {
                      const l = uploadedOlLayersByIdRef.current[layerId]
                      const src = (l?.getSource?.() as any) ?? null
                      const feats = (src?.getFeatures?.() as any[]) ?? []
                      setFeatureTableLayerId(layerId)
                      setFeatureTableMinimized(false)
                      setFeatureTableMode("layer")
                      setFeatureTableFeatures(feats)
                      setFeatureTableContext(null)
                      setMobileSidebarOpen(false)
                      return
                    }

                    setFeatureTableLayerId(layerId)
                    setFeatureTableMinimized(false)
                    setFeatureTableMode("layer")
                    setFeatureTableFeatures(null)
                    setFeatureTableContext(null)
                    setMobileSidebarOpen(false)
                  }}
                />
              )}

              {!env.geoserverBaseUrl && (
                <div className="p-4">
                  <Alert>
                    <AlertTitle>Aviso</AlertTitle>
                    <AlertDescription>VITE_GEOSERVER_BASE_URL não configurado. A tree aparece, mas as camadas não serão renderizadas no mapa.</AlertDescription>
                  </Alert>
                </div>
              )}
            </>
          )}

          {sidebarView === "legends" && (
            <LegendsPanel
              tree={tree}
              visibility={visibility}
              geoserverBaseUrl={env.geoserverBaseUrl}
              onToggleLayer={onToggleLayer}
              onToggleLabel={onToggleLabel}
              onToggleRoot={onToggleRoot}
              onToggleGroup={onToggleGroup}
            />
          )}

          {sidebarView === "search" && (
            <SearchPanel
              apiBaseUrl={env.apiBaseUrl}
              geoserverBaseUrl={env.geoserverBaseUrl}
              tree={tree}
              loading={loading}
              error={error}
              onShowResults={(layer, contextLabel, features) => {
                setFeatureTableLayerId(layer.id)
                setFeatureTableMinimized(false)
                setFeatureTableMode("search")
                setFeatureTableFeatures(features)
                setFeatureTableContext(contextLabel)
                setMobileSidebarOpen(false)
              }}
            />
          )}

          {sidebarView === "searchAddress" && (
            <SearchAddressPanel
              onLocationSelect={(candidate) => {
                setSearchLocation(candidate.location)
                if (map) {
                  map.getView().animate({
                    center: fromLonLat([candidate.location.x, candidate.location.y]),
                    zoom: 17,
                    duration: 1000,
                  })
                }
                setMobileSidebarOpen(false)
              }}
            />
          )}

          {sidebarView === "coordinateLocator" && (
            <CoordinateLocatorPanel
              onLocationSelect={(location) => {
                setSearchLocation(location)
                if (map) {
                  map.getView().animate({
                    center: fromLonLat([location.x, location.y]),
                    zoom: 17,
                    duration: 1000,
                  })
                }
                setMobileSidebarOpen(false)
              }}
            />
          )}

          {sidebarView === "print" && (
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="printTitle" className="text-sm text-zinc-700">Título do Mapa</Label>
                <Input id="printTitle" value={printTitle} onChange={(e) => setPrintTitle(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="printDpi" className="text-sm text-zinc-700">Resolução (DPI)</Label>
                <Select id="printDpi" value={String(printDpi)} onChange={(e) => setPrintDpi(Number(e.target.value) as any)}>
                  <option value="72">72 DPI (Baixa)</option>
                  <option value="96">96 DPI (Web)</option>
                  <option value="150">150 DPI (Padrão)</option>
                  <option value="300">300 DPI (Alta)</option>
                </Select>
                <div className="text-xs text-zinc-500">Maior DPI = melhor qualidade e arquivo maior</div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-zinc-700">Orientação</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={printOrientation === "portrait" ? "default" : "outline"} className="flex-1" onClick={() => setPrintOrientation("portrait")}>
                    Retrato
                  </Button>
                  <Button type="button" variant={printOrientation === "landscape" ? "default" : "outline"} className="flex-1" onClick={() => setPrintOrientation("landscape")}>
                    Paisagem
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="printPaper" className="text-sm text-zinc-700">Tamanho do Papel</Label>
                <Select id="printPaper" value={printPaper} onChange={(e) => setPrintPaper(e.target.value as any)}>
                  <option value="A4">A4 (210 x 297 mm)</option>
                  <option value="A3">A3 (297 x 420 mm)</option>
                  <option value="Letter">Letter (8.5 x 11 in)</option>
                  <option value="Legal">Legal (8.5 x 14 in)</option>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox checked={printIncludeLegends} onChange={(e) => setPrintIncludeLegends((e.target as HTMLInputElement).checked)} id="printIncludeLegends" />
                <Label htmlFor="printIncludeLegends" className="text-sm text-zinc-700">
                  Incluir legendas visíveis no PDF
                </Label>
              </div>

              <Button
                className="w-full"
                onClick={() => {
                  setPrintMode(true)
                  setSidebarOpen(false)
                  setMobileSidebarOpen(false)
                }}
              >
                Imprimir
              </Button>
            </div>
          )}
          </div>
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <div className="relative flex h-[calc(100vh-56px)] min-h-0 min-w-0 flex-1 flex-col">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "absolute top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white p-1.5 shadow-md hover:bg-zinc-50 md:flex text-zinc-600 transition-all duration-300",
              sidebarOpen ? "left-0 -translate-x-1/2" : "left-4 -translate-x-1/2"
            )}
            title={sidebarOpen ? "Esconder menu" : "Mostrar menu"}
          >
            {sidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>

          <div className="min-h-0 flex-1 relative">
            <MapView
              tree={tree}
              visibility={visibility}
              geoserverBaseUrl={env.geoserverBaseUrl}
              availability={availability}
              activeBasemap={activeBasemap}
              searchLocation={searchLocation}
              onMapReady={onMapReady}
              printMode={printMode}
              onPrintSelectionExtentChange={setPrintSelectionExtent}
              onPrintSelectionPointsChange={setPrintSelectionPoints}
            />

            {printMode && (
              <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
                <Alert className="w-[360px] max-w-[calc(100vw-2rem)] p-3 shadow-md border-zinc-200">
                  <AlertDescription className="text-xs text-zinc-700">
                    Desenhe um retângulo de seleção para imprimir ou clique em Imprimir para imprimir a tela inteira.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPrintMode(false)
                      setSidebarOpen(true)
                      setSidebarView("print")
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={!map}
                    onClick={async () => {
                      if (!map) return

                      // If the user didn't draw a selection, print the current viewport.
                      const selectionExtent =
                        printSelectionExtent ??
                        (map.getView().calculateExtent(map.getSize?.() ?? undefined) as [number, number, number, number])

                      try {
                        await printMapSelection({
                          map,
                          selectionExtent,
                          selectionPoints: printSelectionExtent ? (printSelectionPoints ?? undefined) : undefined,
                          includeLegends: printIncludeLegends,
                          title: printTitle,
                          dpi: printDpi,
                          orientation: printOrientation,
                          paper: printPaper,
                          tree,
                          visibility,
                          geoserverBaseUrl: env.geoserverBaseUrl,
                        })
                        setPrintMode(false)
                        setSidebarOpen(true)
                        setSidebarView("print")
                      } catch (e: unknown) {
                        // eslint-disable-next-line no-console
                        console.error(e)
                        const msg = e instanceof Error ? e.message : "Falha ao imprimir."
                        window.alert(msg)
                      }
                    }}
                  >
                    Imprimir
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className={`${featureTableHeightClass} min-h-0 transition-[height] duration-150`}>
            {featureTableOpen && (
              <FeatureTable
                map={map}
                layer={selectedFeatureTableLayer}
                geoserverBaseUrl={env.geoserverBaseUrl}
                open={featureTableOpen}
                minimized={featureTableMinimized}
                features={featureTableMode === "search" ? featureTableFeatures ?? [] : featureTableFeatures ?? undefined}
                headerTitle={featureTableMode === "search" ? "Tabela resultado de:" : undefined}
                headerContext={featureTableMode === "search" ? featureTableContext ?? "" : undefined}
                onMinimize={() => setFeatureTableMinimized(true)}
                onMaximize={() => setFeatureTableMinimized(false)}
                onClose={() => {
                  setFeatureTableLayerId(null)
                  setFeatureTableMinimized(false)
                  setFeatureTableMode("layer")
                  setFeatureTableFeatures(null)
                  setFeatureTableContext(null)
                }}
              />
            )}
          </div>
        </div>
      </MantineAppShell.Main>
    </MantineAppShell>
  )
}

*/
