import { useEffect, useMemo, useRef, useState } from "react"

import { fetchGeoServerLayerAttributes, fetchGeoServerLayerFieldSuggestions } from "../geoserver/api"
import type { LayerDto, RootGroupDto } from "../layers/types"
import GeoJSON from "ol/format/GeoJSON"
import { readGeoJsonFeaturesRobust } from "../../map/geojsonUtils"

type Props = {
  apiBaseUrl: string
  geoserverBaseUrl: string
  tree: RootGroupDto[]
  loading: boolean
  error: string | null
  onShowResults?: (layer: LayerDto, contextLabel: string, features: any[]) => void
}

type Operator = { label: string; value: string }

type FieldTypeGroup = "string" | "number" | "date"

type QueryField = {
  name: string
  label: string
  typeGroup: FieldTypeGroup
}

const STRING_OPERATORS: Operator[] = [
  { label: "Igual", value: "eq" },
  { label: "Diferente", value: "neq" },
  { label: "Contém", value: "contains" },
  { label: "Não contém", value: "not_contains" },
  { label: "Começa com", value: "starts_with" },
  { label: "Termina com", value: "ends_with" },
  { label: "Está em (lista)", value: "in" },
  { label: "É nulo", value: "is_null" },
  { label: "Não é nulo", value: "is_not_null" },
]

const NUMBER_OPERATORS: Operator[] = [
  { label: "Igual", value: "eq" },
  { label: "Diferente", value: "neq" },
  { label: "Maior que", value: "gt" },
  { label: "Maior/igual a", value: "gte" },
  { label: "Menor que", value: "lt" },
  { label: "Menor/igual a", value: "lte" },
  { label: "Entre", value: "between" },
  { label: "Contém", value: "contains" },
  { label: "Começa com", value: "starts_with" },
  { label: "Termina com", value: "ends_with" },
  { label: "Está em (lista)", value: "in" },
  { label: "É nulo", value: "is_null" },
  { label: "Não é nulo", value: "is_not_null" },
]

const DATE_OPERATORS: Operator[] = [
  { label: "Na data (=)", value: "on" },
  { label: "Antes de", value: "before" },
  { label: "Depois de", value: "after" },
  { label: "Entre", value: "between" },
  { label: "É nulo", value: "is_null" },
  { label: "Não é nulo", value: "is_not_null" },
]

function gearIcon(className?: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.2-2-3.4-2.3.6a7.6 7.6 0 0 0-1.7-1l-.3-2.3H10.8l-.3 2.3a7.6 7.6 0 0 0-1.7 1L6.5 9.4l-2 3.4L6.5 14a7.9 7.9 0 0 0 .1 1 7.9 7.9 0 0 0-.1 1l-2 1.2 2 3.4 2.3-.6a7.6 7.6 0 0 0 1.7 1l.3 2.3h4.4l.3-2.3a7.6 7.6 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2a7.9 7.9 0 0 0-.1-1Z" />
    </svg>
  )
}

function inferTypeGroup(rawType: unknown): FieldTypeGroup {
  const t = typeof rawType === "string" ? rawType.toLowerCase() : ""
  if (/(date|time|timestamp)/.test(t)) return "date"
  if (/(int|integer|long|double|float|decimal|number|short)/.test(t)) return "number"
  return "string"
}

function typeLabel(t: FieldTypeGroup): string {
  if (t === "number") return "Número"
  if (t === "date") return "Data"
  return "Texto"
}

function operatorsFor(t: FieldTypeGroup): Operator[] {
  if (t === "number") return NUMBER_OPERATORS
  if (t === "date") return DATE_OPERATORS
  return STRING_OPERATORS
}

function isNullishOperator(op: string) {
  return op === "is_null" || op === "is_not_null"
}

function isBetweenOperator(op: string) {
  return op === "between"
}

function escapeCqlString(v: string) {
  return v.replaceAll("'", "''")
}

function isNumericString(v: string) {
  const trimmed = v.trim()
  return trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed)
}

