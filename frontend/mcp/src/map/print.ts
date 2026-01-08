import type { RootGroupDto, LayerDto, ThematicGroupDto } from "../features/layers/types"
import type { LayerVisibilityState } from "./olLayerFactory"
import { jsPDF } from "jspdf"
import { get as getProjection, transform } from "ol/proj"
import { ensureProjectionsRegistered } from "./projections"

export type PrintOptions = {
  map: any
  selectionExtent: Extent
  selectionPoints?: { start: [number, number]; end: [number, number] }
  includeLegends: boolean
  title: string
  dpi: 72 | 96 | 150 | 300
  orientation: "portrait" | "landscape"
  paper: "A4" | "A3" | "Letter" | "Legal"
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
}

export type Extent = [number, number, number, number]

type VisibleLegendItem = {
  rootTitle: string
  groupTitle?: string
  layer: LayerDto
}

function normalizeExtent(ext: Extent): Extent {
  const minX = Math.min(ext[0], ext[2])
  const minY = Math.min(ext[1], ext[3])
  const maxX = Math.max(ext[0], ext[2])
  const maxY = Math.max(ext[1], ext[3])
  return [minX, minY, maxX, maxY]
}

function formatFixed(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "-"
  return n.toFixed(digits)
}

function chooseNiceDistanceMeters(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  const n = target / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return ""
  if (meters >= 1000) return `${formatFixed(meters / 1000, meters >= 10000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

function collectVisibleLegendItems(tree: RootGroupDto[], visibility: LayerVisibilityState): VisibleLegendItem[] {
  const items: VisibleLegendItem[] = []

  const layerVisible = (layer: LayerDto) => visibility.layerVisibleById[layer.id] ?? layer.visible ?? true
  const rootVisible = (root: RootGroupDto) => visibility.rootVisibleById[root.id] ?? root.visible ?? true
  const groupVisible = (group: ThematicGroupDto) => visibility.groupVisibleById[group.id] ?? group.visible ?? true

  for (const root of tree) {
    const rv = rootVisible(root)

    for (const layer of root.layers) {
      if (rv && layerVisible(layer)) items.push({ rootTitle: root.title, layer })
    }

    for (const group of root.thematicGroups) {
      const gv = rv && groupVisible(group)
      for (const layer of group.layers) {
        if (gv && layerVisible(layer)) items.push({ rootTitle: root.title, groupTitle: group.title, layer })
      }
    }
  }

  return items
}

function buildWmsLegendUrl(geoserverBaseUrl: string, layer: LayerDto, dpi: number): string {
  const base = geoserverBaseUrl.replace(/\/$/, "")
  const layerName = encodeURIComponent(`${layer.workspace}:${layer.layerName}`)
  return `${base}/wms?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=20&HEIGHT=20&LAYER=${layerName}&LEGEND_OPTIONS=fontName:Arial;fontSize:11;fontAntiAliasing:true;dpi:${dpi}`
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Falha ao ler imagem"))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const resp = await fetch(url, { mode: "cors" })
  if (!resp.ok) throw new Error(`Falha ao carregar legenda (${resp.status})`)
  const blob = await resp.blob()
  return await blobToDataUrl(blob)
}

async function getImageNaturalSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    img.onerror = () => reject(new Error("Falha ao carregar imagem"))
    img.src = dataUrl
  })
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(1, Math.max(0, v))
}

function parseColor(color: unknown): { r: number; g: number; b: number; a: number } | null {
  if (typeof color !== "string") return null
  const s = color.trim().toLowerCase()
  if (!s) return null

  if (s.startsWith("#")) {
    const hex = s.slice(1)
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b, a: 1 }
    }
    return null
  }

  const m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(",").map((p) => p.trim())
    const r = Number(parts[0])
    const g = Number(parts[1])
    const b = Number(parts[2])
    const a = parts.length >= 4 ? clamp01(Number(parts[3])) : 1
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a }
    }
  }

  return null
}

function pdfFormat(paper: PrintOptions["paper"]): "a4" | "a3" | "letter" | "legal" {
  if (paper === "A3") return "a3"
  if (paper === "Letter") return "letter"
  if (paper === "Legal") return "legal"
  return "a4"
}

function pdfOrientation(orientation: PrintOptions["orientation"]): "p" | "l" {
  return orientation === "portrait" ? "p" : "l"
}

function flattenOlLayers(layerOrGroup: any): any[] {
  if (!layerOrGroup) return []

  // LayerGroup
  if (typeof layerOrGroup.getLayers === "function") {
    const arr = layerOrGroup.getLayers().getArray?.() ?? []
    const out: any[] = []
    for (const l of arr) out.push(...flattenOlLayers(l))
    return out
  }

  return [layerOrGroup]
}

function findOlLayerById(map: any, id: string): any | null {
  const roots = map?.getLayers?.()?.getArray?.() ?? []
  for (const root of roots) {
    for (const l of flattenOlLayers(root)) {
      if ((l as any)?.get?.("id") === id) return l
    }
  }
  return null
}

async function wmsHasContentInSelection(
  opts: PrintOptions,
  layer: LayerDto,
  selectionExtent: Extent,
): Promise<boolean | null> {
  // Best-effort only: if the server doesn't support CORS / JSON, we return null.
  const base = (opts.geoserverBaseUrl || "").trim()
  if (!base) return null

  const bbox = normalizeExtent(selectionExtent)
  const url = base.replace(/\/$/, "") + "/wms"
  const layerName = `${layer.workspace}:${layer.layerName}`

  const width = 256
  const height = 256
  const samplePixels: Array<[number, number]> = [
    [128, 128],
    [64, 64],
    [192, 64],
    [64, 192],
    [192, 192],
  ]

  const timeoutMs = 1200
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (const [x, y] of samplePixels) {
      const qs = new URLSearchParams({
        SERVICE: "WMS",
        VERSION: "1.1.1",
        REQUEST: "GetFeatureInfo",
        LAYERS: layerName,
        QUERY_LAYERS: layerName,
        STYLES: "",
        BBOX: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`,
        SRS: "EPSG:3857",
        WIDTH: String(width),
        HEIGHT: String(height),
        X: String(x),
        Y: String(y),
        FEATURE_COUNT: "1",
        INFO_FORMAT: "application/json",
      })

      const resp = await fetch(`${url}?${qs.toString()}`, { mode: "cors", signal: controller.signal })
      if (!resp.ok) continue
      const ct = (resp.headers.get("content-type") || "").toLowerCase()

      if (ct.includes("application/json") || ct.includes("application/vnd.geo+json")) {
        const data: any = await resp.json().catch(() => null)
        const features = Array.isArray(data?.features) ? data.features : null
        if (features && features.length > 0) return true
        continue
      }

      // Fallback: treat non-empty response (that isn't a service exception) as having content.
      const text = (await resp.text().catch(() => "")).trim()
      if (!text) continue
      if (/ServiceException/i.test(text)) continue
      if (/\bFeatureCollection\b|\bfeatures\b|\bfid\b/i.test(text)) return true
    }

    return false
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

