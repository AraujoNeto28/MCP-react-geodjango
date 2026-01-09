import { useEffect, useMemo, useRef, useState } from "react"
import { fromLonLat, transformExtent } from "ol/proj"

import { env } from "./config/env"
import { fetchGeoServerWorkspaceLayers } from "./features/geoserver/api"
import { useLayersTree } from "./features/layers/useLayersTree"
import type { LayerDto, RootGroupDto, ServiceType, ThematicGroupDto } from "./features/layers/types"
import type { BasemapId } from "./features/basemaps/basemaps"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "./map/olLayerFactory"
import { printMapSelection } from "./map/print"
import type { UploadLayerResponse } from "./features/upload/types"

import GeoJSON from "ol/format/GeoJSON"
import LayerGroup from "ol/layer/Group"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import type OlMap from "ol/Map"

import { readGeoJsonFeaturesRobust } from "./map/geojsonUtils"
import { AppShell, type AppShellView, type AppShellProps } from "./components/ui/AppShell"

import { useMediaQuery } from "@mantine/hooks"

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

export function AppShellContainer() {
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
			} catch {
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

	const [sidebarView, setSidebarView] = useState<AppShellView>("actions")

	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
	const isMobile = useMediaQuery("(max-width: 48em)") ?? false

	useEffect(() => {
		// When leaving mobile, close the mobile drawer state.
		if (!isMobile) setMobileSidebarOpen(false)
	}, [isMobile])

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

	const onBackToActions = () => {
		setSidebarView("actions")
		setPrintMode(false)
		setMobileSidebarOpen(false)
	}

	const onOpenFeatureTable = (layerId: string) => {
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
	}

	const onShowSearchResults = (layer: any, contextLabel: string, features: any[]) => {
		setFeatureTableLayerId(layer.id)
		setFeatureTableMinimized(false)
		setFeatureTableMode("search")
		setFeatureTableFeatures(features)
		setFeatureTableContext(contextLabel)
		setMobileSidebarOpen(false)
	}

	const onAddressLocationSelect = (location: { x: number; y: number }) => {
		setSearchLocation(location)
		if (map) {
			map.getView().animate({
				center: fromLonLat([location.x, location.y]),
				zoom: 17,
				duration: 1000,
			})
		}
		setMobileSidebarOpen(false)
	}

	const onCoordinateLocationSelect = (location: { x: number; y: number }) => {
		setSearchLocation(location)
		if (map) {
			map.getView().animate({
				center: fromLonLat([location.x, location.y]),
				zoom: 17,
				duration: 1000,
			})
		}
		setMobileSidebarOpen(false)
	}

	const onCancelPrint = () => {
		setPrintMode(false)
		setSidebarOpen(true)
		setSidebarView("print")
	}

	const onConfirmPrint = async () => {
		if (!map) return

		// If the user didn't draw a selection, print the current viewport.
		const selectionExtent =
			printSelectionExtent ??
			(map.getView().calculateExtent(map.getSize?.() ?? undefined) as [number, number, number, number])

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
	}

	const props: AppShellProps = {
		isMobile,
		mobileSidebarOpen,
		onToggleMobileSidebar: () => setMobileSidebarOpen((v) => !v),
		sidebarOpen,
		onToggleSidebarOpen: () => setSidebarOpen((v) => !v),
		sidebarView,
		setSidebarView,
		sidebarSubtitle,
		onBackToActions,

		apiBaseUrl: env.apiBaseUrl,
		geoserverBaseUrl: env.geoserverBaseUrl,
		activeBasemap,
		onBasemapChange: setActiveBasemap,
		tree,
		layerTreeView,
		visibility,
		loading,
		error,
		onToggleRoot,
		onToggleGroup,
		onToggleLayer,
		onToggleLabel,
		onOpenFeatureTable,
		onShowSearchResults,
		onUploadedLayer: (resp) => {
			addUploadedLayerToMap(resp)
			setMobileSidebarOpen(false)
		},
		onAddressLocationSelect,
		onCoordinateLocationSelect,

		printTitle,
		onPrintTitleChange: setPrintTitle,
		printDpi,
		onPrintDpiChange: setPrintDpi,
		printOrientation,
		onPrintOrientationChange: setPrintOrientation,
		printPaper,
		onPrintPaperChange: setPrintPaper,
		printIncludeLegends,
		onPrintIncludeLegendsChange: setPrintIncludeLegends,
		onStartPrintMode: () => {
			setPrintMode(true)
			setSidebarOpen(false)
			setMobileSidebarOpen(false)
		},

		map,
		onMapReady,
		availability,
		searchLocation,

		printMode,
		printSelectionExtent,
		onPrintSelectionExtentChange: setPrintSelectionExtent,
		printSelectionPoints,
		onPrintSelectionPointsChange: setPrintSelectionPoints,
		onCancelPrint,
		onConfirmPrint,

		featureTableOpen,
		featureTableMinimized,
		featureTableMode,
		featureTableFeatures,
		featureTableContext,
		selectedFeatureTableLayer,
		onMinimizeFeatureTable: () => setFeatureTableMinimized(true),
		onMaximizeFeatureTable: () => setFeatureTableMinimized(false),
		onCloseFeatureTable: () => {
			setFeatureTableLayerId(null)
			setFeatureTableMinimized(false)
			setFeatureTableMode("layer")
			setFeatureTableFeatures(null)
			setFeatureTableContext(null)
		},
	}

	return <AppShell {...props} />
}
