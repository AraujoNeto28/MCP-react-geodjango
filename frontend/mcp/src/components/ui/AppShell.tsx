import type OlMap from "ol/Map"

import type { RootGroupDto } from "../../features/layers/types"
import type { BasemapId } from "../../features/map/basemaps"
import type { UploadLayerResponse } from "../../features/upload/types"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "../../map/olLayerFactory"

import { AppHeader } from "./AppHeader"
import { AppMain } from "./AppMain"
import { AppNavbar } from "./AppNavbar"

import { AppShell as MantineAppShell } from "@mantine/core"

export type AppShellView =
	| "actions"
	| "layers"
	| "search"
	| "basemaps"
	| "searchAddress"
	| "legends"
	| "coordinateLocator"
	| "print"
	| "upload"

export type PrintSelectionPoints = { start: [number, number]; end: [number, number] }

export type AppShellProps = {
	isMobile: boolean

	mobileSidebarOpen: boolean
	onToggleMobileSidebar: () => void

	sidebarOpen: boolean
	onToggleSidebarOpen: () => void

	sidebarView: AppShellView
	setSidebarView: (view: AppShellView) => void
	sidebarSubtitle: string
	onBackToActions: () => void

	apiBaseUrl: string
	geoserverBaseUrl: string

	activeBasemap: BasemapId
	onBasemapChange: (id: BasemapId) => void

	tree: RootGroupDto[]
	layerTreeView: RootGroupDto[]
	visibility: LayerVisibilityState
	loading: boolean
	error: string | null

	onToggleRoot: (rootId: string, visible: boolean) => void
	onToggleGroup: (groupId: string, visible: boolean) => void
	onToggleLayer: (layerId: string, visible: boolean) => void
	onToggleLabel: (layerId: string, visible: boolean) => void
	onOpenFeatureTable: (layerId: string) => void
	onShowSearchResults: (layer: any, contextLabel: string, features: any[]) => void

	onUploadedLayer: (resp: UploadLayerResponse) => void
	onAddressLocationSelect: (location: { x: number; y: number }) => void
	onCoordinateLocationSelect: (location: { x: number; y: number }) => void

	printTitle: string
	onPrintTitleChange: (title: string) => void
	printDpi: 72 | 96 | 150 | 300
	onPrintDpiChange: (dpi: 72 | 96 | 150 | 300) => void
	printOrientation: "portrait" | "landscape"
	onPrintOrientationChange: (v: "portrait" | "landscape") => void
	printPaper: "A4" | "A3" | "Letter" | "Legal"
	onPrintPaperChange: (v: "A4" | "A3" | "Letter" | "Legal") => void
	printIncludeLegends: boolean
	onPrintIncludeLegendsChange: (v: boolean) => void
	onStartPrintMode: () => void

	map: OlMap | null
	onMapReady: (m: OlMap | null) => void
	availability: GeoServerLayerAvailability
	searchLocation: { x: number; y: number } | null

	printMode: boolean
	printSelectionExtent: [number, number, number, number] | null
	onPrintSelectionExtentChange: (extent: [number, number, number, number] | null) => void
	printSelectionPoints: PrintSelectionPoints | null
	onPrintSelectionPointsChange: (points: PrintSelectionPoints | null) => void
	onCancelPrint: () => void
	onConfirmPrint: () => Promise<void> | void

	featureTableOpen: boolean
	featureTableMinimized: boolean
	featureTableMode: "layer" | "search"
	featureTableFeatures: any[] | null
	featureTableContext: string | null
	selectedFeatureTableLayer: any
	onMinimizeFeatureTable: () => void
	onMaximizeFeatureTable: () => void
	onCloseFeatureTable: () => void
}

