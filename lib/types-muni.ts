// One active Muni vehicle: position joined with its current schedule delay.
export interface Bus {
  id: string // vehicle id — stable across refreshes, used as the map annotation key
  route: string // GTFS route id (for SF Muni this is usually the public line, e.g. "14", "49", "N")
  lat: number
  lng: number
  delay: number // seconds behind schedule; negative = ahead/early, null upstream → 0
}

export interface BusesResponse {
  buses: Bus[]
  updatedAt: number // epoch ms when the server built this payload
}
