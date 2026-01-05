import { useEffect, useRef, useState } from "react"
import Map from "ol/Map"
import { Vector as VectorSource } from "ol/source"
import { Vector as VectorLayer } from "ol/layer"
import { Draw } from "ol/interaction"
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style"
import { cn } from "../../lib/utils"

type DrawMode = "Point" | "Circle" | "LineString" | "FreehandLine" | "Polygon" | "FreehandPolygon" | null

export function DrawTools({ map, isOpen, onToggle }: { map: Map | null; isOpen: boolean; onToggle: () => void }) {
  const [activeMode, setActiveMode] = useState<DrawMode>(null)
  const sourceRef = useRef<VectorSource | null>(null)
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const drawInteractionRef = useRef<Draw | null>(null)

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
    const layer = new VectorLayer({
      source: source,
      style: new Style({
        fill: new Fill({
          color: "rgba(255, 255, 255, 0.2)",
        }),
        stroke: new Stroke({
          color: "#22c55e", // Green-500
          width: 2,
        }),
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({
            color: "#22c55e",
          }),
        }),
      }),
      zIndex: 999, // On top
    })
    // Add a custom property to identify this layer if needed
    layer.set("id", "draw-layer")

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

    if (!activeMode) {
      if (drawInteractionRef.current) {
        map.removeInteraction(drawInteractionRef.current)
        drawInteractionRef.current = null
      }
      return
    }

    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current)
    }

    let type: any = "Point"
    let freehand = false

    switch (activeMode) {
      case "Point":
        type = "Point"
        break
      case "Circle":
        type = "Circle"
        break
      case "LineString":
        type = "LineString"
        break
      case "FreehandLine":
        type = "LineString"
        freehand = true
        break
      case "Polygon":
        type = "Polygon"
        break
      case "FreehandPolygon":
        type = "Polygon"
        freehand = true
        break
    }

    const draw = new Draw({
      source: sourceRef.current!,
      type: type,
      freehand: freehand,
    })

    map.addInteraction(draw)
    drawInteractionRef.current = draw

    return () => {
      map.removeInteraction(draw)
      drawInteractionRef.current = null
    }
  }, [map, activeMode])

  const clearDrawings = () => {
    sourceRef.current?.clear()
  }

  const stopDrawing = () => {
    setActiveMode(null)
  }

  if (!isOpen) {
    return (
      <div className="">
        <button
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-md hover:bg-zinc-50 border border-zinc-200 text-zinc-700"
          title="Ferramentas de Desenho"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
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
          <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
        </svg>
      </div>
      
      <div className="py-1 flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Draw</span>
        <div className="w-8 h-px bg-zinc-200 my-1" />
        
        {/* Point */}
        <ToolButton
          active={activeMode === "Point"}
          onClick={() => setActiveMode("Point")}
          title="Ponto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <circle cx="12" cy="12" r="4" />
          </svg>
        </ToolButton>

        {/* Circle */}
        <ToolButton
          active={activeMode === "Circle"}
          onClick={() => setActiveMode("Circle")}
          title="Círculo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="8" />
          </svg>
        </ToolButton>

        {/* Line */}
        <ToolButton
          active={activeMode === "LineString"}
          onClick={() => setActiveMode("LineString")}
          title="Linha"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <line x1="4" y1="20" x2="20" y2="4" />
          </svg>
        </ToolButton>

        {/* Freehand Line */}
        <ToolButton
          active={activeMode === "FreehandLine"}
          onClick={() => setActiveMode("FreehandLine")}
          title="Linha Livre"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M4 12c2-4 6-4 8 0s6 4 8 0" />
          </svg>
        </ToolButton>

        {/* Polygon */}
        <ToolButton
          active={activeMode === "Polygon"}
          onClick={() => setActiveMode("Polygon")}
          title="Polígono"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M12 2l8 6v8l-8 6-8-6V8l8-6z" />
          </svg>
        </ToolButton>

        {/* Freehand Polygon */}
        <ToolButton
          active={activeMode === "FreehandPolygon"}
          onClick={() => setActiveMode("FreehandPolygon")}
          title="Polígono Livre"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M12 2C6 2 2 6 2 12s4 10 10 10 10-4 10-10S18 2 12 2z" strokeDasharray="3 3" />
          </svg>
        </ToolButton>

        {/* Stop */}
        <div className="w-8 h-px bg-zinc-200 my-1" />
        <ToolButton
          active={false}
          onClick={stopDrawing}
          title="Parar Desenho"
        >
          <div className="w-3 h-3 bg-zinc-700 rounded-sm" />
        </ToolButton>

        {/* Eraser */}
        <ToolButton
          active={false}
          onClick={clearDrawings}
          title="Limpar Tudo"
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