async function filterLegendItemsBySelection(opts: PrintOptions, items: VisibleLegendItem[]): Promise<VisibleLegendItem[]> {
  const ext = normalizeExtent(opts.selectionExtent)
  const zoom = opts.map?.getView?.()?.getZoom?.()

  const out: VisibleLegendItem[] = []
  for (const it of items) {
    const olLayer = findOlLayerById(opts.map, it.layer.id)

    // If we can't locate the layer, keep it (fail-open).
    if (!olLayer) {
      out.push(it)
      continue
    }

    // Honor minZoom/maxZoom when present.
    if (typeof zoom === "number") {
      const minZoom = typeof olLayer.getMinZoom === "function" ? olLayer.getMinZoom() : undefined
      const maxZoom = typeof olLayer.getMaxZoom === "function" ? olLayer.getMaxZoom() : undefined
      if (typeof minZoom === "number" && zoom < minZoom) continue
      if (typeof maxZoom === "number" && zoom > maxZoom) continue
    }

    if (it.layer.serviceType === "WFS") {
      try {
        const source = olLayer.getSource?.()
        if (source?.getFeaturesInExtent) {
          const feats = source.getFeaturesInExtent(ext)
          if (!Array.isArray(feats) || feats.length === 0) continue
        }
      } catch {
        // ignore and keep
      }
      out.push(it)
      continue
    }

    if (it.layer.serviceType === "WMS") {
      const has = await wmsHasContentInSelection(opts, it.layer, ext)
      if (has === false) continue
      out.push(it)
      continue
    }

    out.push(it)
  }

  return out
}

