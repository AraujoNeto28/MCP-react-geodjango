import { useState, useEffect } from "react"
import { Input } from "../../components/ui/Input"
import { Label } from "../../components/ui/Label"
import { Card } from "../../components/ui/Card"
import { Select } from "../../components/ui/Select"
import { Alert, AlertDescription } from "../../components/ui/Alert"
import { searchAddressArcGIS, searchAddressNominatim, type AddressCandidate } from "./addressApi"

type Props = {
  onLocationSelect: (candidate: AddressCandidate) => void
}

type SearchSource = "arcgis" | "nominatim"

export function SearchAddressPanel({ onLocationSelect }: Props) {
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<SearchSource>("arcgis")
  const [results, setResults] = useState<AddressCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length < 3) {
        setResults([])
        return
      }
      handleSearch()
    }, 500)

    return () => clearTimeout(timer)
  }, [query, source])

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      let candidates: AddressCandidate[] = []
      if (source === "arcgis") {
        candidates = await searchAddressArcGIS(query)
      } else {
        candidates = await searchAddressNominatim(query)
      }
      setResults(candidates)
    } catch (err) {
      setError("Erro ao buscar endereços")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50/50">
      <div className="border-b border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Buscar Endereços</h2>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fonte de Dados</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value as SearchSource)}>
              <option value="arcgis">ArcGIS Procempa</option>
              <option value="nominatim">OpenStreetMap (Nominatim)</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input
              placeholder="Digite o endereço..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-xs text-zinc-500">
              Digite pelo menos 3 caracteres para buscar
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <svg className="mr-3 h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Buscando...
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && results.length === 0 && query.length >= 3 && (
          <div className="text-center text-sm text-zinc-500">
            Nenhum endereço encontrado
          </div>
        )}

        <div className="space-y-2">
          {results.map((candidate, index) => (
            <Card
              key={index}
              className="cursor-pointer p-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
              onClick={() => onLocationSelect(candidate)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-zinc-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.625a19.055 19.055 0 005.415 2.301l.002.001h.002zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-900">{candidate.address}</div>
                  <div className="text-xs text-zinc-500">
                    {candidate.source === "arcgis" ? "ArcGIS Procempa" : "OpenStreetMap"}
                    {candidate.score < 100 && ` • Score: ${candidate.score.toFixed(0)}`}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
