import React from "react"
import { TextInput as MantineTextInput, type TextInputProps as MantineTextInputProps } from "@mantine/core"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
	Omit<MantineTextInputProps, "onChange"> & {
		onChange?: React.ChangeEventHandler<HTMLInputElement>
	}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
	return <MantineTextInput ref={ref} className={className} {...(props as any)} />
})

Input.displayName = "Input"

export { Input }
