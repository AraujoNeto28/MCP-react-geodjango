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
    
    // Let's try to find all vector layers
    // const layers = map.getLayers().getArray()
    // const vectorSources: VectorSource[] = []
    
    // const findVectorSources = (layerCollection: any) => {
    //   layerCollection.forEach((layer: any) => {
    //     if (layer.isGroup) { // Check if it's a group (custom property or check getLayers)
    //        if (typeof layer.getLayers === 'function') {
    //          findVectorSources(layer.getLayers().getArray())
    //        }
    //     } else {
    //        // Check if it has a vector source
    //        const source = layer.getSource()
    //        // We check if it is a VectorSource (has getFeatures) and not our own draw/measure layers
    //        if (source && typeof source.getFeatures === 'function' && layer.get('id') !== 'measure-layer' && layer.get('id') !== 'draw-layer') {
    //          vectorSources.push(source)
    //        }
    //     }
    //   })
    // }
    
    // We need to traverse the layer groups
    // The map layers are usually [BasemapGroup, OverlaysGroup]
    // We can just traverse everything
    // Note: This runs once when mode changes. If layers load later, they might not be snapped to.
    // But usually layers are loaded.
    
    // Helper to traverse
    const traverse = (collection: any) => {
        collection.forEach((l: any) => {
            if (l.getLayers) {
                traverse(l.getLayers())
            } else {
                const s = l.getSource()
                // Check for vector source (has getFeatures)
                if (s && typeof s.getFeatures === 'function' && l.getVisible()) {
                     // Exclude our own layers
                     if (l.get('id') !== 'measure-layer' && l.get('id') !== 'draw-layer') {
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
                if (s && typeof s.getFeatures === 'function' && l.getVisible()) {
                     if (l.get('id') !== 'measure-layer' && l.get('id') !== 'draw-layer') {
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
        snaps.forEach(s => map.removeInteraction(s))
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M5.25 2.25a3 3 0 00-3 3v4.318a3 3 0 00.879 2.121l9.58 9.581c.92.92 2.39 1.186 3.548.428a18.849 18.849 0 005.441-5.44c.758-1.16.492-2.629-.428-3.548l-9.58-9.581a3 3 0 00-2.122-.879H5.25zM6.375 7.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-zinc-700">
          <path fillRule="evenodd" d="M5.25 2.25a3 3 0 00-3 3v4.318a3 3 0 00.879 2.121l9.58 9.581c.92.92 2.39 1.186 3.548.428a18.849 18.849 0 005.441-5.44c.758-1.16.492-2.629-.428-3.548l-9.58-9.581a3 3 0 00-2.122-.879H5.25zM6.375 7.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
        </svg>
      </div>
      
      <div className="py-1 flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Medir</span>
        <div className="w-8 h-px bg-zinc-200 my-1" />
        
        {/* Line */}
        <ToolButton
          active={activeMode === "LineString"}
          onClick={() => setActiveMode("LineString")}
          title="Distância"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M4 20L20 4" />
            <path d="M6 20l-2-2" />
            <path d="M18 4l2 2" />
          </svg>
        </ToolButton>

        {/* Circle (Radius) */}
        <ToolButton
          active={activeMode === "Circle"}
          onClick={() => setActiveMode("Circle")}
          title="Raio"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 12h8" />
          </svg>
        </ToolButton>

        {/* Polygon (Area) */}
        <ToolButton
          active={activeMode === "Polygon"}
          onClick={() => setActiveMode("Polygon")}
          title="Área"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M12 2l8 6v8l-8 6-8-6V8l8-6z" />
          </svg>
        </ToolButton>

        {/* Stop */}
        <div className="w-8 h-px bg-zinc-200 my-1" />
        <ToolButton
          active={false}
          onClick={stopMeasuring}
          title="Parar Medição"
        >
          <div className="w-3 h-3 bg-zinc-700 rounded-sm" />
        </ToolButton>

        {/* Eraser */}
        <ToolButton
          active={false}
          onClick={clearMeasurements}
          title="Limpar Medições"
          className="text-red-600 hover:bg-red-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 19h-6" />
            <path d="M20 15L10 21 4 15 14 5l6 6-6 6" />
          </svg>
        </ToolButton>

        {/* Close */}
        <ToolButton
          active={false}
          onClick={onToggle}
          title="Fechar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
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
        className
      )}
    >
      {children}
    </button>
  )
}
