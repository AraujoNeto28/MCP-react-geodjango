import type OlMap from "ol/Map"

import type { RootGroupDto } from "../../features/layers/types"
import type { BasemapId } from "../../features/basemaps/basemaps"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "../../map/olLayerFactory"

import { MapView } from "../../map/MapView"
import { FeatureTable } from "../../widgets/featureTable/FeatureTable"

import { PrintOverlay } from "./PrintOverlay"

export type PrintSelectionPoints = { start: [number, number]; end: [number, number] }

export type AppMainProps = {
	sidebarOpen: boolean
	onToggleSidebarOpen: () => void

	tree: RootGroupDto[]
	visibility: LayerVisibilityState
	geoserverBaseUrl: string
	availability: GeoServerLayerAvailability
	activeBasemap: BasemapId
	searchLocation: { x: number; y: number } | null
	onMapReady: (m: OlMap | null) => void

	printMode: boolean
	onPrintSelectionExtentChange: (extent: [number, number, number, number] | null) => void
	onPrintSelectionPointsChange: (points: PrintSelectionPoints | null) => void

	map: OlMap | null
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

export function AppMain(props: AppMainProps) {
	const {
		tree,
		visibility,
		geoserverBaseUrl,
		availability,
		activeBasemap,
		searchLocation,
		onMapReady,
		printMode,
		onPrintSelectionExtentChange,
		onPrintSelectionPointsChange,
		map,
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

	const featureTableHeightClass = featureTableOpen ? (featureTableMinimized ? "h-12" : "h-[40vh]") : "h-0"

	return (
		<div className="relative flex h-[calc(100vh-56px)] min-h-0 min-w-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 relative">
				<MapView
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
				/>

				<PrintOverlay open={printMode} map={map} onCancel={onCancelPrint} onConfirm={onConfirmPrint} />
			</div>

			<div className={`${featureTableHeightClass} min-h-0 transition-[height] duration-150`}>
				{featureTableOpen && (
					<FeatureTable
						map={map}
						layer={selectedFeatureTableLayer}
						geoserverBaseUrl={geoserverBaseUrl}
						open={featureTableOpen}
						minimized={featureTableMinimized}
						features={featureTableMode === "search" ? featureTableFeatures ?? [] : featureTableFeatures ?? undefined}
						headerTitle={featureTableMode === "search" ? "Tabela resultado de:" : undefined}
						headerContext={featureTableMode === "search" ? featureTableContext ?? "" : undefined}
						onMinimize={onMinimizeFeatureTable}
						onMaximize={onMaximizeFeatureTable}
						onClose={onCloseFeatureTable}
					/>
				)}
			</div>
		</div>
	)
}
