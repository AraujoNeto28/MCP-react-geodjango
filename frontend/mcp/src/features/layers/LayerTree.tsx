import type { RootGroupDto } from "./types"
import type { LayerVisibilityState } from "../../map/olLayerFactory"

type Props = {
  tree: RootGroupDto[]
  visibility: LayerVisibilityState
  onToggleRoot: (rootId: string, visible: boolean) => void
  onToggleGroup: (groupId: string, visible: boolean) => void
  onToggleLayer: (layerId: string, visible: boolean) => void
  onOpenFeatureTable?: (layerId: string) => void
}

function tableIcon(className?: string) {
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
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  )
}

function CheckboxRow(props: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <label className="flex cursor-pointer items-start gap-2 select-none min-w-0">
        <input
          type="checkbox"
          className="h-4 w-4 mt-0.5 shrink-0"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span className="text-sm text-zinc-900 break-all">{props.label}</span>
      </label>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  )
}

export function LayerTree(props: Props) {
  const rootChecked = (rootId: string, fallback: boolean) => props.visibility.rootVisibleById[rootId] ?? fallback
  const groupChecked = (groupId: string, fallback: boolean) => props.visibility.groupVisibleById[groupId] ?? fallback
  const layerChecked = (layerId: string, fallback: boolean) => props.visibility.layerVisibleById[layerId] ?? fallback

  return (
    <div className="space-y-4">
      {props.tree
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((root) => (
          <div key={root.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <CheckboxRow
                checked={rootChecked(root.id, root.visible)}
                label={`${root.title} (${root.serviceType})`}
                onChange={(checked) => props.onToggleRoot(root.id, checked)}
              />
              <span className="text-xs text-zinc-500">{root.workspace}</span>
            </div>

            <div className="space-y-1 pl-4">
              {root.layers
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((layer) => (
                  <CheckboxRow
                    key={layer.id}
                    checked={layerChecked(layer.id, layer.visible)}
                    label={layer.title}
                    onChange={(checked) => props.onToggleLayer(layer.id, checked)}
                    right={
                      props.onOpenFeatureTable ? (
                        <button
                          type="button"
                          className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                          title="Tabela de atributos"
                          onClick={() => props.onOpenFeatureTable?.(layer.id)}
                        >
                          {tableIcon("h-4 w-4")}
                        </button>
                      ) : null
                    }
                  />
                ))}
            </div>

            {root.thematicGroups
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((group) => (
                <div key={group.id} className="space-y-1 pl-4">
                  <CheckboxRow
                    checked={groupChecked(group.id, group.visible)}
                    label={group.title}
                    onChange={(checked) => props.onToggleGroup(group.id, checked)}
                  />
                  <div className="space-y-1 pl-4">
                    {group.layers
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((layer) => (
                        <CheckboxRow
                          key={layer.id}
                          checked={layerChecked(layer.id, layer.visible)}
                          label={layer.title}
                          onChange={(checked) => props.onToggleLayer(layer.id, checked)}
                          right={
                            props.onOpenFeatureTable ? (
                              <button
                                type="button"
                                className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                title="Tabela de atributos"
                                onClick={() => props.onOpenFeatureTable?.(layer.id)}
                              >
                                {tableIcon("h-4 w-4")}
                              </button>
                            ) : null
                          }
                        />
                      ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
    </div>
  )
}
