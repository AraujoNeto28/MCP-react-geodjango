import { useState } from "react"
import type { RootGroupDto } from "./types"
import type { LayerVisibilityState } from "../../map/olLayerFactory"
import { Checkbox } from "../../components/ui/Checkbox"
import { Button } from "../../components/ui/Button"
import { Label } from "../../components/ui/Label"
import { cn } from "../../lib/utils"

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
   <svg  className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M3 9H21M3 15H21M9 9L9 20M15 9L15 20M6.2 20H17.8C18.9201 20 19.4802 20 19.908 19.782C20.2843 19.5903 20.5903 19.2843 20.782 18.908C21 18.4802 21 17.9201 21 16.8V7.2C21 6.0799 21 5.51984 20.782 5.09202C20.5903 4.71569 20.2843 4.40973 19.908 4.21799C19.4802 4 18.9201 4 17.8 4H6.2C5.0799 4 4.51984 4 4.09202 4.21799C3.71569 4.40973 3.40973 4.71569 3.21799 5.09202C3 5.51984 3 6.07989 3 7.2V16.8C3 17.9201 3 18.4802 3.21799 18.908C3.40973 19.2843 3.71569 19.5903 4.09202 19.782C4.51984 20 5.07989 20 6.2 20Z" stroke="#000000" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>
  )
}

function FolderIcon(props: { className?: string; open?: boolean; colorClassName?: string }) {
  const color = props.colorClassName ?? "text-yellow-400"
  if (props.open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0}
        className={cn(color, props.className)}
        aria-hidden="true"
      >
        <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
      </svg>
    )
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0}
      className={cn(color, props.className)}
      aria-hidden="true"
    >
      <path d="M19.5 21a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-5.379a2.25 2.25 0 0 1-1.59-.659l-2.122-2.121a.75.75 0 0 0-.53-.22H4.5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h15Z" />
    </svg>
  )
}

function CheckboxRow(props: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  icon?: React.ReactNode
  onIconClick?: () => void
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 py-1", props.className)}>
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox
          id={`cb-${props.label}`}
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        {props.icon && (
          <div
            onClick={props.onIconClick}
            className={cn("shrink-0 flex items-center justify-center", props.onIconClick && "cursor-pointer hover:opacity-80")}
          >
            {props.icon}
          </div>
        )}
        <Label
          htmlFor={`cb-${props.label}`}
          className="text-sm font-normal text-zinc-700 cursor-pointer break-all leading-tight hover:text-blue-700"
        >
          {props.label}
        </Label>
      </div>
      {props.right ? <div className="shrink-0">{props.right}</div> : null}
    </div>
  )
}

export function LayerTree(props: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const isExpanded = (id: string) => expanded[id] ?? false
  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !isExpanded(id) }))

  const rootChecked = (rootId: string, fallback: boolean) => props.visibility.rootVisibleById[rootId] ?? fallback
  const groupChecked = (groupId: string, fallback: boolean) => props.visibility.groupVisibleById[groupId] ?? fallback
  const layerChecked = (layerId: string, fallback: boolean) => props.visibility.layerVisibleById[layerId] ?? fallback

  return (
    <div className="space-y-6 p-4">
      {props.tree
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((root) => {
          const rootExpanded = isExpanded(root.id)
          const isUploadsRoot = root.id === "userUploads"
          return (
            <div key={root.id} className="space-y-2">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <CheckboxRow
                  checked={rootChecked(root.id, root.visible)}
                  label={root.title}
                  onChange={(checked) => props.onToggleRoot(root.id, checked)}
                  className="font-medium"
                  icon={<FolderIcon open={rootExpanded} className="h-5 w-5" colorClassName={isUploadsRoot ? "text-green-600" : undefined} />}
                  onIconClick={() => toggleExpand(root.id)}
                />
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{root.serviceType}</span>
              </div>

              {rootExpanded && (
                <div className="space-y-1 pl-2 border-l-2 border-zinc-100 ml-2">
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-zinc-700 hover:text-zinc-900"
                              title="Tabela de atributos"
                              onClick={() => props.onOpenFeatureTable?.(layer.id)}
                            >
                              {tableIcon("h-3.5 w-3.5")}
                            </Button>
                          ) : null
                        }
                      />
                    ))}
                </div>
              )}

              {rootExpanded && root.thematicGroups
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((group) => {
                  const groupExpanded = isExpanded(group.id)
                  return (
                    <div key={group.id} className="space-y-1 pl-2 border-l-2 border-zinc-100 ml-2">
                      <CheckboxRow
                        checked={groupChecked(group.id, group.visible)}
                        label={group.title}
                        onChange={(checked) => props.onToggleGroup(group.id, checked)}
                        className="text-zinc-800 font-medium"
                        icon={<FolderIcon open={groupExpanded} className="h-5 w-5" />}
                        onIconClick={() => toggleExpand(group.id)}
                      />
                      {groupExpanded && (
                        <div className="space-y-1 pl-4 border-l border-zinc-100 ml-1.5">
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
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-zinc-700 hover:text-zinc-900"
                                      title="Tabela de atributos"
                                      onClick={() => props.onOpenFeatureTable?.(layer.id)}
                                    >
                                      {tableIcon("h-3.5 w-3.5")}
                                    </Button>
                                  ) : null
                                }
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
    </div>
  )
}
