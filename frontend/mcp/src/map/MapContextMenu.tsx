type Props = {
	onIdentifyLocation: () => void
	onClose: () => void
}

export function MapContextMenu(props: Props) {
	return (
		<div className="w-56 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
			<button
				type="button"
				className="w-full px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100"
				onClick={() => {
					props.onIdentifyLocation()
				}}
			>
				Identificar localização
			</button>
			<button
				type="button"
				className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 active:bg-zinc-100"
				onClick={props.onClose}
			>
				Fechar
			</button>
		</div>
	)
}
