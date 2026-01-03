import { useEffect, useMemo, useState } from "react"

import { fetchLayersTree } from "./api"
import type { RootGroupDto } from "./types"

export function useLayersTree(apiBaseUrl: string) {
  const [data, setData] = useState<RootGroupDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchLayersTree(apiBaseUrl, ac.signal)
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        setError(typeof err?.message === "string" ? err.message : "Failed to load layers tree")
        setLoading(false)
      })

    return () => ac.abort()
  }, [apiBaseUrl])

  return useMemo(
    () => ({ data, error, loading }),
    [data, error, loading],
  )
}
