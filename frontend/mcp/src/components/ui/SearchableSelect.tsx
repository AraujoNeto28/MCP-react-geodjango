import React from "react"

import { Select as MantineSelect, type SelectProps as MantineSelectProps } from "@mantine/core"

export type SearchableSelectProps = Omit<MantineSelectProps, "onChange"> & {
	onChange?: (value: string | null) => void
}

const SearchableSelect = React.forwardRef<HTMLInputElement, SearchableSelectProps>(({ onChange, styles, ...props }, ref) => {
	const wrapOptionStyles = {
		option: {
			whiteSpace: "normal",
			overflowWrap: "anywhere",
			wordBreak: "break-word",
			overflow: "visible",
			textOverflow: "clip",
			height: "auto",
			lineHeight: 1.25,
			alignItems: "flex-start",
			paddingTop: 8,
			paddingBottom: 8,
		} as React.CSSProperties,
	} as const

	const mergedStyles =
		typeof styles === "function"
			? (theme: any, props2: any, ctx: any) => {
				const user = styles(theme, props2, ctx) ?? {}
				return {
					...wrapOptionStyles,
					...user,
					option: {
						...(wrapOptionStyles as any).option,
						...(user as any).option,
					},
				}
			}
			: {
				...wrapOptionStyles,
				...(styles as any),
				option: {
					...(wrapOptionStyles as any).option,
					...((styles as any)?.option ?? {}),
				},
			}

	return <MantineSelect ref={ref} onChange={onChange} styles={mergedStyles as any} {...props} />
})

SearchableSelect.displayName = "SearchableSelect"

export { SearchableSelect }
