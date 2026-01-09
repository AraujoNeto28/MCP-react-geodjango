import React from "react"
import { Checkbox as MantineCheckbox, type CheckboxProps as MantineCheckboxProps } from "@mantine/core"

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> &
	Omit<MantineCheckboxProps, "checked" | "defaultChecked" | "onChange"> & {
		checked?: boolean
		defaultChecked?: boolean
		onChange?: React.ChangeEventHandler<HTMLInputElement>
	}

const Checkbox = React.forwardRef<HTMLDivElement, CheckboxProps>(({ className, ...props }, ref) => {
	return <MantineCheckbox ref={ref} className={className} {...(props as any)} />
})

Checkbox.displayName = "Checkbox"

export { Checkbox }
