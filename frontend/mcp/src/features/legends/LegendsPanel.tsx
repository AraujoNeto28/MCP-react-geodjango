import type { RootGroupDto, LayerDto } from "../layers/types"
import type { LayerVisibilityState } from "../../map/olLayerFactory"
import { cn } from "../../lib/utils"

type Props = {
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
  onToggleLayer: (layerId: string, visible: boolean) => void
  onToggleLabel: (layerId: string, visible: boolean) => void
  onToggleRoot: (rootId: string, visible: boolean) => void
  onToggleGroup: (groupId: string, visible: boolean) => void
}

function EyeIcon({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded hover:bg-zinc-100",
        visible ? "text-zinc-700" : "text-zinc-400"
      )}
      title={visible ? "Ocultar" : "Mostrar"}
    >
      {visible ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
          <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
          <path
            fillRule="evenodd"
            d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
          <path
            fillRule="evenodd"
            d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-5.975.75.75 0 000-1.186 10.004 10.004 0 00-14.382-3.32l-1.673-1.673zM10 13a3 3 0 100-6 3 3 0 000 6zm-4-3a4 4 0 114 4 4 4 0 01-4-4z"
            clipRule="evenodd"
          />
          <path d="M9.847 15.153l-1.347-1.347A4.98 4.98 0 0010 14c.82 0 1.596-.198 2.285-.548l1.348 1.348A6.97 6.97 0 0110 15z" />
        </svg>
      )}
    </button>
  )
}

function LabelIcon({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded hover:bg-zinc-100",
        visible ? "text-zinc-700" : "text-zinc-400"
      )}
      title={visible ? "Ocultar rótulos" : "Mostrar rótulos"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
      >
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
        {!visible && <path d="M2 2l20 20" className="text-red-500" />}
      </svg>
    </button>
  )
}

function WfsLegend({ styleConfig }: { styleConfig: any }) {
  if (!styleConfig) return null

  const type = styleConfig.type
  const fillColor = styleConfig.fillColor || "rgba(255,255,255,0.4)"
  const strokeColor = styleConfig.strokeColor || "#000000"
  const strokeWidth = styleConfig.strokeWidth || 1
  const radius = styleConfig.radius || 6

  // Scale down by 40% (0.6x)
  const scale = 0.6
  const scaledRadius = radius * scale
  const scaledStroke = Math.max(1, strokeWidth * scale)

  if (type === "Point") {
    return (
      <div className="flex items-center justify-center w-4 h-4">
        <div
          style={{
            width: scaledRadius * 2,
            height: scaledRadius * 2,
            backgroundColor: fillColor,
            border: `${scaledStroke}px solid ${strokeColor}`,
            borderRadius: "50%",
          }}
        />
      </div>
    )
  }

  // Line or Polygon
  return (
    <div className="flex items-center justify-center w-4 h-4">
      <div
        style={{
          width: 10,
          height: 10,
          backgroundColor: fillColor,
          border: `${scaledStroke}px solid ${strokeColor}`,
        }}
      />
    </div>
  )
}

function WmsLegend({ geoserverBaseUrl, layer }: { geoserverBaseUrl: string; layer: LayerDto }) {
  // Request larger legend graphic
  const url = `${geoserverBaseUrl.replace(/\/$/, "")}/wms?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=20&HEIGHT=20&LAYER=${layer.workspace}:${layer.layerName}&LEGEND_OPTIONS=fontName:Arial;fontSize:11;fontAntiAliasing:true;dpi:96`

  return (
    <div className="py-1">
      <img src={url} alt={layer.title} className="max-w-full" />
    </div>
  )
}

function LegendItem({
  layer,
  visibility,
  geoserverBaseUrl,
  onToggleLayer,
  onToggleLabel,
}: {
  layer: LayerDto
  visibility: LayerVisibilityState
  geoserverBaseUrl: string
  onToggleLayer: (id: string, v: boolean) => void
  onToggleLabel: (id: string, v: boolean) => void
}) {
  const isVisible = visibility.layerVisibleById[layer.id] ?? true
  const isLabelVisible = visibility.labelVisibleById[layer.id] ?? true

  return (
    <div className="rounded border border-zinc-200 bg-white p-2 shadow-sm">
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <span className="text-[11px] font-medium text-zinc-700 leading-tight break-words min-w-0">{layer.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          <LabelIcon visible={isLabelVisible} onClick={() => onToggleLabel(layer.id, !isLabelVisible)} />
          <EyeIcon visible={isVisible} onClick={() => onToggleLayer(layer.id, !isVisible)} />
        </div>
      </div>

      <div className={cn("pl-1", !isVisible && "opacity-50 grayscale")}>
        {layer.serviceType === "WFS" ? (
          <div className="flex items-start gap-1.5">
            <div className="shrink-0 mt-0.5">
              <WfsLegend styleConfig={layer.styleConfig} />
            </div>
            <span className="text-[10px] text-zinc-500 break-all leading-tight">{layer.title}</span>
          </div>
        ) : (
          <WmsLegend geoserverBaseUrl={geoserverBaseUrl} layer={layer} />
        )}
      </div>
    </div>
  )
}

export function LegendsPanel(props: Props) {
  return (
    <div className="space-y-4 p-3">
      {props.tree.map((root) => {
        const isRootVisible = props.visibility.rootVisibleById[root.id] ?? true

        return (
          <div key={root.id} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5 text-xs">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3.5 h-3.5 text-yellow-400"
                >
                  <path d="M19.5 21a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-5.379a2.25 2.25 0 0 1-1.59-.659l-2.122-2.121a.75.75 0 0 0-.53-.22H4.5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h15Z" />
                </svg>
                {root.title}
              </h3>
              <EyeIcon visible={isRootVisible} onClick={() => props.onToggleRoot(root.id, !isRootVisible)} />
            </div>

            <div className="space-y-3 pl-1">
              {/* Root Layers */}
              {root.layers.length > 0 && (
                <div className="space-y-2">
                  {root.layers.map((layer) => (
                    <LegendItem
                      key={layer.id}
                      layer={layer}
                      visibility={props.visibility}
                      geoserverBaseUrl={props.geoserverBaseUrl}
                      onToggleLayer={props.onToggleLayer}
                      onToggleLabel={props.onToggleLabel}
                    />
                  ))}
                </div>
              )}

              {/* Thematic Groups */}
              {root.thematicGroups.map((group) => {
                const isGroupVisible = props.visibility.groupVisibleById[group.id] ?? true

                return (
                  <div key={group.id} className="rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-zinc-800">{group.title}</span>
                      </div>
                      <EyeIcon visible={isGroupVisible} onClick={() => props.onToggleGroup(group.id, !isGroupVisible)} />
                    </div>

                    <div className="space-y-2">
                      {group.layers.map((layer) => (
                        <LegendItem
                          key={layer.id}
                          layer={layer}
                          visibility={props.visibility}
                          geoserverBaseUrl={props.geoserverBaseUrl}
                          onToggleLayer={props.onToggleLayer}
                          onToggleLabel={props.onToggleLabel}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
