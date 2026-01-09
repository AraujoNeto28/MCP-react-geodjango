import React from "react"
import { Input as MantineInput, type InputProps as MantineInputProps } from "@mantine/core"

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> &
	Omit<MantineInputProps, "component" | "children" | "onChange" | "value" | "defaultValue"> & {
		value?: string
		defaultValue?: string
		onChange?: React.ChangeEventHandler<HTMLSelectElement>
		children?: React.ReactNode
	}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ children, ...props }, ref) => {
	return (
		<MantineInput
			component="select"
			ref={ref as any}
			{...(props as any)}
		>
			{children}
		</MantineInput>
	)
})

Select.displayName = "Select"

export { Select }
