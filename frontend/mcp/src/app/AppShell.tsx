import { useEffect, useMemo, useState } from "react"

import { env } from "../config/env"
import { fetchGeoServerWorkspaceLayers } from "../features/geoserver/api"
import { LayerTree } from "../features/layers/LayerTree"
import { useLayersTree } from "../features/layers/useLayersTree"
import type { RootGroupDto, ServiceType, ThematicGroupDto } from "../features/layers/types"
import { SearchPanel } from "../features/search/SearchPanel"
import { MapView } from "../map/MapView"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "../map/olLayerFactory"
import { FeatureTable } from "../widgets/featureTable/FeatureTable"

import type OlMap from "ol/Map"

function buildInitialVisibility(tree: RootGroupDto[]): LayerVisibilityState {
  const rootVisibleById: Record<string, boolean> = {}
  const groupVisibleById: Record<string, boolean> = {}
  const layerVisibleById: Record<string, boolean> = {}

  for (const root of tree) {
    rootVisibleById[root.id] = root.visible
    for (const l of root.layers) layerVisibleById[l.id] = l.visible
    for (const g of root.thematicGroups) {
      groupVisibleById[g.id] = g.visible
      for (const l of g.layers) layerVisibleById[l.id] = l.visible
    }
  }

  return { rootVisibleById, groupVisibleById, layerVisibleById }
}

export function AppShell() {
  const { data, loading, error } = useLayersTree(env.apiBaseUrl)

  const [visibility, setVisibility] = useState<LayerVisibilityState>(() => ({
    rootVisibleById: {},
    groupVisibleById: {},
    layerVisibleById: {},
  }))

  const tree = useMemo(() => data ?? [], [data])

  const [availability, setAvailability] = useState<GeoServerLayerAvailability>({})

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

  const [sidebarView, setSidebarView] = useState<"actions" | "layers" | "search">("actions")

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [map, setMap] = useState<OlMap | null>(null)
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
    <div className="relative flex h-screen w-screen overflow-hidden bg-white">
      {/* Mobile app bar */}
      <div className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-3 md:hidden">
        <button
          type="button"
          className="rounded border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
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
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        </button>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">WebGIS</div>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-40 w-80 shrink-0 bg-white transition-transform md:static md:z-auto md:translate-x-0 md:border-r md:border-zinc-200 md:flex md:h-full md:flex-col " +
          (mobileSidebarOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 shrink-0">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">WebGIS</div>
            <div className="truncate text-xs text-zinc-500">
              {sidebarView === "actions"
                ? "Menu Principal"
                : sidebarView === "layers"
                  ? "Gerenciador de Camadas"
                  : "Buscar"}
            </div>
          </div>
          {sidebarView !== "actions" && (
            <button
              onClick={() => setSidebarView("actions")}
              className="rounded border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              title="Voltar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {sidebarView === "actions" && (
            <div className="space-y-2">
              <button
                onClick={() => setSidebarView("search")}
                className="flex w-full items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100"
              >
                <span>Buscar</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4 text-zinc-500"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
              <button
                onClick={() => setSidebarView("layers")}
                className="flex w-full items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100"
              >
                <span>Camadas</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4 text-zinc-500"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}

          {sidebarView === "layers" && (
            <>
              {loading && <div className="text-sm text-zinc-600">Carregando camadas…</div>}
              {error && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Falha ao carregar: {error}
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
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  VITE_GEOSERVER_BASE_URL não configurado. A tree aparece, mas as camadas não serão renderizadas no mapa.
                </div>
              )}
            </>
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
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-12 md:pt-0">
        <div className="min-h-0 flex-1">
          <MapView
            tree={tree}
            visibility={visibility}
            geoserverBaseUrl={env.geoserverBaseUrl}
            availability={availability}
            onMapReady={setMap}
          />
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
