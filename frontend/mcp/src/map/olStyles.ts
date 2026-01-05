import { Fill, Stroke, Style, Text, Circle as CircleStyle } from "ol/style"

type AnyObj = Record<string, unknown>

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

export function createOlStyle(styleConfig: unknown): Style | undefined {
  if (!styleConfig || typeof styleConfig !== "object") return undefined
  const cfg = styleConfig as AnyObj

  const strokeColor = asString(cfg.strokeColor) ?? "#000000"
  const strokeWidth = asNumber(cfg.strokeWidth) ?? 1
  const fillColor = asString(cfg.fillColor) ?? "rgba(255,255,255,0.4)"

  const labelCfg = (cfg.label && typeof cfg.label === "object" ? (cfg.label as AnyObj) : null) ?? null
  const labelField = labelCfg ? asString(labelCfg.field) : undefined

  const textStyle = labelField
    ? new Text({
        font: asString(labelCfg?.font) ?? "12px sans-serif",
        fill: new Fill({ color: asString(labelCfg?.color) ?? "#000000" }),
        stroke: new Stroke({ color: asString(labelCfg?.haloColor) ?? "#ffffff", width: asNumber(labelCfg?.haloWidth) ?? 2 }),
        offsetY: asNumber(labelCfg?.offsetY) ?? 0,
        placement: asString(labelCfg?.placement) as any,
      })
    : undefined

  if (cfg.type === "Point") {
    const radius = asNumber(cfg.radius) ?? 6
    return new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
      }),
      text: textStyle,
    })
  }

  return new Style({
    stroke: new Stroke({ color: strokeColor, width: strokeWidth }),
    fill: new Fill({ color: fillColor }),
    text: textStyle,
  })
}

export function createFeatureStyle(styleConfig: unknown, showLabels = true) {
  const base = createOlStyle(styleConfig)
  if (!base) return undefined

  return (feature: any) => {
    const cfg = styleConfig as AnyObj
    const labelCfg = (cfg.label && typeof cfg.label === "object" ? (cfg.label as AnyObj) : null) ?? null
    const labelField = labelCfg ? asString(labelCfg.field) : undefined

    if (labelField && base.getText()) {
      if (!showLabels) {
        base.getText()!.setText("")
      } else {
        const val = feature?.get?.(labelField)
        base.getText()!.setText(val == null ? "" : String(val))
      }
    }

    return base
  }
}
