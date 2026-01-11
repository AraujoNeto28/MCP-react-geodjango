import type { ReactNode } from "react"

import { cn } from "../../lib/utils"

type AppNavLinkProps = {
	title: string
	description: string
	onClick: () => void
	icon: ReactNode
	iconWrapperClassName: string
	className?: string
}

export function AppNavLink({ title, description, onClick, icon, iconWrapperClassName, className }: AppNavLinkProps) {
	return (
		<button
			onClick={onClick}
			className={cn(
				"group flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]",
				className,
			)}
		>
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
						iconWrapperClassName,
					)}
				>
					{icon}
				</div>
				<div>
					<div className="text-sm font-semibold leading-tight text-zinc-900">{title}</div>
					<div className="text-[11px] leading-tight text-zinc-500">{description}</div>
				</div>
			</div>

			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				strokeWidth={2}
				stroke="currentColor"
				className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors"
			>
				<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
			</svg>
		</button>
	)
}