export function AppShell(props: AppShellProps) {
	const {
		isMobile,
		mobileSidebarOpen,
		onToggleMobileSidebar,
		sidebarOpen,
		onToggleSidebarOpen,
		sidebarView,
		setSidebarView,
		sidebarSubtitle,
		onBackToActions,
		apiBaseUrl,
		geoserverBaseUrl,
		activeBasemap,
		onBasemapChange,
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
		onUploadedLayer,
		onAddressLocationSelect,
		onCoordinateLocationSelect,
		printTitle,
		onPrintTitleChange,
		printDpi,
		onPrintDpiChange,
		printOrientation,
		onPrintOrientationChange,
		printPaper,
		onPrintPaperChange,
		printIncludeLegends,
		onPrintIncludeLegendsChange,
		onStartPrintMode,
		map,
		onMapReady,
		availability,
		searchLocation,
		printMode,
		onPrintSelectionExtentChange,
		onPrintSelectionPointsChange,
		onCancelPrint,
		onConfirmPrint,
		featureTableOpen,
		featureTableMinimized,
		featureTableMode,
		featureTableFeatures,
		featureTableContext,
		selectedFeatureTableLayer,
		onMinimizeFeatureTable,
		onMaximizeFeatureTable,
		onCloseFeatureTable,
	} = props

	return (
		<MantineAppShell
			header={{ height: 56 }}
			navbar={{
				// NOTE: Mantine forces navbar width to 100% when viewport < breakpoint.
				// To keep a narrower navbar on mobile and still see/interact with the map,
				// we disable "mobile mode" by setting breakpoint=0 and handle collapse ourselves.
				width: { base: 230, sm: 320 },
				breakpoint: 0,
				collapsed: { desktop: isMobile ? !mobileSidebarOpen : !sidebarOpen },
			}}
			padding={0}
		>
			<AppHeader
				mobileSidebarOpen={mobileSidebarOpen}
				onToggleMobileSidebar={onToggleMobileSidebar}
			/>

			<AppNavbar
				sidebarOpen={sidebarOpen}
				onToggleSidebarOpen={onToggleSidebarOpen}
				sidebarView={sidebarView}
				sidebarSubtitle={sidebarSubtitle}
				onBackToActions={onBackToActions}
				setSidebarView={setSidebarView}
				apiBaseUrl={apiBaseUrl}
				geoserverBaseUrl={geoserverBaseUrl}
				activeBasemap={activeBasemap}
				onBasemapChange={onBasemapChange}
				tree={tree}
				layerTreeView={layerTreeView}
				visibility={visibility}
				loading={loading}
				error={error}
				onToggleRoot={onToggleRoot}
				onToggleGroup={onToggleGroup}
				onToggleLayer={onToggleLayer}
				onToggleLabel={onToggleLabel}
				onOpenFeatureTable={onOpenFeatureTable}
				onShowSearchResults={onShowSearchResults}
				onUploadedLayer={onUploadedLayer}
				onAddressLocationSelect={onAddressLocationSelect}
				onCoordinateLocationSelect={onCoordinateLocationSelect}
				printTitle={printTitle}
				onPrintTitleChange={onPrintTitleChange}
				printDpi={printDpi}
				onPrintDpiChange={onPrintDpiChange}
				printOrientation={printOrientation}
				onPrintOrientationChange={onPrintOrientationChange}
				printPaper={printPaper}
				onPrintPaperChange={onPrintPaperChange}
				printIncludeLegends={printIncludeLegends}
				onPrintIncludeLegendsChange={onPrintIncludeLegendsChange}
				onStartPrintMode={onStartPrintMode}
			/>

			<MantineAppShell.Main>
				<AppMain
					sidebarOpen={sidebarOpen}
					onToggleSidebarOpen={onToggleSidebarOpen}
					tree={tree}
					visibility={visibility}
					geoserverBaseUrl={geoserverBaseUrl}
					availability={availability}
					activeBasemap={activeBasemap}
					searchLocation={searchLocation}
					onMapReady={onMapReady}
					printMode={printMode}
					onPrintSelectionExtentChange={onPrintSelectionExtentChange}
					onPrintSelectionPointsChange={onPrintSelectionPointsChange}
					map={map}
					onCancelPrint={onCancelPrint}
					onConfirmPrint={onConfirmPrint}
					featureTableOpen={featureTableOpen}
					featureTableMinimized={featureTableMinimized}
					featureTableMode={featureTableMode}
					featureTableFeatures={featureTableFeatures}
					featureTableContext={featureTableContext}
					selectedFeatureTableLayer={selectedFeatureTableLayer}
					onMinimizeFeatureTable={onMinimizeFeatureTable}
					onMaximizeFeatureTable={onMaximizeFeatureTable}
					onCloseFeatureTable={onCloseFeatureTable}
				/>
			</MantineAppShell.Main>
		</MantineAppShell>
	)
}
