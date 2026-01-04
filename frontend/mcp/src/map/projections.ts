import proj4 from "proj4"
import { get as getProjection } from "ol/proj"
import { register } from "ol/proj/proj4"

const EPSG_10665 = "EPSG:10665"

let registered = false

export function ensureProjectionsRegistered() {
  if (registered) return
  registered = true

  // EPSG:10665 — SIRGAS 2000 / Porto Alegre TM
  // Source: https://spatialreference.org/ref/epsg/10665/proj4.txt
  proj4.defs(
    EPSG_10665,
    "+proj=tmerc +lat_0=0 +lon_0=-51 +k=0.999995 +x_0=300000 +y_0=5000000 +ellps=GRS80 +units=m +no_defs +type=crs",
  )

  // EPSG:4674 — SIRGAS 2000 (Geographic)
  // Source: User provided
  proj4.defs(
    "EPSG:4674",
    "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
  )

  register(proj4)

  // Touch the projection so OL creates and caches it.
  getProjection(EPSG_10665)
  getProjection("EPSG:4674")
}
