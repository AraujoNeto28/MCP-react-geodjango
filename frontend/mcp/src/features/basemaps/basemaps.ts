import BaseLayer from "ol/layer/Base"
import TileLayer from "ol/layer/Tile"
import OSM from "ol/source/OSM"
import XYZ from "ol/source/XYZ"

export type BasemapId = "osm" | "carto-positron" | "carto-dark" | "esri-imagery" | "esri-imagery-labels"

export interface BasemapDef {
  id: BasemapId
  label: string
  maxZoom?: number
  createLayers: () => BaseLayer[]
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: "osm",
    label: "OpenStreetMap",
    createLayers: () => [new TileLayer({ source: new OSM({ crossOrigin: "anonymous" }) })],
  },
  {
    id: "carto-positron",
    label: "Carto Positron",
    createLayers: () => [
      new TileLayer({
        source: new XYZ({
          url: "https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          crossOrigin: "anonymous",
          attributions:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }),
      }),
    ],
  },
  {
    id: "carto-dark",
    label: "Carto Dark Matter",
    createLayers: () => [
      new TileLayer({
        source: new XYZ({
          url: "https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          crossOrigin: "anonymous",
          attributions:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }),
      }),
    ],
  },
  {
    id: "esri-imagery",
    label: "Esri World Imagery",
    maxZoom: 19,
    createLayers: () => [
      new TileLayer({
        source: new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
          maxZoom: 19,
          attributions:
            "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        }),
      }),
    ],
  },
  {
    id: "esri-imagery-labels",
    label: "Esri Imagery + Labels",
    maxZoom: 19,
    createLayers: () => [
      new TileLayer({
        source: new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
          maxZoom: 19,
          attributions: "Tiles &copy; Esri",
        }),
      }),
      new TileLayer({
        source: new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
          maxZoom: 19,
          attributions: "Tiles &copy; Esri",
        }),
      }),
      new TileLayer({
        source: new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
          maxZoom: 19,
          attributions: "Tiles &copy; Esri",
        }),
      }),
    ],
  },
]
