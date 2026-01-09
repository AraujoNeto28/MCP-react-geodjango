import { env } from "../../config/env"

export type AddressCandidate = {
  address: string
  location: {
    x: number
    y: number
  }
  score: number
  source: "arcgis" | "nominatim"
}

export async function searchAddressArcGIS(query: string): Promise<AddressCandidate[]> {
  const params = new URLSearchParams({
    SingleLine: query,
    outFields: "Match_addr,Score",
    maxLocations: "10",
    outSR: "4326", // Request WGS84 coordinates
    f: "json",
  })

  // Use our backend proxy
  const response = await fetch(`${env.apiBaseUrl}/search/arcgis/find/?${params.toString()}`)
  if (!response.ok) throw new Error("Failed to fetch from ArcGIS")
  
  const data = await response.json()
  
  if (!data.candidates) return []

  return data.candidates.map((c: any) => ({
    address: c.address,
    location: { x: c.location.x, y: c.location.y },
    score: c.score,
    source: "arcgis",
  }))
}

export async function searchAddressNominatim(query: string): Promise<AddressCandidate[]> {
  const params = new URLSearchParams({
    q: `${query}, Porto Alegre`, // Restrict to Porto Alegre as requested
    format: "json",
    limit: "10",
    addressdetails: "1",
  })

  // Use our backend proxy
  const response = await fetch(`${env.apiBaseUrl}/search/nominatim/search/?${params.toString()}`)
  if (!response.ok) throw new Error("Failed to fetch from Nominatim")

  const data = await response.json()

  return data.map((item: any) => ({
    address: item.display_name,
    location: { x: parseFloat(item.lon), y: parseFloat(item.lat) },
    score: 100, // Nominatim doesn't provide a score in the same way
    source: "nominatim",
  }))
}

export type NominatimReverseResult = {
  place_id?: number
  lat?: string
  lon?: string
  display_name?: string
  address?: Record<string, string>
}

export async function reverseGeocodeNominatim(lat: number, lon: number): Promise<NominatimReverseResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "json",
    addressdetails: "1",
  })

  const response = await fetch(`${env.apiBaseUrl}/search/nominatim/reverse/?${params.toString()}`)
  if (!response.ok) throw new Error("Failed to reverse geocode with Nominatim")

  return response.json()
}
