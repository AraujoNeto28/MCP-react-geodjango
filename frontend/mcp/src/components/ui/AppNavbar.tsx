import { Alert, AlertDescription, AlertTitle } from "./Alert"
import { BasemapsPanel } from "../../features/basemaps/BasemapsPanel"
import { Button } from "./Button"
import { Checkbox } from "./Checkbox"
import { CoordinateLocatorPanel } from "../../features/search/CoordinateLocatorPanel"
import type { RootGroupDto } from "../../features/layers/types"
import { Input } from "./Input"
import { Label } from "./Label"
import { LayerTree } from "../../features/layers/LayerTree"
import { LegendsPanel } from "../../features/legends/LegendsPanel"
import { SearchAddressPanel } from "../../features/search/SearchAddressPanel"
import { SearchPanel } from "../../features/search/SearchPanel"
import { Select } from "./Select"
import { UploadLayerPanel } from "../../features/upload/UploadLayerPanel"
import type { UploadLayerResponse } from "../../features/upload/types"
import type { BasemapId } from "../../features/basemaps/basemaps"
import type { LayerVisibilityState } from "../../map/olLayerFactory"

import { ActionIcon, AppShell as MantineAppShell, Avatar, Box, Group, Text } from "@mantine/core"

import { AppNavLink } from "./AppNavLink"

import { useAuth } from "../../auth/AuthContext"

type SidebarView =
	| "actions"
	| "layers"
	| "search"
	| "basemaps"
	| "searchAddress"
	| "legends"
	| "coordinateLocator"
	| "print"
	| "upload"

type AppNavbarProps = {
	sidebarOpen: boolean
	onToggleSidebarOpen: () => void

	sidebarView: SidebarView
	sidebarSubtitle: string
	onBackToActions: () => void
	setSidebarView: (view: SidebarView) => void

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
}

