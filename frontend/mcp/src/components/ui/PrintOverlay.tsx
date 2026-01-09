import type OlMap from "ol/Map"

import { Alert, AlertDescription } from "./Alert"
import { Button } from "./Button"

export type PrintOverlayProps = {
	open: boolean
	map: OlMap | null
	onCancel: () => void
	onConfirm: () => Promise<void> | void
}

export function PrintOverlay(props: PrintOverlayProps) {
	const { open, map, onCancel, onConfirm } = props
	if (!open) return null

	return (
		<div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
			<Alert className="w-[360px] max-w-[calc(100vw-2rem)] p-3 shadow-md border-zinc-200">
				<AlertDescription className="text-xs text-zinc-700">
					Desenhe um retângulo de seleção para imprimir ou clique em Imprimir para imprimir a tela inteira.
				</AlertDescription>
			</Alert>

			<div className="flex gap-2">
				<Button variant="outline" onClick={onCancel}>
					Cancelar
				</Button>
				<Button
					disabled={!map}
					onClick={async () => {
					try {
						await onConfirm()
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
	)
}
