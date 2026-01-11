import { useEffect, useMemo, useRef, useState } from "react"

import { fetchGeoServerLayerAttributes, fetchGeoServerLayerFieldSuggestions } from "../geoserver/api"
import type { LayerDto, RootGroupDto } from "../layers/types"
import GeoJSON from "ol/format/GeoJSON"
import { readGeoJsonFeaturesRobust } from "../../map/geojsonUtils"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { SearchableSelect } from "../../components/ui/SearchableSelect"
import { Label } from "../../components/ui/Label"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/Alert"
import { cn } from "../../lib/utils"

import { Autocomplete, Menu } from "@mantine/core"

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
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
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

  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

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
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Buscar</h2>
        <p className="text-sm text-zinc-500">Selecione uma camada queryable e preencha os campos.</p>
      </div>

      {props.loading && <div className="text-sm text-zinc-600">Carregando camadas…</div>}
      {props.error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>Falha ao carregar: {props.error}</AlertDescription>
        </Alert>
      )}

      {!props.loading && !props.error && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Selecione a Camada</Label>
            <SearchableSelect
				data={queryableLayers.map((l) => ({ value: l.id, label: l.title }))}
				value={selectedLayerId || null}
				onChange={(v) => {
					setSelectedLayerId(v ?? "")
					setOpenOperatorFor(null)
				}}
				placeholder="-- Selecione --"
				searchable
				clearable
				nothingFoundMessage="Nenhuma camada"
			/>
            {!queryableLayers.length && (
              <p className="text-xs text-zinc-500">Nenhuma camada marcada como queryable.</p>
            )}
          </div>

          {selectedLayer && (
            <div className="space-y-4">
              <div className="border-b border-zinc-200 pb-2">
                <h3 className="text-sm font-semibold text-zinc-900">Campos de Pesquisa</h3>
              </div>

              {fieldsLoading && <div className="text-sm text-zinc-600">Carregando campos…</div>}
              {fieldsError && (
                <Alert variant="destructive">
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{fieldsError}</AlertDescription>
                </Alert>
              )}

              {!fieldsLoading && !fieldsError && fields.length > 0 && (
                <div className="space-y-4">
                  {fields.map((f) => {
                    const op = operators[f.name] ?? (f.typeGroup === "date" ? "on" : f.typeGroup === "number" ? "eq" : "contains")
                    const showNull = isNullishOperator(op)
                    const showBetween = isBetweenOperator(op)
                    const suggestions = suggestionsByField[f.name] ?? []

                    return (
                      <div key={f.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>
                            {f.label} <span className="text-zinc-400 font-normal">({typeLabel(f.typeGroup)})</span>
                          </Label>
                          <span className="text-xs text-zinc-500">
                            {operatorsFor(f.typeGroup).find((x) => x.value === op)?.label ?? op}
                          </span>
                        </div>

                        <div className="relative flex items-stretch gap-2">
                          {!showNull && !showBetween && (
                            <div className="flex-1">
                              <Autocomplete
                                placeholder={`Digite ${f.label.toLowerCase()}…`}
                                value={values[f.name] ?? ""}
                                data={suggestions}
                                limit={10}
                                comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                                onChange={(v) => {
                                  setValues((s) => ({ ...s, [f.name]: v }))
                                  requestSuggestions(f.name, v)
                                }}
                              />
                            </div>
                          )}

                          {!showNull && showBetween && (
                            <div className="flex w-full gap-2">
                              <Autocomplete
                                className="w-1/2"
                                placeholder="De…"
                                value={values[f.name] ?? ""}
                                data={suggestions}
                                limit={10}
                                comboboxProps={{ withinPortal: true, zIndex: 3000 }}
                                onChange={(v) => {
                                  setValues((s) => ({ ...s, [f.name]: v }))
                                  requestSuggestions(f.name, v)
                                }}
                              />
                              <Input
                                className="w-1/2"
                                placeholder="Até…"
                                value={values2[f.name] ?? ""}
                                onChange={(e) => setValues2((s) => ({ ...s, [f.name]: e.target.value }))}
                              />
                            </div>
                          )}

                          {showNull && (
                            <div className="flex h-10 w-full items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500">
                              (sem valor)
                            </div>
                          )}

                          <Menu
                            opened={openOperatorFor === f.name}
                            onChange={(opened) => setOpenOperatorFor(opened ? f.name : null)}
                            position="bottom-end"
                            withinPortal
                            zIndex={4000}
                            shadow="md"
                            width={240}
                          >
                            <Menu.Target>
                              <span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="shrink-0"
                                  w={32}
                                  h={32}
                                  p={0}
                                  miw={32}
                                  title="Operador"
                                  onClick={() => setOpenOperatorFor((cur) => (cur === f.name ? null : f.name))}
                                >
                                  {gearIcon("h-4 w-4")}
                                </Button>
                              </span>
                            </Menu.Target>

                            <Menu.Dropdown p={0}>
                              <div className="max-h-64 overflow-auto py-1">
                                {operatorsFor(f.typeGroup).map((o) => (
                                  <button
                                    key={o.value}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50",
                                      op === o.value ? "bg-zinc-50 font-medium text-zinc-900" : "text-zinc-700"
                                    )}
                                    onClick={() => {
                                      setOperators((s) => ({ ...s, [f.name]: o.value }))
                                      setOpenOperatorFor(null)
                                    }}
                                  >
                                    <span>{o.label}</span>
                                  </button>
                                ))}
                              </div>
                            </Menu.Dropdown>
                          </Menu>
                        </div>
                      </div>
                    )
                  })}

                  <div className="flex gap-2 pt-4">
                    <Button
                      className="flex-1"
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
                    </Button>
                    <Button
                      variant="outline"
                      onClick={onClear}
                    >
                      Limpar
                    </Button>
                  </div>

                  {searchError && (
                    <Alert variant="destructive">
                      <AlertTitle>Erro</AlertTitle>
                      <AlertDescription>{searchError}</AlertDescription>
                    </Alert>
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
