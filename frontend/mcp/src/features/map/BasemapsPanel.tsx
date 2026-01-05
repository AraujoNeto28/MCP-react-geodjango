import { Checkbox } from "../../components/ui/Checkbox"
import { Label } from "../../components/ui/Label"
import { BASEMAPS, type BasemapId } from "./basemaps"

interface BasemapsPanelProps {
  activeBasemap: BasemapId
  onBasemapChange: (id: BasemapId) => void
}

export function BasemapsPanel({ activeBasemap, onBasemapChange }: BasemapsPanelProps) {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900">Mapas Base</h2>
      <div className="space-y-3">
        {BASEMAPS.map((basemap) => (
          <div
            key={basemap.id}
            className={`flex items-center space-x-3 rounded-lg border p-3 transition-colors ${
              activeBasemap === basemap.id ? "border-blue-200 bg-blue-50" : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <Checkbox
              id={`basemap-${basemap.id}`}
              checked={activeBasemap === basemap.id}
              onChange={() => onBasemapChange(basemap.id)}
            />
            <Label
              htmlFor={`basemap-${basemap.id}`}
              className="flex-1 cursor-pointer font-medium text-zinc-700"
            >
              {basemap.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}