function buildCqlLiteral(typeGroup: FieldTypeGroup, raw: string) {
  const v = raw.trim()
  if (typeGroup === "number" && isNumericString(v)) return v
  return `'${escapeCqlString(v)}'`
}

function buildCql(fieldName: string, typeGroup: FieldTypeGroup, op: string, v1: string, v2?: string) {
  const lit1 = buildCqlLiteral(typeGroup, v1)
  const lit2 = v2 != null ? buildCqlLiteral(typeGroup, v2) : undefined

  switch (op) {
    case "eq":
      return `${fieldName} = ${lit1}`
    case "neq":
      return `${fieldName} <> ${lit1}`
    case "gt":
    case "after":
      return `${fieldName} > ${lit1}`
    case "gte":
      return `${fieldName} >= ${lit1}`
    case "lt":
    case "before":
      return `${fieldName} < ${lit1}`
    case "lte":
      return `${fieldName} <= ${lit1}`
    case "on":
      return `${fieldName} = ${lit1}`
    case "between":
      if (!lit2) return null
      return `${fieldName} BETWEEN ${lit1} AND ${lit2}`
    case "contains":
      return `${fieldName} ILIKE '%${escapeCqlString(v1.trim())}%'`
    case "not_contains":
      return `NOT (${fieldName} ILIKE '%${escapeCqlString(v1.trim())}%')`
    case "starts_with":
      return `${fieldName} ILIKE '${escapeCqlString(v1.trim())}%'`
    case "ends_with":
      return `${fieldName} ILIKE '%${escapeCqlString(v1.trim())}'`
    case "in": {
      const parts = v1
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
      if (!parts.length) return null
      const list = parts
        .map((p) => buildCqlLiteral(typeGroup, p))
        .join(", ")
      return `${fieldName} IN (${list})`
    }
    case "is_null":
      return `${fieldName} IS NULL`
    case "is_not_null":
      return `${fieldName} IS NOT NULL`
    default:
      return null
  }
}

function parseQueryableFields(value: unknown): Array<{ name: string; label?: string }> {
  if (!Array.isArray(value)) return []
  const out: Array<{ name: string; label?: string }> = []
  for (const item of value) {
    if (typeof item === "string") {
      out.push({ name: item })
      continue
    }
    if (item && typeof item === "object") {
      const anyItem = item as Record<string, unknown>
      const name = (typeof anyItem.name === "string" ? anyItem.name : undefined) ??
        (typeof anyItem.field === "string" ? anyItem.field : undefined)
      if (!name) continue
      const label = typeof anyItem.label === "string" ? anyItem.label : undefined
      out.push({ name, label })
    }
  }
  return out
}

function flattenLayers(tree: RootGroupDto[]): LayerDto[] {
  const out: LayerDto[] = []
  for (const root of tree) {
    for (const l of root.layers) out.push(l)
    for (const g of root.thematicGroups) for (const l of g.layers) out.push(l)
  }
  return out
}

