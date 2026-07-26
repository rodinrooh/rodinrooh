// One Caltrans CCTV camera, shaped for the client.
export interface Camera {
  id: string
  name: string // locationName, e.g. "TV102 -- I-580 : West of SR-24"
  route: string
  direction: string
  county: string
  nearbyPlace: string
  lat: number
  lng: number
  videoUrl: string | null // HLS playlist.m3u8, null if Caltrans has none for this camera
  imageUrl: string | null // static JPG, null if Caltrans has none for this camera
  imageRefreshMs: number // how often the static JPG updates upstream
  updatedAt: number // epoch ms, when Caltrans last recorded this camera's status
}

export interface CamerasResponse {
  city: "sf" | "la"
  cameras: Camera[]
  updatedAt: number // epoch ms when the server built this payload
}
