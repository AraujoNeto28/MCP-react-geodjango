import type { PopupTemplate } from "../../features/layers/types"

export type PopupModel = {
  title: string
  rows: Array<{ label: string; value: string }>
}

export function buildPopupModel(template: unknown, properties: Record<string, unknown>): PopupModel | null {
  const tmpl = template as PopupTemplate | null

  if (!tmpl) {
    // Default: show all scalar properties
    const rows = Object.entries(properties)
      .filter(([k, v]) => k !== "geometry" && typeof v !== "object" && typeof v !== "function")
      .map(([k, v]) => ({ label: k, value: String(v) }))

    if (rows.length === 0) return null

    return {
      title: (properties["name"] as string) || (properties["id"] as string) || "Feature",
      rows,
    }
  }

  let title = "Detalhes"
  if (tmpl.title) {
    title = tmpl.title.replace(/\{(\w+)\}/g, (_, key) => String(properties[key] ?? ""))
  } else if (tmpl.titleField) {
    title = String(properties[tmpl.titleField] ?? "")
  }

  const rows = (tmpl.fields ?? []).map((f) => {
    // Handle both 'field' (from type definition) and 'name' (from backend/logs)
    const fieldName = f.field || (f as any).name
    return {
      label: f.label ?? fieldName,
      value: String(properties[fieldName] ?? ""),
    }
  })

  return { title, rows }
}
