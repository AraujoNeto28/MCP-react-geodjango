export type UploadLayerResponse = {
  name: string
  format: "csv" | "geojson" | "json" | "shp" | "gpkg" | string
  sourceCrs: string | null
  sourceEpsg?: string | null
  outputCrs: "EPSG:4326" | string
  featureCount: number
  bbox: [number, number, number, number] | null
  geojson: any
}
