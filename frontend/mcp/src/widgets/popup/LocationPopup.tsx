import { Button } from "../../components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card"

type Props = {
	title?: string
	onClose: () => void
	streetLabel?: string
	streetValue?: string
	neighborhood?: string
	postcode?: string
	wgs84: { lat: number; lon: number }
	tmpoa: { e: number; n: number }
	googleMapsUrl?: string
}

function fmtFixed(n: number, digits: number) {
	if (!Number.isFinite(n)) return "-"
	return n.toFixed(digits)
}

export function LocationPopup(props: Props) {
	const title = props.title ?? "Identificação de Local"

	return (
		<div className="flex flex-col items-center">
			<Card className="w-[280px] max-w-[85vw] max-h-[40vh] flex flex-col shadow-lg border-zinc-200">
				<CardHeader className="p-3 pb-2 bg-zinc-50/80 border-b border-zinc-200">
					<div className="flex items-start justify-between gap-2">
						<CardTitle className="text-sm font-semibold leading-tight pr-1">{title}</CardTitle>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 -mr-1 -mt-1 text-zinc-500 hover:text-zinc-900"
							title="Fechar"
							onClick={props.onClose}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={2}
								stroke="currentColor"
								className="h-4 w-4"
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</Button>
					</div>
				</CardHeader>

				<CardContent className="min-h-0 flex-1 overflow-auto p-3 space-y-2 bg-white">
					<div className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1 text-sm">
						<div className="text-xs font-medium text-zinc-500">Rua</div>
						<div className="text-zinc-900">{props.streetValue ?? "-"}</div>

						<div className="text-xs font-medium text-zinc-500">Bairro</div>
						<div className="text-zinc-900">{props.neighborhood ?? "-"}</div>

						<div className="text-xs font-medium text-zinc-500">CEP</div>
						<div className="text-zinc-900">{props.postcode ?? "-"}</div>
					</div>

					<div className="mt-2 border-t border-zinc-100 pt-2 space-y-1">
						<div className="text-[11px] font-semibold text-zinc-500">WGS84</div>
						<div className="font-mono text-xs text-blue-700">
							{fmtFixed(props.wgs84.lat, 6)}, {fmtFixed(props.wgs84.lon, 6)}
						</div>
					</div>

					<div className="border-t border-zinc-100 pt-2 space-y-1">
						<div className="text-[11px] font-semibold text-zinc-500">TM-POA</div>
						<div className="font-mono text-xs text-green-700">
							{fmtFixed(props.tmpoa.e, 2)}, {fmtFixed(props.tmpoa.n, 2)}
						</div>
					</div>

					{props.googleMapsUrl ? (
						<div className="pt-2">
							<a href={props.googleMapsUrl} target="_blank" rel="noreferrer" className="block">
								<Button variant="outline" className="w-full">
									Abrir no Google Maps
								</Button>
							</a>
						</div>
					) : null}
				</CardContent>
			</Card>

			{/* Speech-bubble pointer */}
			<div className="pointer-events-none relative -mt-px">
				<div className="h-0 w-0 border-x-[12px] border-x-transparent border-t-[12px] border-t-zinc-200" />
				<div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 -translate-y-px border-x-[11px] border-x-transparent border-t-[11px] border-t-white" />
			</div>
		</div>
	)
}
