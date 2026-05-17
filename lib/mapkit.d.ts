// Minimal MapKit JS ambient declarations so TypeScript doesn't complain about window.mapkit
interface Window {
  mapkit: typeof mapkit
}

declare namespace mapkit {
  function init(options: { authorizationCallback: (done: (token: string) => void) => void }): void

  class Coordinate {
    constructor(latitude: number, longitude: number)
  }

  class Map {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(element: HTMLElement, options?: any)
    center: Coordinate
    cameraDistance: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    padding: any
    addAnnotation(annotation: unknown): void
    removeAnnotation(annotation: unknown): void
    setRegionAnimated(region: unknown, animated: boolean): void
    setCenterAnimated(coordinate: Coordinate, animated: boolean): void
  }

  const FeatureVisibility: { Adaptive: string; Hidden: string; Visible: string }
}
