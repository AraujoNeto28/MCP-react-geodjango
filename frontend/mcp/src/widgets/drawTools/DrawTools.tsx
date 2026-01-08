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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5 text-zinc-700"
        >
          <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
        </svg>
      </div>

      <div className="py-1 flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Draw</span>
        <div className="w-8 h-px bg-zinc-200 my-1" />

        {/* Point */}
        <ToolButton active={activeMode === "Point"} onClick={() => setActiveMode("Point")} title="Ponto">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <circle cx="12" cy="12" r="4" />
          </svg>
        </ToolButton>

        {/* Circle */}
        <ToolButton active={activeMode === "Circle"} onClick={() => setActiveMode("Circle")} title="Círculo">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <circle cx="12" cy="12" r="8" />
          </svg>
        </ToolButton>

        {/* Line */}
        <ToolButton active={activeMode === "LineString"} onClick={() => setActiveMode("LineString")} title="Linha">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <line x1="4" y1="20" x2="20" y2="4" />
          </svg>
        </ToolButton>

        {/* Freehand Line */}
        <ToolButton
          active={activeMode === "FreehandLine"}
          onClick={() => setActiveMode("FreehandLine")}
          title="Linha Livre"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <path d="M4 12c2-4 6-4 8 0s6 4 8 0" />
          </svg>
        </ToolButton>

        {/* Polygon */}
        <ToolButton active={activeMode === "Polygon"} onClick={() => setActiveMode("Polygon")} title="Polígono">
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

        {/* Freehand Polygon */}
        <ToolButton
          active={activeMode === "FreehandPolygon"}
          onClick={() => setActiveMode("FreehandPolygon")}
          title="Polígono Livre"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
          >
            <path
              d="M12 2C6 2 2 6 2 12s4 10 10 10 10-4 10-10S18 2 12 2z"
              strokeDasharray="3 3"
            />
          </svg>
        </ToolButton>

        {/* Stop */}
        <div className="w-8 h-px bg-zinc-200 my-1" />
        <ToolButton active={false} onClick={stopDrawing} title="Parar Desenho">
          <div className="w-3 h-3 bg-zinc-700 rounded-sm" />
        </ToolButton>

        {/* Eraser */}
        <ToolButton
          active={false}
          onClick={clearDrawings}
          title="Limpar Tudo"
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
