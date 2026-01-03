import type GeoJSON from "ol/format/GeoJSON"

import { ensureProjectionsRegistered } from "./projections"

function detectGeoJsonDataProjectionCode(json: any): string | null {
  const raw =
    (typeof json?.crs?.properties?.name === "string" ? json.crs.properties.name : null) ??
    (typeof json?.crs?.name === "string" ? json.crs.name : null) ??
    (typeof json?.srsName === "string" ? json.srsName : null)

  if (!raw) return null

  // Examples:
  // - "EPSG:10665"
  // - "urn:ogc:def:crs:EPSG::10665"
  // - "http://www.opengis.net/def/crs/EPSG/0/10665"
  const m = raw.match(/EPSG(?::|::)(\d+)/i) ?? raw.match(/epsg\/(\d+)/i)
  if (!m) return null
  return `EPSG:${m[1]}`
}

export function readGeoJsonFeaturesRobust(
  format: GeoJSON,
  text: string,
  featureProjection: string,
  defaultDataProjection?: string,
): { features: any[]; dataProjection: string } {
  ensureProjectionsRegistered()

  try {
    const json = JSON.parse(text)
    const dataProjection = detectGeoJsonDataProjectionCode(json) ?? defaultDataProjection ?? featureProjection
    const features = format.readFeatures(json, { dataProjection, featureProjection }) as any[]
    return { features, dataProjection }
  } catch {
    // Fallback if body isn't valid JSON for any reason.
    const dataProjection = defaultDataProjection ?? featureProjection
    const features = format.readFeatures(text, { dataProjection, featureProjection }) as any[]
    return { features, dataProjection }
  }
}