export function AppNavbar(props: AppNavbarProps) {
	const auth = useAuth()
	const username = auth.user.username ?? auth.user.name ?? ""
	const avatarLetter = (auth.user.name ?? auth.user.username ?? "?").trim().slice(0, 1).toUpperCase() || "?"

	const {
		sidebarOpen,
		onToggleSidebarOpen,
		sidebarView,
		onBackToActions,
		setSidebarView,
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
	} = props

	if (!sidebarOpen) {
		return (
			<MantineAppShell.Navbar>
				<Box
					style={{
						height: "100%",
						position: "relative",
						backgroundColor: "var(--mantine-color-body)",
						borderRight: "1px solid var(--mantine-color-gray-3)",
					}}
				>
					<ActionIcon
						variant="default"
						size="lg"
						radius="xl"
						visibleFrom="sm"
						onClick={onToggleSidebarOpen}
						title="Mostrar menu"
						style={{
							position: "absolute",
							top: "50%",
							right: -18,
							transform: "translateY(-50%)",
							zIndex: 10,
						}}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							width="18"
							height="18"
						>
							<path
								fillRule="evenodd"
								d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
								clipRule="evenodd"
							/>
						</svg>
					</ActionIcon>
				</Box>
			</MantineAppShell.Navbar>
		)
	}

	return (
		<MantineAppShell.Navbar>
			<Box style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
				<MantineAppShell.Section>
					<Box
						p="md"
						style={{
							backgroundColor: "#E61127",
							borderBottom: "1px solid rgba(255, 255, 255, 0.18)",
						}}
					>
						<Group justify="space-between" align="flex-start" wrap="nowrap">
							<div style={{ minWidth: 0 }}>
								<Text fw={700} truncate c="white">
									Menu Principal
								</Text>
								<Group gap="xs" mt={6} wrap="nowrap">
									<Avatar radius="xl" size={28} color="white" style={{border: "1px solid white"}}>
										{avatarLetter}
									</Avatar>
									<Text size="md" c="white" opacity={0.9} truncate>
										{username}
									</Text>
									<ActionIcon
										variant="subtle"
										size="sm"
										title="Sair"
										onClick={auth.logout}
										style={{ color: "white", opacity: 0.95 }}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											strokeWidth={2}
											stroke="currentColor"
											width="32"
											height="32"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
										/>
									</svg>
									</ActionIcon>
								</Group>
							</div>

							{sidebarView !== "actions" && (
								<ActionIcon
									variant="subtle"
									onClick={onBackToActions}
									title="Voltar"
									style={{ color: "white" }}
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
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
										/>
									</svg>
								</ActionIcon>
							)}
						</Group>
					</Box>
				</MantineAppShell.Section>

				<MantineAppShell.Section
					grow
					style={{ minHeight: 0 }}
				>
					<div
						className="bg-zinc-50/50"
						style={{ height: "100%", overflowY: "auto" }}
						onWheelCapture={(e) => e.stopPropagation()}
					>
					{sidebarView === "actions" && (
						<div className="p-3 space-y-2">
							<AppNavLink
								title="Camadas"
								description="Gerenciar visibilidade"
								onClick={() => setSidebarView("layers")}
								iconWrapperClassName="bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
									</svg>
								}
							/>

							<AppNavLink
								title="Buscar"
								description="Pesquisar feições nas camadas"
								onClick={() => setSidebarView("search")}
								iconWrapperClassName="bg-blue-50 text-blue-600 group-hover:bg-blue-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
										/>
									</svg>
								}
							/>

							<AppNavLink
								title="Legendas"
								description="Visualizar legendas das camadas"
								onClick={() => setSidebarView("legends")}
								iconWrapperClassName="bg-purple-50 text-purple-600 group-hover:bg-purple-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
										/>
									</svg>
								}
							/>

							<AppNavLink
								title="Upload camada"
								description="CSV, GeoJSON, SHP ou GPKG"
								onClick={() => setSidebarView("upload")}
								iconWrapperClassName="bg-zinc-50 text-zinc-700 group-hover:bg-zinc-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
										className="h-4 w-4"
									>
										<path d="M12 3v12" />
										<path d="M7 8l5-5 5 5" />
										<path d="M5 21h14" />
									</svg>
								}
							/>

							<AppNavLink
								title="Buscar Endereços"
								description="Localizar endereços e lugares"
								onClick={() => setSidebarView("searchAddress")}
								iconWrapperClassName="bg-orange-50 text-orange-600 group-hover:bg-orange-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
										/>
									</svg>
								}
							/>

							<AppNavLink
								title="Localizar Coordenada"
								description="Ir para coordenada (WGS84 / TM-POA)"
								onClick={() => setSidebarView("coordinateLocator")}
								iconWrapperClassName="bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
										/>
									</svg>
								}
							/>

							<AppNavLink
								title="Mapas Base"
								description="Alterar mapa de fundo"
								onClick={() => setSidebarView("basemaps")}
								iconWrapperClassName="bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
										className="h-4 w-4"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
										/>
									</svg>
								}
							/>

							<AppNavLink
								title="Imprimir mapa"
								description="Selecionar área para impressão"
								onClick={() => setSidebarView("print")}
								iconWrapperClassName="bg-zinc-50 text-zinc-700 group-hover:bg-zinc-100"
								icon={
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
										className="h-4 w-4"
									>
										<path d="M6 9V2h12v7" />
										<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
										<path d="M6 14h12v8H6z" />
									</svg>
								}
							/>
						</div>
					)}

					{sidebarView === "basemaps" && <BasemapsPanel activeBasemap={activeBasemap} onBasemapChange={onBasemapChange} />}

					{sidebarView === "upload" && (
						<UploadLayerPanel apiBaseUrl={apiBaseUrl} onUploaded={(resp) => onUploadedLayer(resp)} />
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
							{!loading && !error && (
								<LayerTree
									tree={layerTreeView}
									visibility={visibility}
									onToggleRoot={onToggleRoot}
									onToggleGroup={onToggleGroup}
									onToggleLayer={onToggleLayer}
									onOpenFeatureTable={onOpenFeatureTable}
								/>
							)}

							{!geoserverBaseUrl && (
								<div className="p-4">
									<Alert>
										<AlertTitle>Aviso</AlertTitle>
										<AlertDescription>
											VITE_GEOSERVER_BASE_URL não configurado. A tree aparece, mas as camadas não serão renderizadas no mapa.
										</AlertDescription>
									</Alert>
								</div>
							)}
						</>
					)}

					{sidebarView === "legends" && (
						<LegendsPanel
							tree={tree}
							visibility={visibility}
							geoserverBaseUrl={geoserverBaseUrl}
							onToggleLayer={onToggleLayer}
							onToggleLabel={onToggleLabel}
							onToggleRoot={onToggleRoot}
							onToggleGroup={onToggleGroup}
						/>
					)}

					{sidebarView === "search" && (
						<SearchPanel
							apiBaseUrl={apiBaseUrl}
							geoserverBaseUrl={geoserverBaseUrl}
							tree={tree}
							loading={loading}
							error={error}
							onShowResults={onShowSearchResults}
						/>
					)}

					{sidebarView === "searchAddress" && (
						<SearchAddressPanel onLocationSelect={(candidate) => onAddressLocationSelect(candidate.location)} />
					)}

					{sidebarView === "coordinateLocator" && (
						<CoordinateLocatorPanel onLocationSelect={(location) => onCoordinateLocationSelect(location)} />
					)}

					{sidebarView === "print" && (
						<div className="p-4 space-y-4">
							<div className="space-y-2">
								<Label htmlFor="printTitle" className="text-sm text-zinc-700">
									Título do Mapa
								</Label>
								<Input id="printTitle" value={printTitle} onChange={(e) => onPrintTitleChange(e.target.value)} />
							</div>

							<div className="space-y-2">
								<Label htmlFor="printDpi" className="text-sm text-zinc-700">
									Resolução (DPI)
								</Label>
								<Select
									id="printDpi"
									value={String(printDpi)}
									onChange={(e) => onPrintDpiChange(Number(e.target.value) as any)}
								>
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
									<Button
										type="button"
										variant={printOrientation === "portrait" ? "default" : "outline"}
										className="flex-1"
										onClick={() => onPrintOrientationChange("portrait")}
									>
										Retrato
									</Button>
									<Button
										type="button"
										variant={printOrientation === "landscape" ? "default" : "outline"}
										className="flex-1"
										onClick={() => onPrintOrientationChange("landscape")}
									>
										Paisagem
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="printPaper" className="text-sm text-zinc-700">
									Tamanho do Papel
								</Label>
								<Select id="printPaper" value={printPaper} onChange={(e) => onPrintPaperChange(e.target.value as any)}>
									<option value="A4">A4 (210 x 297 mm)</option>
									<option value="A3">A3 (297 x 420 mm)</option>
									<option value="Letter">Letter (8.5 x 11 in)</option>
									<option value="Legal">Legal (8.5 x 14 in)</option>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<Checkbox
									checked={printIncludeLegends}
									onChange={(e) => onPrintIncludeLegendsChange((e.target as HTMLInputElement).checked)}
									id="printIncludeLegends"
								/>
								<Label htmlFor="printIncludeLegends" className="text-sm text-zinc-700">
									Incluir legendas visíveis no PDF
								</Label>
							</div>

							<Button className="w-full" onClick={onStartPrintMode}>
								Imprimir
							</Button>
						</div>
					)}
					</div>
				</MantineAppShell.Section>

				<MantineAppShell.Section>
					<div className="border-t border-zinc-200 bg-[#FFE016] backdrop-blur px-5 py-4 min-h-[56px]">
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-2 ml-auto">
								<a href="https://prefeitura.poa.br" target="_blank" rel="noopener noreferrer">
									<img
										src="/brasao_prefeitura.png"
										alt="Prefeitura de Porto Alegre"
										className="h-[32px] md:h-[32px] w-auto object-contain"
										draggable={false}
										loading="lazy"
									/>
								</a>

								<a href="https://prefeitura.poa.br/procempa" target="_blank" rel="noopener noreferrer">
									<img
										src="https://www.procempa.com.br/img/desenvolvimento_procempa.svg"
										alt="Desenvolvido pela Procempa"
										className="h-[14px] md:h-[16px] w-auto filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
										draggable={false}
										loading="lazy"
									/>
								</a>
							</div>
						</div>
					</div>
				</MantineAppShell.Section>

				{sidebarOpen && (
					<ActionIcon
						variant="default"
						size="input-xs"
						radius="md"
						visibleFrom="sm"
						onClick={onToggleSidebarOpen}
						title="Esconder menu"
						style={{
							position: "absolute",
							top: "50%",
							right: -29,
							transform: "translateY(-50%)",
							zIndex: 10,
							borderTopLeftRadius: 0,
							borderBottomLeftRadius: 0,
							width: 15,
						}}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 0 20 20" fill="currentColor" width="23" height="25">
							<path
								fillRule="evenodd"
								d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
								clipRule="evenodd"
							/>
						</svg>
					</ActionIcon>
				)}
			</Box>
		</MantineAppShell.Navbar>
	)
}