async function buildPdf(opts: PrintOptions, mapDataUrl: string): Promise<Blob> {
  ensureProjectionsRegistered()

  const doc = new jsPDF({
    orientation: pdfOrientation(opts.orientation),
    unit: "mm",
    format: pdfFormat(opts.paper),
    compress: true,
  })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 8

  const headerY = margin
  const contentY = margin + 7
  const contentH = pageH - margin - contentY

  // Reserve a footer area under the map for scale bar + coordinates.
  const mapFooterGap = 2
  const mapFooterH = 24

  const includeLegends = Boolean(opts.includeLegends)
  const legendGap = includeLegends ? 4 : 0
  // Give legends more usable width (so 2 columns can work) without starving the map.
  const legendW = includeLegends ? Math.min(90, Math.max(65, pageW * 0.34)) : 0
  const mapW = pageW - margin * 2 - legendW - legendGap
  const mapH = Math.max(10, contentH - mapFooterGap - mapFooterH)
  const mapX = margin
  const mapY = contentY

  const now = new Date()
  const dateStr = now.toLocaleString()

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(opts.title || "Mapa", margin, headerY + 4.5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.text(dateStr, pageW - margin, headerY + 4.5, { align: "right" })

  // Add map image, preserving aspect ratio inside (mapW x mapH)
  const { width: imgWpx, height: imgHpx } = await getImageNaturalSize(mapDataUrl)
  const imgAspect = imgWpx > 0 && imgHpx > 0 ? imgWpx / imgHpx : 1
  const boxAspect = mapW / mapH

  let drawW = mapW
  let drawH = mapH
  if (imgAspect > boxAspect) {
    drawW = mapW
    drawH = mapW / imgAspect
  } else {
    drawH = mapH
    drawW = mapH * imgAspect
  }
  const drawX = mapX + (mapW - drawW) / 2
  const drawY = mapY + (mapH - drawH) / 2

  doc.addImage(mapDataUrl, "PNG", drawX, drawY, drawW, drawH, undefined, "FAST")

  // Footer under the map (first page): scale bar + coordinates
  {
    const footerX0 = mapX
    const footerY0 = mapY + mapH + mapFooterGap
    const footerW = mapW

    doc.setDrawColor(180)
    doc.setLineWidth(0.2)
    doc.line(footerX0, footerY0, footerX0 + footerW, footerY0)

    const view = opts.map?.getView?.()
    const projCode = (view?.getProjection?.()?.getCode?.() as string) || "EPSG:3857"
    const ext = normalizeExtent(opts.selectionExtent)

    const corners: Record<"SW" | "SE" | "NW" | "NE", [number, number]> = {
      SW: [ext[0], ext[1]],
      SE: [ext[2], ext[1]],
      NW: [ext[0], ext[3]],
      NE: [ext[2], ext[3]],
    }

    // Selection start/end: prefer the real drag points when available.
    const startXY = opts.selectionPoints?.start ?? ([ext[0], ext[1]] as [number, number])
    const endXY = opts.selectionPoints?.end ?? ([ext[2], ext[3]] as [number, number])

    // Scale bar based on selection width in map units mapped to drawn width.
    const proj = getProjection(projCode)
    const metersPerUnit = typeof proj?.getMetersPerUnit === "function" ? proj.getMetersPerUnit() : 1
    const selWidthMeters = Math.abs(ext[2] - ext[0]) * (Number.isFinite(metersPerUnit as any) ? (metersPerUnit as any as number) : 1)
    const metersPerMm = drawW > 0 ? selWidthMeters / drawW : 0
    const desiredBarMm = 42
    const desiredMeters = metersPerMm > 0 ? metersPerMm * desiredBarMm : 0
    const barMeters = chooseNiceDistanceMeters(desiredMeters)
    const barMm = metersPerMm > 0 ? Math.max(10, Math.min(60, barMeters / metersPerMm)) : 0

    const barX = footerX0
    const barY = footerY0 + 6
    if (barMm > 0) {
      doc.setDrawColor(30)
      doc.setLineWidth(0.6)
      doc.line(barX, barY, barX + barMm, barY)
      doc.setLineWidth(0.4)
      doc.line(barX, barY - 1.2, barX, barY + 1.2)
      doc.line(barX + barMm, barY - 1.2, barX + barMm, barY + 1.2)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      doc.text(formatDistance(barMeters), barX + barMm / 2, barY - 1.8, { align: "center" })
    }

    const coordsX = footerX0 + Math.max(0, barMm) + 6
    const coordsMaxW = footerX0 + footerW - coordsX

    const safeTransform = (coord: [number, number], to: string): [number, number] | null => {
      try {
        const out = transform(coord as any, projCode, to) as any
        if (Array.isArray(out) && out.length >= 2) return [Number(out[0]), Number(out[1])]
        return null
      } catch {
        return null
      }
    }

    const startWgs84 = safeTransform(startXY, "EPSG:4326")
    const endWgs84 = safeTransform(endXY, "EPSG:4326")
    const startTmPoa = safeTransform(startXY, "EPSG:10665")
    const endTmPoa = safeTransform(endXY, "EPSG:10665")

    const cornersWgs84 = {
      SW: safeTransform(corners.SW, "EPSG:4326"),
      SE: safeTransform(corners.SE, "EPSG:4326"),
      NW: safeTransform(corners.NW, "EPSG:4326"),
      NE: safeTransform(corners.NE, "EPSG:4326"),
    }

    const cornersTmPoa = {
      SW: safeTransform(corners.SW, "EPSG:10665"),
      SE: safeTransform(corners.SE, "EPSG:10665"),
      NW: safeTransform(corners.NW, "EPSG:10665"),
      NE: safeTransform(corners.NE, "EPSG:10665"),
    }

    doc.setFont("helvetica", "normal")
    doc.setFontSize(5.8)

    const wgsLine =
      startWgs84 && endWgs84
        ? `WGS84  Xini=${formatFixed(startWgs84[0], 6)}  Yini=${formatFixed(startWgs84[1], 6)}   Xfim=${formatFixed(endWgs84[0], 6)}  Yfim=${formatFixed(endWgs84[1], 6)}`
        : "WGS84  (não disponível)"

    const wgsCornersLine1 =
      cornersWgs84.SW && cornersWgs84.SE
        ? `WGS84 cantos  SW X=${formatFixed(cornersWgs84.SW[0], 6)} Y=${formatFixed(cornersWgs84.SW[1], 6)}  |  SE X=${formatFixed(cornersWgs84.SE[0], 6)} Y=${formatFixed(cornersWgs84.SE[1], 6)}`
        : "WGS84 cantos  (não disponível)"

    const wgsCornersLine2 =
      cornersWgs84.NW && cornersWgs84.NE
        ? `WGS84 cantos  NW X=${formatFixed(cornersWgs84.NW[0], 6)} Y=${formatFixed(cornersWgs84.NW[1], 6)}  |  NE X=${formatFixed(cornersWgs84.NE[0], 6)} Y=${formatFixed(cornersWgs84.NE[1], 6)}`
        : ""

    const tmLine =
      startTmPoa && endTmPoa
        ? `TM-POA  Eini=${formatFixed(startTmPoa[0], 2)}  Nini=${formatFixed(startTmPoa[1], 2)}   Efim=${formatFixed(endTmPoa[0], 2)}  Nfim=${formatFixed(endTmPoa[1], 2)}`
        : "TM-POA  (não disponível)"

    const tmCornersLine1 =
      cornersTmPoa.SW && cornersTmPoa.SE
        ? `TM-POA cantos  SW E=${formatFixed(cornersTmPoa.SW[0], 2)} N=${formatFixed(cornersTmPoa.SW[1], 2)}  |  SE E=${formatFixed(cornersTmPoa.SE[0], 2)} N=${formatFixed(cornersTmPoa.SE[1], 2)}`
        : "TM-POA cantos  (não disponível)"

    const tmCornersLine2 =
      cornersTmPoa.NW && cornersTmPoa.NE
        ? `TM-POA cantos  NW E=${formatFixed(cornersTmPoa.NW[0], 2)} N=${formatFixed(cornersTmPoa.NW[1], 2)}  |  NE E=${formatFixed(cornersTmPoa.NE[0], 2)} N=${formatFixed(cornersTmPoa.NE[1], 2)}`
        : ""

    const lineH = 3.0
    let ty = footerY0 + 4.6

    const drawBlock = (t: string) => {
      if (!t) return
      const lines = doc.splitTextToSize(t, coordsMaxW) as any
      doc.text(lines, coordsX, ty)
      const count = Array.isArray(lines) ? lines.length : 1
      ty += count * lineH
    }

    drawBlock(wgsLine)
    drawBlock(wgsCornersLine1)
    drawBlock(wgsCornersLine2)
    drawBlock(tmLine)
    drawBlock(tmCornersLine1)
    drawBlock(tmCornersLine2)
  }

  if (!includeLegends) {
    return doc.output("blob")
  }

  const legendX0 = margin + mapW + legendGap
  const bottom = pageH - margin

  // 2-column legend layout (when width allows it) to reduce extra pages.
  const colGap = 4
  let legendPage = 0 // 0 = first page (right-side panel), >=1 = continuation pages
  let colCount = includeLegends ? (legendW >= 78 ? 2 : 1) : 0
  let colW = colCount > 0 ? (legendW - colGap * (colCount - 1)) / colCount : 0
  let col = 0
  let x = legendX0
  let y = contentY
  let baseX = legendX0
  let colStartY = contentY

  const setLegendFont = () => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.8)
  }

  const setLegendTitleFont = () => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.2)
  }

  const setRootFont = () => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.8)
  }

  const setGroupFont = () => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.2)
  }

  const startLegendArea = (pageLabel: string, fullWidth: boolean) => {
    const headerH = 6
    setLegendTitleFont()

    if (fullWidth) {
      legendPage = Math.max(legendPage, 1)
      baseX = margin
      colStartY = margin + headerH
      y = margin
      doc.text(pageLabel, baseX, y + 4)
      y = colStartY

      colCount = 2
      col = 0
      colW = (pageW - margin * 2 - colGap) / 2
      x = baseX
      return
    }

    // First page: legend panel sits on the right, aligned with map content (not the page header)
    baseX = legendX0
    y = contentY
    doc.text(pageLabel, baseX, y + 4)
    colStartY = contentY + headerH
    y = colStartY

    colCount = legendW >= 78 ? 2 : 1
    col = 0
    colW = colCount > 0 ? (legendW - colGap * (colCount - 1)) / colCount : legendW
    x = baseX
  }

  const nextLegendColumn = (): boolean => {
    if (col + 1 < colCount) {
      col += 1
      x = baseX + col * (colW + colGap)
      y = colStartY
      return true
    }
    return false
  }

  const nextLegendPage = () => {
    doc.addPage()
    legendPage += 1
    // On continuation pages, use full page width with 2 columns to pack legends.
    startLegendArea("Legendas (cont.)", true)
  }

  const ensureLegendSpace = (needMm: number) => {
    if (y + needMm <= bottom) return
    if (nextLegendColumn()) return
    nextLegendPage()
  }

  const wrapLines = (text: string, maxWidth: number): string[] => {
    const t = (text ?? "").toString()
    // jsPDF returns string[]; fallback to single line for safety
    const lines = doc.splitTextToSize(t, maxWidth) as unknown as string[]
    return Array.isArray(lines) && lines.length ? lines : [t]
  }

  const drawWrapped = (text: string, lineH: number) => {
    const lines = wrapLines(text, colW)
    // baseline adjustment keeps spacing consistent across fonts
    doc.text(lines as any, x, y + lineH * 0.9)
    y += lines.length * lineH
  }

  // First page legend header at right panel
  legendPage = 0
  startLegendArea("Legendas", false)

  const itemsAll = collectVisibleLegendItems(opts.tree, opts.visibility)
  const items = await filterLegendItemsBySelection(opts, itemsAll)
  if (items.length === 0) {
    setLegendFont()
    const lh = 3.2
    ensureLegendSpace(lh)
    drawWrapped("Sem camadas visíveis para legenda.", lh)
    return doc.output("blob")
  }

  let lastRoot: string | null = null
  let lastGroup: string | null = null

  for (const it of items) {
    if (it.rootTitle !== lastRoot) {
      setRootFont()
      const lh = 3.6
      const lines = wrapLines(it.rootTitle, colW)
      ensureLegendSpace(lines.length * lh + 1)
      drawWrapped(it.rootTitle, lh)
      y += 0.6
      lastRoot = it.rootTitle
      lastGroup = null
    }

    if (it.groupTitle && it.groupTitle !== lastGroup) {
      setGroupFont()
      const lh = 3.3
      const lines = wrapLines(it.groupTitle, colW)
      ensureLegendSpace(lines.length * lh + 0.8)
      drawWrapped(it.groupTitle, lh)
      y += 0.4
      lastGroup = it.groupTitle
    }

    // Layer title (smaller)
    setLegendFont()
    {
      const lh = 3.0
      const lines = wrapLines(it.layer.title, colW)
      ensureLegendSpace(lines.length * lh + 1)
      drawWrapped(it.layer.title, lh)
    }
    y += 0.6

    if (it.layer.serviceType === "WMS") {
      const url = buildWmsLegendUrl(opts.geoserverBaseUrl, it.layer, opts.dpi)
      try {
        const legendDataUrl = await fetchImageAsDataUrl(url)
        const { width, height } = await getImageNaturalSize(legendDataUrl)
        const targetH = 5
        const aspect = width > 0 && height > 0 ? width / height : 3
        const targetW = Math.min(colW, targetH * aspect)
        ensureLegendSpace(targetH + 3)
        doc.addImage(legendDataUrl, "PNG", x, y, targetW, targetH, undefined, "FAST")
        y += targetH + 3
      } catch {
        setLegendFont()
        const lh = 3.0
        ensureLegendSpace(lh + 1)
        drawWrapped("(Legenda indisponível)", lh)
        y += 0.6
      }
      continue
    }

    // WFS swatch: compact
    const styleConfig: any = (it.layer as any).styleConfig
    const type = styleConfig?.type
    const fill = parseColor(styleConfig?.fillColor) ?? { r: 255, g: 255, b: 255, a: 1 }
    const stroke = parseColor(styleConfig?.strokeColor) ?? { r: 0, g: 0, b: 0, a: 1 }
    const strokeWidth = Number(styleConfig?.strokeWidth ?? 1)

    const sw = 3.5
    ensureLegendSpace(7)
    doc.setDrawColor(stroke.r, stroke.g, stroke.b)
    doc.setLineWidth(Math.max(0.15, Math.min(1.2, Number.isFinite(strokeWidth) ? strokeWidth * 0.18 : 0.18)))
    doc.setFillColor(fill.r, fill.g, fill.b)

    if (type === "Point") {
      doc.circle(x + sw / 2, y + sw / 2, sw / 2, "FD")
    } else {
      doc.rect(x, y, sw, sw, "FD")
    }
    y += sw + 3
  }

  return doc.output("blob")
}

