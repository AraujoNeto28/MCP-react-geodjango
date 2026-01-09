import React from "react"

import {
  Alert as MantineAlert,
  type AlertProps as MantineAlertProps,
  type MantineColor,
} from "@mantine/core"

export type AlertVariant = "default" | "destructive"

type LocalAlertProps = Omit<MantineAlertProps, "variant" | "color" | "title" | "children"> & {
  variant?: AlertVariant
  color?: MantineColor
  title?: React.ReactNode
  children?: React.ReactNode
}

type AlertTitleProps = React.HTMLAttributes<HTMLSpanElement> & {
  children?: React.ReactNode
}

type AlertDescriptionProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
}

export function Alert(props: LocalAlertProps) {
  const { variant = "default", color, title, children, ...rest } = props

  let extractedTitle: React.ReactNode | undefined = title
  const body: React.ReactNode[] = []

  for (const child of React.Children.toArray(children)) {
    if (React.isValidElement(child) && child.type === AlertTitle) {
      const titleEl = child as React.ReactElement<AlertTitleProps>
      extractedTitle = (
        <span className={titleEl.props.className} style={titleEl.props.style}>
          {titleEl.props.children}
        </span>
      )
      continue
    }
    if (React.isValidElement(child) && child.type === AlertDescription) {
      const descEl = child as React.ReactElement<AlertDescriptionProps>
      body.push(
        <div className={descEl.props.className} style={descEl.props.style}>
          {descEl.props.children}
        </div>
      )
      continue
    }
    body.push(child)
  }

  const effectiveColor: MantineColor | undefined = color ?? (variant === "destructive" ? "red" : undefined)
  const effectiveBody = body.length > 0 ? body : children

  return (
    <MantineAlert {...rest} variant="light" color={effectiveColor} title={extractedTitle}>
      {effectiveBody}
    </MantineAlert>
  )
}

export function AlertTitle(props: AlertTitleProps) {
  const { children, ...rest } = props
  return (
    <span {...rest}>
      {children}
    </span>
  )
}

export function AlertDescription(props: AlertDescriptionProps) {
  const { children, ...rest } = props
  return (
    <div {...rest}>
      {children}
    </div>
  )
}
