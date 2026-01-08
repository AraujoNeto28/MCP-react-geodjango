import { useEffect, useMemo, useState } from "react"
import { fromLonLat } from "ol/proj"

import { env } from "../config/env"
import { fetchGeoServerWorkspaceLayers } from "../features/geoserver/api"
import { LayerTree } from "../features/layers/LayerTree"
import { useLayersTree } from "../features/layers/useLayersTree"
import type { RootGroupDto, ServiceType, ThematicGroupDto } from "../features/layers/types"
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

import type OlMap from "ol/Map"

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

  const [availability, setAvailability] = useState<GeoServerLayerAvailability>({})
  const [searchLocation, setSearchLocation] = useState<{ x: number; y: number } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Initialize visibility when tree loads
  useEffect(() => {
    if (!data) return
    setVisibility(buildInitialVisibility(data))
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
    const root = tree.find((r) => r.id === rootId)
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
  }

  const onToggleGroup = (groupId: string, visible: boolean) => {
    let group: ThematicGroupDto | undefined
    for (const r of tree) {
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
  }

  const onToggleLabel = (layerId: string, visible: boolean) => {
    setVisibility((s) => ({
      ...s,
      labelVisibleById: { ...s.labelVisibleById, [layerId]: visible },
    }))
  }

  const [activeBasemap, setActiveBasemap] = useState<BasemapId>("carto-positron")

  const [sidebarView, setSidebarView] = useState<
    "actions" | "layers" | "search" | "basemaps" | "searchAddress" | "legends" | "coordinateLocator" | "print"
  >("actions")

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [map, setMap] = useState<OlMap | null>(null)
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
    for (const root of tree) {
      for (const l of root.layers) if (l.id === featureTableLayerId) return l
      for (const g of root.thematicGroups) for (const l of g.layers) if (l.id === featureTableLayerId) return l
    }
    return null
  }, [featureTableLayerId, tree])

  const featureTableOpen = !!featureTableLayerId
  const featureTableHeightClass = featureTableOpen ? (featureTableMinimized ? "h-12" : "h-[40vh]") : "h-0"

  useEffect(() => {
    // OL needs an explicit resize notification when the map container changes size.
    // Opening/minimizing the attribute table changes available height, so updateSize keeps fit/zoom accurate.
    map?.updateSize?.()
  }, [map, featureTableOpen, featureTableMinimized])

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-zinc-50">
      {/* Mobile app bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white px-4 shadow-sm md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-600"
          title="Menu"
          onClick={() => setMobileSidebarOpen((v) => !v)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        </Button>

        <div className="min-w-0">
          <div className="truncate text-base font-bold text-zinc-900">WebGIS</div>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full flex-col w-64 sm:w-72 md:w-80 shrink-0 bg-white transition-all duration-300 ease-in-out md:static md:z-auto md:translate-x-0 shadow-xl md:shadow-none border-r border-zinc-200",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          !sidebarOpen && "md:w-0 md:border-none overflow-hidden"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-blue-800 px-6 shrink-0 bg-blue-700 text-white">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-tight">WebGIS</div>
            <div className="truncate text-xs text-blue-100 font-medium uppercase tracking-wider">
              {sidebarView === "actions"
                ? "Menu Principal"
                : sidebarView === "layers"
                  ? "Camadas"
                  : sidebarView === "search"
                    ? "Buscar"
                    : sidebarView === "legends"
                      ? "Legendas"
                      : sidebarView === "searchAddress"
                        ? "Buscar Endereços"
                        : sidebarView === "coordinateLocator"
                          ? "Localizar Coordenada"
                          : sidebarView === "print"
                            ? "Imprimir"
                            : "Mapas Base"}
            </div>
          </div>
          {sidebarView !== "actions" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSidebarView("actions")
                setPrintMode(false)
              }}
              className="text-blue-200 hover:text-white hover:bg-blue-600"
              title="Voltar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Button>
          )}
        </div>

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
                  tree={tree}
                  visibility={visibility}
                  onToggleRoot={onToggleRoot}
                  onToggleGroup={onToggleGroup}
                  onToggleLayer={onToggleLayer}
                  onOpenFeatureTable={(layerId) => {
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
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col pt-12 md:pt-0">
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
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
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
            onMapReady={setMap}
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
              features={featureTableMode === "search" ? featureTableFeatures ?? [] : undefined}
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
      </main>
    </div>
  )
}
