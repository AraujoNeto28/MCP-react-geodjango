import { useState, useEffect } from "react"
import { transform } from "ol/proj"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { Label } from "../../components/ui/Label"
import { Alert, AlertDescription } from "../../components/ui/Alert"
import { cn } from "../../lib/utils"
import { ensureProjectionsRegistered } from "../../map/projections"

type Props = {
  onLocationSelect: (location: { x: number; y: number }) => void
}

type CoordinateSystem = "WGS84" | "TMPOA"

export function CoordinateLocatorPanel({ onLocationSelect }: Props) {
  const [system, setSystem] = useState<CoordinateSystem>("WGS84")
  const [x, setX] = useState("")
  const [y, setY] = useState("")
  const [combined, setCombined] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureProjectionsRegistered()
  }, [])

  const handleClear = () => {
    setX("")
    setY("")
    setCombined("")
    setError(null)
  }

  const handleCombinedChange = (val: string) => {
    setCombined(val)
    // Try to split by comma
    const parts = val.split(",").map((p) => p.trim())
    if (parts.length === 2) {
      setX(parts[0])
      setY(parts[1])
    }
  }

  const validateAndLocate = () => {
    setError(null)
    const numX = parseFloat(x.replace(",", "."))
    const numY = parseFloat(y.replace(",", "."))

    if (isNaN(numX) || isNaN(numY)) {
      setError("Coordenadas inválidas.")
      return
    }

    let finalLon = numX
    let finalLat = numY

    if (system === "WGS84") {
      // Validation for Porto Alegre WGS84
      // Porto Alegre: -52 a -50 (Lon), -31 a -29.5 (Lat)
      if (numX < -52 || numX > -50) {
        setError("Longitude fora da abrangência de Porto Alegre (-52 a -50).")
        return
      }
      if (numY < -31 || numY > -29.5) {
        setError("Latitude fora da abrangência de Porto Alegre (-31 a -29.5).")
        return
      }
    } else {
      // TM-POA Validation
      // Easting: 270.000 a 330.000
      // Northing: 1.650.000 a 1.700.000
      // Note: User prompt says Northing 1.650.000 to 1.700.000 but example is 1671613.
      // Wait, standard TM-POA False Northing is 5,000,000.
      // However, the user prompt explicitly says:
      // "Porto Alegre: 1.650.000 a 1.700.000" for Northing.
      // And the example is 1671613.
      // But the PROJ string provided says: +y_0=5000000.
      // If the user coordinates are around 1.67M, and false northing is 5M, that's weird for POA (Lat -30).
      // Lat -30 is approx 3.3M meters from equator? No, 1 degree ~ 111km. 30 * 111 = 3330km = 3,330,000m.
      // If false northing is 5,000,000 (at equator), then at -30 it should be 5M - 3.3M = 1.7M.
      // So 1,670,000 makes sense!
      
      if (numX < 270000 || numX > 330000) {
        setError("Easting (X) fora da abrangência de Porto Alegre (270.000 a 330.000).")
        return
      }
      if (numY < 1650000 || numY > 1700000) {
        setError("Northing (Y) fora da abrangência de Porto Alegre (1.650.000 a 1.700.000).")
        return
      }

      // Convert EPSG:10665 to EPSG:4326
      try {
        const result = transform([numX, numY], "EPSG:10665", "EPSG:4326")
        finalLon = result[0]
        finalLat = result[1]
      } catch (e) {
        console.error(e)
        setError("Erro ao converter coordenadas.")
        return
      }
    }

    onLocationSelect({ x: finalLon, y: finalLat })
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Localizar coordenada</h2>
      </div>

      <div className="space-y-2">
        <Label>Sistema de Coordenadas</Label>
        <div className="flex rounded-md shadow-sm">
          <button
            onClick={() => setSystem("WGS84")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium border first:rounded-l-md last:rounded-r-md focus:z-10 focus:ring-2 focus:ring-blue-500 focus:outline-none",
              system === "WGS84"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
            )}
          >
            WGS84 (Lat/Lon)
          </button>
          <button
            onClick={() => setSystem("TMPOA")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium border -ml-px first:rounded-l-md last:rounded-r-md focus:z-10 focus:ring-2 focus:ring-blue-500 focus:outline-none",
              system === "TMPOA"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
            )}
          >
            TM-POA (E/N)
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="coord-x">
            {system === "WGS84" ? "Longitude (X) *" : "Easting (E) *"}
          </Label>
          <Input
            id="coord-x"
            placeholder={system === "WGS84" ? "Ex: -51.2177" : "Ex: 300000"}
            value={x}
            onChange={(e) => setX(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            {system === "WGS84" ? "Porto Alegre: -52 a -50" : "Porto Alegre: 270.000 a 330.000"}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="coord-y">
            {system === "WGS84" ? "Latitude (Y) *" : "Northing (N) *"}
          </Label>
          <Input
            id="coord-y"
            placeholder={system === "WGS84" ? "Ex: -30.0746" : "Ex: 1671613"}
            value={y}
            onChange={(e) => setY(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            {system === "WGS84" ? "Porto Alegre: -31 a -29.5" : "Porto Alegre: 1.650.000 a 1.700.000"}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="coord-combined">
            {system === "WGS84" ? "Coordenadas (X,Y)" : "Coordenadas (E,N)"}
          </Label>
          <Input
            id="coord-combined"
            placeholder={system === "WGS84" ? "Ex: -51.2177,-30.0746" : "Ex: 280173.71,1671428.72"}
            value={combined}
            onChange={(e) => handleCombinedChange(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            {system === "WGS84"
              ? "Separe Longitude e Latitude por vírgula"
              : "Separe Easting e Northing por vírgula"}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button className="flex-1 bg-slate-700 hover:bg-slate-800" onClick={validateAndLocate}>
          Localizar
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleClear}>
          Limpar
        </Button>
      </div>

      <p className="text-sm text-zinc-500">
        Vai ao ponto no mapa e mostra o pin por 10 segundos.
      </p>
    </div>
  )
}
