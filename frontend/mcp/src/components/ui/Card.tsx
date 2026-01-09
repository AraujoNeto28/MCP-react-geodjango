import React from "react"
import {
	Card as MantineCard,
	type CardProps as MantineCardProps,
	type CardSectionProps as MantineCardSectionProps,
} from "@mantine/core"

import { cn } from "../../lib/utils"

export type CardProps = React.HTMLAttributes<HTMLDivElement> & MantineCardProps

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, shadow, withBorder, radius, padding, ...props }, ref) => {
	const hasShadowClass = typeof className === "string" && /\bshadow(?:-|\b)/.test(className)
	const effectiveShadow = shadow ?? (hasShadowClass ? undefined : "sm")

	return (
		<MantineCard
			ref={ref}
			className={className}
			withBorder={withBorder ?? true}
			radius={radius ?? "md"}
			padding={padding ?? 0}
			shadow={effectiveShadow as any}
			{...(props as any)}
		/>
	)
})
Card.displayName = "Card"

type CardSectionExtraProps = {
	withBorder?: MantineCardSectionProps extends { withBorder?: infer T } ? T : boolean
	inheritPadding?: MantineCardSectionProps extends { inheritPadding?: infer T } ? T : boolean
}

export type CardSectionProps = React.HTMLAttributes<HTMLDivElement> & CardSectionExtraProps

const CardHeader = React.forwardRef<HTMLDivElement, CardSectionProps>(({ className, ...props }, ref) => (
	<MantineCard.Section
		ref={ref}
		className={cn("flex flex-col space-y-1.5 p-6", className)}
		{...(props as any)}
	/>
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
	({ className, ...props }, ref) => (
		<h3
			ref={ref}
			className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
			{...props}
		/>
	)
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
	({ className, ...props }, ref) => (
		<p ref={ref} className={cn("text-sm text-zinc-500", className)} {...props} />
	)
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, CardSectionProps>(({ className, ...props }, ref) => (
	<MantineCard.Section ref={ref} className={cn("p-6 pt-0", className)} {...(props as any)} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, CardSectionProps>(({ className, ...props }, ref) => (
	<MantineCard.Section ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...(props as any)} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