async function waitForRenderComplete(map: any): Promise<void> {
  // Some OpenLayers builds/configurations may not reliably fire `rendercomplete`
  // after `renderSync()`. If this promise never resolves, the UI looks like
  // "nothing happens" and no error is shown.
  await new Promise<void>((resolve) => {
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      try {
        if (typeof map?.un === "function") {
          map.un("rendercomplete", finish)
          map.un("postrender", finish)
        }
      } catch {
        // ignore
      }
      if (timeoutId) window.clearTimeout(timeoutId)
      resolve()
    }

    // Hard timeout to avoid hanging forever.
    const timeoutId = window.setTimeout(finish, 1200)

    try {
      if (typeof map?.on === "function") {
        map.on("rendercomplete", finish)
        map.on("postrender", finish)
      } else if (typeof map?.once === "function") {
        map.once("rendercomplete", finish)
        map.once("postrender", finish)
      }
    } catch {
      // ignore
    }

    try {
      map.renderSync?.()
      map.render?.()
    } catch {
      // ignore
    }

    // Extra fallback: allow a couple frames for the renderer pipeline.
    requestAnimationFrame(() => requestAnimationFrame(finish))
  })
}

function compositeMapCanvases(map: any): HTMLCanvasElement {
  const size = map.getSize()
  if (!size) throw new Error("Mapa sem tamanho")

  const [width, height] = size
  const pixelRatio = window.devicePixelRatio || 1

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D indisponível")

  ctx.scale(pixelRatio, pixelRatio)

  const viewport = map.getViewport() as HTMLElement
  const canvases = viewport.querySelectorAll(".ol-layer canvas") as NodeListOf<HTMLCanvasElement>

  canvases.forEach((c: HTMLCanvasElement) => {
    if (c.width === 0 || c.height === 0) return

    const parent = c.parentElement as HTMLElement | null
    const opacity = parent ? Number(parent.style.opacity || "1") : 1
    ctx.globalAlpha = Number.isFinite(opacity) ? opacity : 1

    const transform = c.style.transform
    if (transform) {
      const m = transform.match(/^matrix\(([^)]+)\)$/)
      if (m) {
        const parts = m[1].split(",").map((p: string) => Number(p.trim()))
        if (parts.length === 6 && parts.every((n: number) => Number.isFinite(n))) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ctx.setTransform(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
          ctx.drawImage(c, 0, 0)
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          return
        }
      }
    }

    ctx.drawImage(c, 0, 0)
  })

  ctx.globalAlpha = 1
  return canvas
}

