// One Caltrans CCTV camera, shaped for the client. Only cameras that actually
// have an HLS stream are ever sent — no photo fallback, so videoUrl is
// guaranteed non-null (see the server-side filter in api/cameras/route.ts).
export interface Camera {
  id: string
  name: string // locationName, e.g. "TV102 -- I-580 : West of SR-24"
  route: string
  direction: string
  county: string
  nearbyPlace: string
  lat: number
  lng: number
  videoUrl: string // HLS playlist.m3u8
  updatedAt: number // epoch ms, when Caltrans last recorded this camera's status
}

export interface CamerasResponse {
  city: "sf" | "la"
  cameras: Camera[]
  updatedAt: number // epoch ms when the server built this payload
}
