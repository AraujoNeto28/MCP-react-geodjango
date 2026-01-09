export type ServiceType = "WFS" | "WMS" | "LOCAL"

export type GeometryType = "Point" | "LineString" | "Polygon"

export type RootGroupDto = {
  id: string
  title: string
  serviceType: ServiceType
  workspace: string
  visible: boolean
  order: number
  layers: LayerDto[]
  thematicGroups: ThematicGroupDto[]
}

export type ThematicGroupDto = {
  id: string
  rootGroupId: string
  title: string
  visible: boolean
  order: number
  layers: LayerDto[]
}

export type PopupTemplate = {
  title?: string
  titleField?: string
  fields?: Array<{
    field: string
    label?: string
  }>
}

export type LayerDto = {
  id: string
  rootGroupId: string
  thematicGroupId: string | null
  title: string
  layerName: string
  workspace: string
  serviceType: ServiceType
  nativeCrs?: string | null
  visible: boolean
  order: number
  geometryType: GeometryType
  minZoom: number | null
  queryable: boolean
  queryableFields: unknown
  tableFields: unknown
  filter: unknown
  popupTemplate: PopupTemplate | null
  styleConfig: unknown
}
