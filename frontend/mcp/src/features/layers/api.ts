import { httpGetJson } from "../../lib/http"
import type { RootGroupDto } from "./types"

export async function fetchLayersTree(apiBaseUrl: string, signal?: AbortSignal) {
  const url = apiBaseUrl.replace(/\/$/, "") + "/layers/tree/"
  return httpGetJson<RootGroupDto[]>(url, { signal })
}
