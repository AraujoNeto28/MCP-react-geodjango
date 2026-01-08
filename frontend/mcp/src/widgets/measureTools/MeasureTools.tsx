import { useEffect, useRef, useState } from "react"
import Map from "ol/Map"
import { Vector as VectorSource } from "ol/source"
import { Vector as VectorLayer } from "ol/layer"
import { Draw, Snap } from "ol/interaction"
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from "ol/style"
import { getArea, getLength } from "ol/sphere"
import { LineString, Polygon, Circle } from "ol/geom"
import { cn } from "../../lib/utils"

type MeasureMode = "LineString" | "Polygon" | "Circle" | null

export function MeasureTools({ map, isOpen, onToggle }: { map: Map | null; isOpen: boolean; onToggle: () => void }) {
  const [activeMode, setActiveMode] = useState<MeasureMode>(null)
  const sourceRef = useRef<VectorSource | null>(null)
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const drawInteractionRef = useRef<Draw | null>(null)
  const snapInteractionRef = useRef<Snap | null>(null)

  // Reset active mode when closed
  useEffect(() => {
    if (!isOpen) {
      setActiveMode(null)
    }
  }, [isOpen])

  // Initialize layer
  useEffect(() => {
    if (!map) return

    const source = new VectorSource()

    const styleFunction = (feature: any) => {
      const geometry = feature.getGeometry()
      const type = geometry.getType()
      let label = ""

      if (type === "Circle") {
        const circle = geometry as Circle
        const radius = circle.getRadius()
        // Estimate radius in meters (approximate for web mercator)
        // For more precision we should project center and edge, but this is a visual estimation
        // Or use getLength of a line from center to edge
        // Let's use the sphere distance from center to a point on the edge
        const center = circle.getCenter()
        // Create a point on the edge
        const edgeCoordinate = [center[0] + radius, center[1]]
        const line = new LineString([center, edgeCoordinate])
        const length = getLength(line)

        if (length > 1000) {
          label = `R: ${(length / 1000).toFixed(2)} km`
        } else {
          label = `R: ${length.toFixed(2)} m`
        }
      } else if (type === "Polygon") {
        const poly = geometry as Polygon
        const area = getArea(poly)
        if (area > 1000000) {
          label = `${(area / 1000000).toFixed(2)} km²`
        } else {
          label = `${area.toFixed(2)} m²`
        }
      } else if (type === "LineString") {
        const line = geometry as LineString
        const length = getLength(line)
        if (length > 1000) {
          label = `${(length / 1000).toFixed(2)} km`
        } else {
          label = `${length.toFixed(2)} m`
        }
      }

      return new Style({
        fill: new Fill({
          color: "rgba(255, 255, 255, 0.2)",
        }),
        stroke: new Stroke({
          color: "#ffcc33", // Yellow
          width: 2,
        }),
        image: new CircleStyle({
          radius: 5,
          stroke: new Stroke({ color: "#ffcc33", width: 2 }),
          fill: new Fill({ color: "rgba(255, 255, 255, 0.2)" }),
        }),
        text: new Text({
          text: label,
          font: "12px sans-serif",
          fill: new Fill({ color: "#000" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
          overflow: true,
          offsetY: -10,
        }),
      })
    }

    const layer = new VectorLayer({
      source: source,
      style: styleFunction,
      zIndex: 1000,
    })
    layer.set("id", "measure-layer")

    map.addLayer(layer)
    sourceRef.current = source
    layerRef.current = layer

    return () => {
      map.removeLayer(layer)
      sourceRef.current = null
      layerRef.current = null
    }
  }, [map])

  // Handle interactions
  useEffect(() => {
    if (!map) return

    // Cleanup previous interactions
    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }
    if (snapInteractionRef.current) {
      map.removeInteraction(snapInteractionRef.current)
      snapInteractionRef.current = null
    }

    if (!activeMode) return

    const draw = new Draw({
      source: sourceRef.current!,
      type: activeMode,
    })

    map.addInteraction(draw)
    drawInteractionRef.current = draw

    // Add Snap interaction
    // We want to snap to all vector layers in the map
    // We can't easily pass all sources to Snap, but we can try to find the main overlay group
    // Or we can iterate over layers.
    // For simplicity, let's try to snap to the features currently in the map.
    // OpenLayers Snap can take a 'features' collection or a 'source'.
    // Since we have many sources (one per WFS layer), it's tricky.
    // However, we can add multiple Snap interactions or use a feature collection that we update?
    // A common approach is to snap to the vector layers that are visible.

    // Helper to traverse
    const traverse = (collection: any) => {
      collection.forEach((l: any) => {
        if (l.getLayers) {
          traverse(l.getLayers())
        } else {
          const s = l.getSource()
          // Check for vector source (has getFeatures)
          if (s && typeof s.getFeatures === "function" && l.getVisible()) {
            // Exclude our own layers
            if (l.get("id") !== "measure-layer" && l.get("id") !== "draw-layer") {
              // Add a snap interaction for this source
              const snap = new Snap({ source: s })
              map.addInteraction(snap)
              // We need to keep track of all snaps to remove them?
              // The ref only holds one. This is a problem if we want multiple sources.
              // Actually, we can't easily add multiple Snaps and track them with one ref.
              // But we can try to use the 'features' option of Snap and feed it all features?
              // No, that's heavy.

              // Alternative: Just pick the "overlays" group if we can find it?
              // Snap interaction only supports one source or one feature collection.
              // So we would need multiple Snap interactions.
            }
          }
        }
      })
    }

    // Since managing multiple Snap interactions is complex in this effect,
    // let's try a simpler approach: Snap to the features currently rendered?
    // OpenLayers doesn't support "snap to map".

    // Let's just add one Snap interaction for the most important source if possible,
    // OR, we can create a temporary FeatureCollection, populate it with features from all visible layers,
    // and pass that to Snap.

    // Let's try to find the "overlays" group and see if we can get sources.
    // If we have many layers, adding many Snap interactions is the way to go.
    // Let's store them in an array on the ref?

    // For this MVP, let's try to snap to the first few visible vector layers we find, or just add multiple interactions.
    // I'll change snapInteractionRef to hold an array of interactions.

    // Wait, I can't change the type of the ref easily without changing the definition above.
    // Let's just use a local array for cleanup.

    const snaps: Snap[] = []

    const addSnaps = (collection: any) => {
      collection.forEach((l: any) => {
        if (l.getLayers) {
          addSnaps(l.getLayers())
        } else {
          const s = l.getSource()
          if (s && typeof s.getFeatures === "function" && l.getVisible()) {
            if (l.get("id") !== "measure-layer" && l.get("id") !== "draw-layer") {
              const snap = new Snap({ source: s, pixelTolerance: 10 })
              map.addInteraction(snap)
              snaps.push(snap)
            }
          }
        }
      })
    }

    addSnaps(map.getLayers())

    // Also snap to self (to close polygons or connect lines)
    const selfSnap = new Snap({ source: sourceRef.current! })
    map.addInteraction(selfSnap)
    snaps.push(selfSnap)

    // Store cleanup function
    const cleanupSnaps = () => {
      snaps.forEach((s) => map.removeInteraction(s))
    }

    // We override the ref cleanup logic
    // We won't use snapInteractionRef for the array, just for the selfSnap maybe?
    // Actually, let's just use the cleanup function of useEffect.

    return () => {
      map.removeInteraction(draw)
      drawInteractionRef.current = null
      cleanupSnaps()
    }
  }, [map, activeMode])

  const clearMeasurements = () => {
    sourceRef.current?.clear()
  }

  const stopMeasuring = () => {
    setActiveMode(null)
  }

  if (!isOpen) {
    return (
      <div className="">
        <button
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-md hover:bg-zinc-50 border border-zinc-200 text-zinc-700"
          title="Ferramentas de Medição"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-5 h-5">
            <path d="M440.158,257.596l-358.4-256c-2.603-1.869-6.016-2.108-8.866-0.657c-2.842,1.468-4.625,4.395-4.625,7.595v358.4 c0,4.719,3.814,8.533,8.533,8.533h358.4c4.719,0,8.533-3.814,8.533-8.533v-102.4C443.733,261.777,442.402,259.192,440.158,257.596 z M426.667,358.4H85.333V25.114L426.667,268.92V358.4z" />
            <path d="M503.467,392.534H8.533c-4.719,0-8.533,3.814-8.533,8.533v102.4C0,508.186,3.815,512,8.533,512h494.933 c4.719,0,8.533-3.814,8.533-8.533v-102.4C512,396.348,508.186,392.534,503.467,392.534z M494.933,494.934H17.067V409.6h25.6 l-0.009,17.067c0,4.71,3.814,8.533,8.533,8.533c4.71,0,8.533-3.814,8.533-8.533l0.009-17.067h34.133v34.133 c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133v17.067c0,4.719,3.814,8.533,8.533,8.533 c4.719,0,8.533-3.814,8.533-8.533V409.6h34.133v34.133c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133 v17.067c0,4.719,3.814,8.533,8.533,8.533c4.719,0,8.533-3.814,8.533-8.533V409.6h34.133v34.133c0,4.719,3.814,8.533,8.533,8.533 s8.533-3.814,8.533-8.533V409.6h34.133v17.067c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133v34.133 c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.15l-0.009,17.067c0,4.71,3.814,8.533,8.533,8.533 c4.71,0,8.533-3.814,8.533-8.533l0.009-17.067h25.583V494.934z" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white rounded-md shadow-lg border border-zinc-200 w-12 overflow-hidden">
      <div
        className="flex items-center justify-center p-2 border-b border-zinc-100 cursor-pointer hover:bg-zinc-50"
        onClick={onToggle}
        title="Fechar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          fill="currentColor"
          className="w-5 h-5 text-zinc-700"
        >
          <path d="M440.158,257.596l-358.4-256c-2.603-1.869-6.016-2.108-8.866-0.657c-2.842,1.468-4.625,4.395-4.625,7.595v358.4 c0,4.719,3.814,8.533,8.533,8.533h358.4c4.719,0,8.533-3.814,8.533-8.533v-102.4C443.733,261.777,442.402,259.192,440.158,257.596 z M426.667,358.4H85.333V25.114L426.667,268.92V358.4z" />
          <path d="M503.467,392.534H8.533c-4.719,0-8.533,3.814-8.533,8.533v102.4C0,508.186,3.815,512,8.533,512h494.933 c4.719,0,8.533-3.814,8.533-8.533v-102.4C512,396.348,508.186,392.534,503.467,392.534z M494.933,494.934H17.067V409.6h25.6 l-0.009,17.067c0,4.71,3.814,8.533,8.533,8.533c4.71,0,8.533-3.814,8.533-8.533l0.009-17.067h34.133v34.133 c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133v17.067c0,4.719,3.814,8.533,8.533,8.533 c4.719,0,8.533-3.814,8.533-8.533V409.6h34.133v34.133c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133 v17.067c0,4.719,3.814,8.533,8.533,8.533c4.719,0,8.533-3.814,8.533-8.533V409.6h34.133v34.133c0,4.719,3.814,8.533,8.533,8.533 s8.533-3.814,8.533-8.533V409.6h34.133v17.067c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.133v34.133 c0,4.719,3.814,8.533,8.533,8.533s8.533-3.814,8.533-8.533V409.6h34.15l-0.009,17.067c0,4.71,3.814,8.533,8.533,8.533 c4.71,0,8.533-3.814,8.533-8.533l0.009-17.067h25.583V494.934z" />
        </svg>
      </div>

      <div className="py-1 flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Medir</span>
        <div className="w-8 h-px bg-zinc-200 my-1" />

        {/* Line */}
        <ToolButton active={activeMode === "LineString"} onClick={() => setActiveMode("LineString")} title="Distância">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <path d="M4 20L20 4" />
            <path d="M6 20l-2-2" />
            <path d="M18 4l2 2" />
          </svg>
        </ToolButton>

        {/* Circle (Radius) */}
        <ToolButton active={activeMode === "Circle"} onClick={() => setActiveMode("Circle")} title="Raio">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M12 12h8" />
          </svg>
        </ToolButton>

        {/* Polygon (Area) */}
        <ToolButton active={activeMode === "Polygon"} onClick={() => setActiveMode("Polygon")} title="Área">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <path d="M12 2l8 6v8l-8 6-8-6V8l8-6z" />
          </svg>
        </ToolButton>

        {/* Stop */}
        <div className="w-8 h-px bg-zinc-200 my-1" />
        <ToolButton active={false} onClick={stopMeasuring} title="Parar Medição">
          <div className="w-3 h-3 bg-zinc-700 rounded-sm" />
        </ToolButton>

        {/* Eraser */}
        <ToolButton
          active={false}
          onClick={clearMeasurements}
          title="Limpar Medições"
          className="text-red-600 hover:bg-red-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-4 h-4">
            <path
              d="M5.50506 11.4096L6.03539 11.9399L5.50506 11.4096ZM3 14.9522H2.25H3ZM9.04776 21V21.75V21ZM11.4096 5.50506L10.8792 4.97473L11.4096 5.50506ZM17.9646 12.0601L12.0601 17.9646L13.1208 19.0253L19.0253 13.1208L17.9646 12.0601ZM6.03539 11.9399L11.9399 6.03539L10.8792 4.97473L4.97473 10.8792L6.03539 11.9399ZM6.03539 17.9646C5.18538 17.1146 4.60235 16.5293 4.22253 16.0315C3.85592 15.551 3.75 15.2411 3.75 14.9522H2.25C2.25 15.701 2.56159 16.3274 3.03 16.9414C3.48521 17.538 4.1547 18.2052 4.97473 19.0253L6.03539 17.9646ZM4.97473 10.8792C4.1547 11.6993 3.48521 12.3665 3.03 12.9631C2.56159 13.577 2.25 14.2035 2.25 14.9522H3.75C3.75 14.6633 3.85592 14.3535 4.22253 13.873C4.60235 13.3752 5.18538 12.7899 6.03539 11.9399L4.97473 10.8792ZM12.0601 17.9646C11.2101 18.8146 10.6248 19.3977 10.127 19.7775C9.64651 20.1441 9.33665 20.25 9.04776 20.25V21.75C9.79649 21.75 10.423 21.4384 11.0369 20.97C11.6335 20.5148 12.3008 19.8453 13.1208 19.0253L12.0601 17.9646ZM4.97473 19.0253C5.79476 19.8453 6.46201 20.5148 7.05863 20.97C7.67256 21.4384 8.29902 21.75 9.04776 21.75V20.25C8.75886 20.25 8.449 20.1441 7.9685 19.7775C7.47069 19.3977 6.88541 18.8146 6.03539 17.9646L4.97473 19.0253ZM17.9646 6.03539C18.8146 6.88541 19.3977 7.47069 19.7775 7.9685C20.1441 8.449 20.25 8.75886 20.25 9.04776H21.75C21.75 8.29902 21.4384 7.67256 20.97 7.05863C20.5148 6.46201 19.8453 5.79476 19.0253 4.97473L17.9646 6.03539ZM19.0253 13.1208C19.8453 12.3008 20.5148 11.6335 20.97 11.0369C21.4384 10.423 21.75 9.79649 21.75 9.04776H20.25C20.25 9.33665 20.1441 9.64651 19.7775 10.127C19.3977 10.6248 18.8146 11.2101 17.9646 12.0601L19.0253 13.1208ZM19.0253 4.97473C18.2052 4.1547 17.538 3.48521 16.9414 3.03C16.3274 2.56159 15.701 2.25 14.9522 2.25V3.75C15.2411 3.75 15.551 3.85592 16.0315 4.22253C16.5293 4.60235 17.1146 5.18538 17.9646 6.03539L19.0253 4.97473ZM11.9399 6.03539C12.7899 5.18538 13.3752 4.60235 13.873 4.22253C14.3535 3.85592 14.6633 3.75 14.9522 3.75V2.25C14.2035 2.25 13.577 2.56159 12.9631 3.03C12.3665 3.48521 11.6993 4.1547 10.8792 4.97473L11.9399 6.03539Z"
              fill="currentColor"
            />
            <path
              opacity="0.5"
              d="M13.2411 17.8444C13.534 18.1372 14.0089 18.1372 14.3018 17.8444C14.5946 17.5515 14.5946 17.0766 14.3018 16.7837L13.2411 17.8444ZM7.21637 9.69831C6.92347 9.40541 6.4486 9.40541 6.15571 9.69831C5.86281 9.9912 5.86281 10.4661 6.15571 10.759L7.21637 9.69831ZM14.3018 16.7837L7.21637 9.69831L6.15571 10.759L13.2411 17.8444L14.3018 16.7837Z"
              fill="currentColor"
            />
            <path opacity="0.5" d="M9 21H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </ToolButton>

        {/* Close */}
        <ToolButton active={false} onClick={onToggle} title="Fechar">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </ToolButton>
      </div>
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  children,
  title,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded transition-colors",
        active ? "bg-blue-100 text-blue-700" : "text-zinc-600 hover:bg-zinc-100",
        className,
      )}
    >
      {children}
    </button>
  )
}
