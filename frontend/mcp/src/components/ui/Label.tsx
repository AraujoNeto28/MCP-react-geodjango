import React from "react"
import { Input } from "@mantine/core"

import { cn } from "../../lib/utils"

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
	({ className, ...props }, ref) => (
		<Input.Label
			ref={ref as any}
			className={cn(
				"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
				className,
			)}
			{...(props as any)}
		/>
	),
)
Label.displayName = "Label"

export { Label }