export function SearchPanel(props: Props) {
  const allLayers = useMemo(() => flattenLayers(props.tree), [props.tree])

  const queryableLayers = useMemo(() => {
    return allLayers
      .filter((l) => {
        if (l.queryable) return true
        const q = parseQueryableFields(l.queryableFields)
        return q.length > 0
      })
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [allLayers])

  const [selectedLayerId, setSelectedLayerId] = useState<string>("")

  const selectedLayer = useMemo(
    () => queryableLayers.find((l) => l.id === selectedLayerId) ?? null,
    [queryableLayers, selectedLayerId],
  )

  const [fields, setFields] = useState<QueryField[]>([])
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [fieldsLoading, setFieldsLoading] = useState<boolean>(false)

  const [values, setValues] = useState<Record<string, string>>( {})
  const [values2, setValues2] = useState<Record<string, string>>( {})
  const [operators, setOperators] = useState<Record<string, string>>( {})

  const [suggestionsByField, setSuggestionsByField] = useState<Record<string, string[]>>({})
  const suggestTimersRef = useRef<Record<string, number>>({})
  const suggestControllersRef = useRef<Record<string, AbortController | null>>({})

  const [openOperatorFor, setOpenOperatorFor] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const onDocClick = (evt: MouseEvent) => {
      const el = popoverRef.current
      if (!el) return
      if (evt.target instanceof Node && !el.contains(evt.target)) {
        setOpenOperatorFor(null)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  useEffect(() => {
    if (!selectedLayer) {
      setFields([])
      setFieldsError(null)
      setFieldsLoading(false)
      setSuggestionsByField({})
      return
    }

    const q = parseQueryableFields(selectedLayer.queryableFields)
    if (!q.length) {
      setFields([])
      setFieldsError("Essa camada não possui queryableFields configurados.")
      return
    }

    const ac = new AbortController()
    setFieldsLoading(true)
    setFieldsError(null)

    fetchGeoServerLayerAttributes(props.apiBaseUrl, selectedLayer.workspace, selectedLayer.layerName, ac.signal)
      .then((resp) => {
        const byName: Record<string, unknown> = {}
        for (const a of resp.attributes ?? []) {
          if (a && typeof a.name === "string") byName[a.name] = a.type
        }

        const nextFields: QueryField[] = q.map((f) => {
          const tg = inferTypeGroup(byName[f.name])
          return {
            name: f.name,
            label: f.label ?? f.name,
            typeGroup: tg,
          }
        })

        setFields(nextFields)

        // init operator defaults (do not overwrite existing user edits)
        setOperators((s) => {
          const next = { ...s }
          for (const f of nextFields) {
            if (next[f.name]) continue
            next[f.name] = f.typeGroup === "date" ? "on" : f.typeGroup === "number" ? "eq" : "contains"
          }
          return next
        })
      })
      .catch((err) => {
        const msg = typeof err?.message === "string" ? err.message : "Falha ao carregar campos da camada"
        setFields([])
        setFieldsError(msg)
      })
      .finally(() => setFieldsLoading(false))

    return () => ac.abort()
  }, [props.apiBaseUrl, selectedLayer])

  useEffect(() => {
    // cleanup timers/controllers on unmount
    return () => {
      for (const k of Object.keys(suggestTimersRef.current)) {
        clearTimeout(suggestTimersRef.current[k])
      }
      for (const c of Object.values(suggestControllersRef.current)) {
        c?.abort()
      }
    }
  }, [])

  const onClear = () => {
    setValues({})
    setValues2({})
    setOperators({})
    setSuggestionsByField({})
    setOpenOperatorFor(null)
    setSearchError(null)
  }

  const requestSuggestions = (fieldName: string, q: string) => {
    if (!selectedLayer) return
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setSuggestionsByField((s) => ({ ...s, [fieldName]: [] }))
      return
    }

    // debounce per field
    const prevTimer = suggestTimersRef.current[fieldName]
    if (prevTimer) clearTimeout(prevTimer)

    suggestTimersRef.current[fieldName] = window.setTimeout(async () => {
      // abort previous request for this field
      const prev = suggestControllersRef.current[fieldName]
      if (prev) prev.abort()
      const ac = new AbortController()
      suggestControllersRef.current[fieldName] = ac

      try {
        const resp = await fetchGeoServerLayerFieldSuggestions(
          props.apiBaseUrl,
          selectedLayer.workspace,
          selectedLayer.layerName,
          fieldName,
          trimmed,
          10,
          ac.signal,
        )
        if (ac.signal.aborted) return
        setSuggestionsByField((s) => ({ ...s, [fieldName]: resp.suggestions ?? [] }))
      } catch (_e) {
        if (ac.signal.aborted) return
        setSuggestionsByField((s) => ({ ...s, [fieldName]: [] }))
      }
    }, 250)
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-zinc-900">Buscar</div>
        <div className="mt-1 text-xs text-zinc-500">Selecione uma camada queryable e preencha os campos.</div>
      </div>

      {props.loading && <div className="text-sm text-zinc-600">Carregando camadas…</div>}
      {props.error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Falha ao carregar: {props.error}</div>
      )}

      {!props.loading && !props.error && (
        <div className="space-y-4" ref={popoverRef}>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-700">Selecione a Camada</div>
            <select
              className="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={selectedLayerId}
              onChange={(e) => {
                setSelectedLayerId(e.target.value)
                setOpenOperatorFor(null)
              }}
            >
              <option value="">-- Selecione --</option>
              {queryableLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            {!queryableLayers.length && (
              <div className="text-xs text-zinc-500">Nenhuma camada marcada como queryable.</div>
            )}
          </div>

          {selectedLayer && (
            <div className="space-y-3">
              <div className="border-b border-zinc-200 pb-2 text-xs font-semibold text-zinc-700">Campos de Pesquisa</div>

              {fieldsLoading && <div className="text-sm text-zinc-600">Carregando campos…</div>}
              {fieldsError && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{fieldsError}</div>
              )}

              {!fieldsLoading && !fieldsError && fields.length > 0 && (
                <div className="space-y-3">
                  {fields.map((f) => {
                    const op = operators[f.name] ?? (f.typeGroup === "date" ? "on" : f.typeGroup === "number" ? "eq" : "contains")
                    const showNull = isNullishOperator(op)
                    const showBetween = isBetweenOperator(op)

                    const datalistId = `suggest-${selectedLayer.id}-${f.name}`
                    const suggestions = suggestionsByField[f.name] ?? []

                    return (
                      <div key={f.name} className="space-y-1">
                        <div className="text-xs text-zinc-700">
                          <span className="font-medium">{f.label}</span> <span className="text-zinc-400">({typeLabel(f.typeGroup)})</span>
                        </div>

                        <div className="relative flex items-stretch gap-2">
                          {!showNull && !showBetween && (
                            <>
                              <input
                              className="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                              placeholder={`Digite ${f.label.toLowerCase()}…`}
                              value={values[f.name] ?? ""}
                              list={datalistId}
                              onChange={(e) => {
                                const v = e.target.value
                                setValues((s) => ({ ...s, [f.name]: v }))
                                requestSuggestions(f.name, v)
                              }}
                            />
                              <datalist id={datalistId}>
                                {suggestions.map((sug) => (
                                  <option key={sug} value={sug} />
                                ))}
                              </datalist>
                            </>
                          )}

                          {!showNull && showBetween && (
                            <div className="flex w-full gap-2">
                              <input
                                className="w-1/2 rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                                placeholder="De…"
                                value={values[f.name] ?? ""}
                                list={datalistId}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setValues((s) => ({ ...s, [f.name]: v }))
                                  requestSuggestions(f.name, v)
                                }}
                              />
                              <input
                                className="w-1/2 rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                                placeholder="Até…"
                                value={values2[f.name] ?? ""}
                                onChange={(e) => setValues2((s) => ({ ...s, [f.name]: e.target.value }))}
                              />
                              <datalist id={datalistId}>
                                {suggestions.map((sug) => (
                                  <option key={sug} value={sug} />
                                ))}
                              </datalist>
                            </div>
                          )}

                          {showNull && (
                            <div className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                              (sem valor)
                            </div>
                          )}

                          <button
                            type="button"
                            className="shrink-0 rounded border border-zinc-200 bg-white px-2 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                            title="Operador"
                            onClick={() => setOpenOperatorFor((cur) => (cur === f.name ? null : f.name))}
                          >
                            {gearIcon("h-5 w-5")}
                          </button>

                          {openOperatorFor === f.name && (
                            <div className="absolute right-0 top-full z-10 mt-2 w-56 overflow-hidden rounded border border-zinc-200 bg-white shadow">
                              <div className="max-h-64 overflow-auto py-1">
                                {operatorsFor(f.typeGroup).map((o) => (
                                  <button
                                    key={o.value}
                                    type="button"
                                    className={
                                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 " +
                                      (op === o.value ? "text-zinc-900 font-medium" : "text-zinc-700")
                                    }
                                    onClick={() => {
                                      setOperators((s) => ({ ...s, [f.name]: o.value }))
                                      setOpenOperatorFor(null)
                                    }}
                                  >
                                    <span>{o.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-zinc-500">Operador: {operatorsFor(f.typeGroup).find((x) => x.value === op)?.label ?? op}</div>
                      </div>
                    )
                  })}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="flex-1 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                      onClick={() => {
                        if (!selectedLayer) return
                        if (selectedLayer.serviceType !== "WFS") {
                          setSearchError("A busca está disponível apenas para camadas WFS.")
                          return
                        }
                        if (!props.geoserverBaseUrl) {
                          setSearchError("GeoServer não configurado.")
                          return
                        }

                        const conditions: string[] = []
                        const labels: string[] = []

                        for (const f of fields) {
                          const op =
                            operators[f.name] ??
                            (f.typeGroup === "date" ? "on" : f.typeGroup === "number" ? "eq" : "contains")

                          const opLabel = operatorsFor(f.typeGroup).find((x) => x.value === op)?.label ?? op

                          if (isNullishOperator(op)) {
                            const c = buildCql(f.name, f.typeGroup, op, "")
                            if (c) {
                              conditions.push(c)
                              labels.push(`${f.label} ${opLabel}`)
                            }
                            continue
                          }

                          if (isBetweenOperator(op)) {
                            const v1 = (values[f.name] ?? "").trim()
                            const v2 = (values2[f.name] ?? "").trim()
                            if (!v1 || !v2) continue
                            const c = buildCql(f.name, f.typeGroup, op, v1, v2)
                            if (c) {
                              conditions.push(c)
                              labels.push(`${f.label} ${opLabel} '${v1}' e '${v2}'`)
                            }
                            continue
                          }

                          const v = (values[f.name] ?? "").trim()
                          if (!v) continue
                          const c = buildCql(f.name, f.typeGroup, op, v)
                          if (c) {
                            conditions.push(c)
                            labels.push(`${f.label} ${opLabel} '${v}'`)
                          }
                        }

                        const cql = conditions.length ? conditions.join(" AND ") : undefined
                        const label = labels.length ? labels.join(" | ") : "(sem filtros)"

                        const ac = new AbortController()
                        setSearchLoading(true)
                        setSearchError(null)

                        const base = props.geoserverBaseUrl.replace(/\/$/, "")
                        const urlBase = `${base}/wfs`
                        const typeNames = `${selectedLayer.workspace}:${selectedLayer.layerName}`

                        const requestCrs = (selectedLayer.nativeCrs || "").trim() || "EPSG:3857"

                        const params = new URLSearchParams({
                          service: "WFS",
                          version: "2.0.0",
                          request: "GetFeature",
                          typeNames,
                          outputFormat: "application/json",
                          srsName: requestCrs,
                        })
                        if (cql) params.set("cql_filter", cql)

                        const url = `${urlBase}?${params.toString()}`
                        const geojson = new GeoJSON()

                        fetch(url, { signal: ac.signal })
                          .then(async (resp) => {
                            const text = await resp.text()
                            if (!resp.ok) throw new Error(`WFS ${resp.status}`)
                            const { features: feats, dataProjection } = readGeoJsonFeaturesRobust(geojson, text, "EPSG:3857", requestCrs)
                            for (const f of feats) {
                              try {
                                f.set?.("_dataProjection", dataProjection)
                                f.set?.("_geometryProjection", "EPSG:3857")
                              } catch {
                                // ignore
                              }
                            }
                            props.onShowResults?.(selectedLayer, label, feats)
                          })
                          .catch((err) => {
                            if (ac.signal.aborted) return
                            const msg = typeof err?.message === "string" ? err.message : "Falha ao buscar feições"
                            setSearchError(msg)
                          })
                          .finally(() => {
                            if (!ac.signal.aborted) setSearchLoading(false)
                          })
                      }}
                      disabled={searchLoading}
                    >
                      {searchLoading ? "Pesquisando…" : "Pesquisar"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                      onClick={onClear}
                    >
                      Limpar
                    </button>
                  </div>

                  {searchError && (
                    <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchError}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
