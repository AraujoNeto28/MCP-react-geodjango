import React from "react"
import { Button as MantineButton, type ButtonProps as MantineButtonProps, type MantineColor } from "@mantine/core"

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
export type ButtonSize = "default" | "sm" | "lg" | "icon"

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<MantineButtonProps, "variant" | "size" | "color"> & {
    variant?: ButtonVariant
    size?: ButtonSize
    color?: MantineColor
  }

function mapVariant(variant: ButtonVariant): { variant: MantineButtonProps["variant"]; color?: MantineColor } {
  switch (variant) {
    case "destructive":
      return { variant: "filled", color: "red" }
    case "outline":
      return { variant: "outline" }
    case "secondary":
      return { variant: "light", color: "gray" }
    case "ghost":
      return { variant: "subtle", color: "gray" }
    case "link":
      return { variant: "subtle" }
    case "default":
    default:
      return { variant: "filled" }
  }
}

function mapSize(size: ButtonSize): MantineButtonProps["size"] {
  switch (size) {
    case "sm":
      return "xs"
    case "lg":
      return "md"
    case "icon":
      return "sm"
    case "default":
    default:
      return "sm"
  }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", color, radius, className, ...rest }, ref) => {
    const mappedVariant = mapVariant(variant)
    const mappedSize = mapSize(size)

    return (
      <MantineButton
        ref={ref}
        className={className}
        variant={mappedVariant.variant}
        size={mappedSize}
        color={color ?? mappedVariant.color}
        radius={radius ?? "md"}
        {...rest}
      />
    )
  }
)

Button.displayName = "Button"

export { Button }
