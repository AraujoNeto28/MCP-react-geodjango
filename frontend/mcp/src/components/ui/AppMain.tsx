import type OlMap from "ol/Map"

import type { RootGroupDto } from "../../features/layers/types"
import type { BasemapId } from "../../features/map/basemaps"
import type { GeoServerLayerAvailability, LayerVisibilityState } from "../../map/olLayerFactory"

import { MapView } from "../../map/MapView"
import { FeatureTable } from "../../widgets/featureTable/FeatureTable"

import { PrintOverlay } from "./PrintOverlay"

import { ActionIcon } from "@mantine/core"

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
		sidebarOpen,
		onToggleSidebarOpen,
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
			{!sidebarOpen && (
				<ActionIcon
					variant="default"
					size="lg"
					radius="xl"
					visibleFrom="sm"
					onClick={onToggleSidebarOpen}
					title="Mostrar menu"
					style={{ position: "absolute", top: "50%", left: 10, transform: "translateY(-50%)", zIndex: 20 }}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
						<path
							fillRule="evenodd"
							d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
							clipRule="evenodd"
						/>
					</svg>
				</ActionIcon>
			)}

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
