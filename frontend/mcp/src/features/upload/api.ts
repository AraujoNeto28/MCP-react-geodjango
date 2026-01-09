import type { UploadLayerResponse } from "./types"

export type UploadLayerParams = {
  name?: string
  gpkgLayer?: string
}

export type UploadUserLayerNeedsGpkgLayerError = {
  kind: "needsGpkgLayer"
  message: string
  layers: string[]
}

export type UploadUserLayerHttpError = {
  kind: "http"
  status: number
  message: string
}

export type UploadUserLayerError = UploadUserLayerNeedsGpkgLayerError | UploadUserLayerHttpError

export async function uploadUserLayer(apiBaseUrl: string, files: File[], params?: UploadLayerParams, signal?: AbortSignal) {
  const url = apiBaseUrl.replace(/\/$/, "") + "/layers/upload/"

  const form = new FormData()
  for (const f of files) form.append("files", f, f.name)

  if (params?.name) form.set("name", params.name)
  if (params?.gpkgLayer) form.set("gpkgLayer", params.gpkgLayer)

  const resp = await fetch(url, {
    method: "POST",
    body: form,
    signal,
  })

  if (!resp.ok) {
    // Try JSON first (backend may return layer selection options)
    try {
      const j = (await resp.json()) as any
      if (j?.needsLayerSelection && Array.isArray(j?.layers)) {
        const err: UploadUserLayerNeedsGpkgLayerError = {
          kind: "needsGpkgLayer",
          message: typeof j?.error === "string" ? j.error : "Selecione uma camada do GeoPackage",
          layers: j.layers.map((x: any) => String(x)),
        }
        throw err
      }

      const err: UploadUserLayerHttpError = {
        kind: "http",
        status: resp.status,
        message: typeof j?.error === "string" ? j.error : resp.statusText,
      }
      throw err
    } catch (e: any) {
      // If it is already our typed error, rethrow
      if (e?.kind === "needsGpkgLayer" || e?.kind === "http") throw e
      const text = await resp.text().catch(() => "")
      const err: UploadUserLayerHttpError = { kind: "http", status: resp.status, message: text || resp.statusText }
      throw err
    }
  }

  return (await resp.json()) as UploadLayerResponse
}
