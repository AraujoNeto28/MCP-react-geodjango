import { useMemo, useRef, useState } from "react"

import { Alert, Box, Button, Divider, Group, Modal, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core"
import { Dropzone } from "@mantine/dropzone"
import { uploadUserLayer, type UploadUserLayerError } from "./api"
import type { UploadLayerResponse } from "./types"

type Props = {
  apiBaseUrl: string
  onUploaded: (resp: UploadLayerResponse) => void
}

export function UploadLayerPanel(props: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState<string>("")
  const [gpkgLayer, setGpkgLayer] = useState<string>("")

  const dropzoneAccept = {
    "text/csv": [".csv"],
    "application/json": [".json"],
    "application/geo+json": [".geojson"],
    "application/geopackage+sqlite3": [".gpkg"],
    "application/octet-stream": [".shp", ".shx", ".dbf"],
    "text/plain": [".prj", ".cpg"],
  } as const

  const lastAutoNameRef = useRef<string>("")

  const suggestNameFromFiles = (picked: File[]) => {
    if (!picked.length) return ""

    const byExt = (ext: string) => picked.find((f) => f.name?.toLowerCase?.().endsWith?.(ext))
    const main = byExt(".shp") ?? byExt(".gpkg") ?? byExt(".geojson") ?? byExt(".json") ?? byExt(".csv") ?? picked[0]
    const base = (main?.name ?? "").replace(/\.[^.]+$/, "")
    return base
  }

  const [gpkgModalOpen, setGpkgModalOpen] = useState(false)
  const [gpkgLayerOptions, setGpkgLayerOptions] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const filesLabel = useMemo(() => {
    if (!files.length) return "Nenhum arquivo selecionado"
    if (files.length === 1) return files[0].name
    return `${files.length} arquivos selecionados`
  }, [files])

  const canSubmit = files.length > 0 && name.trim().length > 0 && !loading

  const isSingleGpkg = files.length === 1 && files[0]?.name?.toLowerCase?.().endsWith?.(".gpkg")

  const doUpload = async (opts?: { gpkgLayer?: string }) => {
    if (!name.trim()) {
      setError("Informe o nome da camada.")
      return
    }
    if (!files.length) return

    setLoading(true)
    try {
      const resp = await uploadUserLayer(
        props.apiBaseUrl,
        files,
        {
          name: name.trim(),
          gpkgLayer: opts?.gpkgLayer,
        },
      )

      props.onUploaded(resp)

      const epsgFromCrs = (() => {
        const v = resp.sourceCrs ?? ""
        const m = v.match(/EPSG\s*:\s*(\d+)/i)
        return m?.[1] ? `EPSG:${m[1]}` : null
      })()

      const epsgLine = resp.sourceEpsg ?? epsgFromCrs
      setSuccess(
        `Camada '${resp.name}' carregada (${resp.featureCount} feições).` + (epsgLine ? `\n${epsgLine}` : ""),
      )
    } catch (e: unknown) {
      const err = e as UploadUserLayerError
      if (err && err.kind === "needsGpkgLayer") {
        setGpkgLayerOptions(err.layers)
        setGpkgLayer("")
        setGpkgModalOpen(true)
        setError(null)
      } else if (err && err.kind === "http") {
        setError(err.message)
      } else {
        const msg = e instanceof Error ? e.message : "Falha no upload"
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box p="md">
      <Stack gap="md">
        <Alert>
          <Title order={6}>Upload de camada</Title>
          <Text size="xs" c="dimmed">
            Formatos: CSV, GeoJSON, Shapefile (.shp + .shx + .dbf + .prj) e GeoPackage (.gpkg). A aplicação tenta reconhecer
            geometria e projeção automaticamente a partir dos arquivos.
          </Text>
        </Alert>

        <Modal
          opened={gpkgModalOpen}
          onClose={() => setGpkgModalOpen(false)}
          title="Selecione a camada do GeoPackage"
          centered
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              O arquivo .gpkg contém múltiplas camadas. Selecione qual deseja importar.
            </Text>
            <Select
              data={gpkgLayerOptions}
              value={gpkgLayer}
              onChange={(v) => setGpkgLayer(v ?? "")}
              placeholder="Escolha uma camada"
              searchable
              nothingFoundMessage="Nenhuma camada"
            />
            <Button
              fullWidth
              disabled={!gpkgLayer}
              onClick={async () => {
                setGpkgModalOpen(false)
                await doUpload({ gpkgLayer })
              }}
            >
              Importar
            </Button>
          </Stack>
        </Modal>

        {error && (
          <Alert color="red" title="Falha">
            <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>
              {error}
            </Text>
          </Alert>
        )}

        {success && (
          <Alert color="green" title="Ok">
            <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>
              {success}
            </Text>
          </Alert>
        )}

        <Stack gap={6}>
          <Text size="sm" fw={600} c="dark">
            Arquivos
          </Text>

          <Dropzone
            multiple
            onDrop={(dropped) => {
              setError(null)
              setSuccess(null)

              const suggested = suggestNameFromFiles(dropped)
              setFiles(dropped)

              setName((prev) => {
                const prevTrim = prev.trim()
                const shouldAutoFill = !prevTrim || prevTrim === lastAutoNameRef.current
                lastAutoNameRef.current = suggested
                return shouldAutoFill ? suggested : prev
              })
            }}
            onReject={() => {
              setError("Arquivo inválido. Selecione CSV/GeoJSON/SHP+DBF/SHX/PRJ ou GPKG.")
            }}
            accept={dropzoneAccept}
          >
            <Group justify="space-between" wrap="nowrap" gap="md">
              <div>
                <Text fw={600} size="sm">
                  Arraste e solte ou clique para selecionar
                </Text>
                <Text size="xs" c="dimmed">
                  {filesLabel}
                </Text>
              </div>
              <Text size="xs" c="dimmed">
                CSV / GeoJSON / SHP / GPKG
              </Text>
            </Group>
          </Dropzone>

          {files.length > 1 && (
            <Paper withBorder p="xs">
              <Text size="xs" fw={600} mb={6}>
                Selecionados:
              </Text>
              <Stack gap={2}>
                {files.map((f) => (
                  <Text key={f.name} size="xs" c="dimmed" lineClamp={1}>
                    {f.name}
                  </Text>
                ))}
              </Stack>
            </Paper>
          )}

          <Text size="xs" c="dimmed">
            Para Shapefile, selecione os 4 arquivos obrigatórios juntos.
          </Text>
        </Stack>

        <Divider />

        <Stack gap="sm">
          <TextInput
            required
            label="Nome da camada"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Ex: Minha camada"
          />
        </Stack>

        <Button
          fullWidth
          loading={loading}
          disabled={!canSubmit}
          onClick={async () => {
            setError(null)
            setSuccess(null)
            await doUpload()
          }}
        >
          Enviar
        </Button>

        {isSingleGpkg && (
          <Text size="xs" c="dimmed">
            Dica: se o GeoPackage tiver mais de uma camada, você será solicitado a escolher.
          </Text>
        )}
      </Stack>
    </Box>
  )
}