function cropToSelection(map: any, fullCanvas: HTMLCanvasElement, selectionExtent: Extent, outputScale: number): HTMLCanvasElement {
  const pixelRatio = window.devicePixelRatio || 1
  const ext = normalizeExtent(selectionExtent)

  const tl = map.getPixelFromCoordinate([ext[0], ext[3]])
  const br = map.getPixelFromCoordinate([ext[2], ext[1]])

  const x1 = Math.min(tl[0], br[0])
  const y1 = Math.min(tl[1], br[1])
  const x2 = Math.max(tl[0], br[0])
  const y2 = Math.max(tl[1], br[1])

  const sx = Math.max(0, Math.round(x1 * pixelRatio))
  const sy = Math.max(0, Math.round(y1 * pixelRatio))
  const sw = Math.min(fullCanvas.width - sx, Math.round((x2 - x1) * pixelRatio))
  const sh = Math.min(fullCanvas.height - sy, Math.round((y2 - y1) * pixelRatio))

  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(sw * outputScale))
  out.height = Math.max(1, Math.round(sh * outputScale))

  const ctx = out.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D indisponível")

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return out
}

export async function printMapSelection(opts: PrintOptions): Promise<void> {
  // Pre-open a blank window synchronously to avoid popup blockers.
  // If we only call `window.open()` after awaits, browsers may block it.
  const preOpenedWindow = window.open("", "_blank")

  const selectionLayer = opts.map
    .getLayers()
    .getArray()
    .find((l: unknown) => (l as any)?.get?.("id") === "printSelection") as any

  const wasVisible = selectionLayer ? Boolean(selectionLayer.getVisible?.()) : false

  try {
    if (selectionLayer) selectionLayer.setVisible(false)

    await waitForRenderComplete(opts.map)

    const full = compositeMapCanvases(opts.map)
    const outputScale = Math.max(0.5, opts.dpi / 96)
    const cropped = cropToSelection(opts.map, full, opts.selectionExtent, outputScale)

    let mapDataUrl: string
    try {
      mapDataUrl = cropped.toDataURL("image/png")
    } catch (e: unknown) {
      // Browser blocks exporting a canvas if ANY drawn image comes from an origin
      // that doesn't allow CORS, resulting in a "tainted" canvas.
      const err = e as any
      const name = typeof err?.name === "string" ? err.name : ""
      if (name === "SecurityError") {
        throw new Error(
          "Não foi possível imprimir: o mapa usa uma ou mais camadas/tiles sem CORS (canvas 'tainted'). " +
            "Troque o mapa base por um que suporte CORS ou habilite CORS no GeoServer/proxy para WMS/tiles."
        )
      }
      throw e
    }

    const pdfBlob = await buildPdf(opts, mapDataUrl)
    const url = URL.createObjectURL(pdfBlob)

    // Revoke after a while to avoid leaking memory.
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
    }, 60_000)

    if (preOpenedWindow) {
      try {
        // Replace the blank tab with the generated PDF.
        preOpenedWindow.location.href = url
        preOpenedWindow.focus?.()
        return
      } catch {
        // ignore and try same-tab fallback
      }
    }

    // If popups are blocked, fall back to navigating the current tab.
    // This is more reliable than a programmatic download click after `await`s.
    window.location.assign(url)
  } finally {
    if (selectionLayer) selectionLayer.setVisible(wasVisible)
    // Try to re-render after restoring selection
    try {
      opts.map.renderSync()
    } catch {
      // ignore
    }
  }
}
