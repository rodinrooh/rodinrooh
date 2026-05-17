export const COLOR_MAP: Record<string, string> = {
  BLACK: "#1c1c1e", WHITE: "#f2f2f7", GRAY: "#8e8e93", GREY: "#8e8e93",
  SILVER: "#8e8e93", BLUE: "#007aff", RED: "#ff3b30", GREEN: "#34c759",
  YELLOW: "#ffd60a", GOLD: "#ffd60a", ORANGE: "#ff9f0a", BROWN: "#a2845e",
  TAN: "#a2845e", BEIGE: "#a2845e", PURPLE: "#af52de", MAROON: "#8b0000",
  PINK: "#ff2d55", BURGUNDY: "#8b0000",
}

export const STATUS_COLOR: Record<string, string> = {
  STORED: "#ff3b30", "RELEASE PENDING": "#ff9f0a", RELEASED: "#8e8e93",
}

export function getCarColor(color: string | null | undefined): string {
  if (!color) return "#8e8e93"
  return COLOR_MAP[color.toUpperCase()] ?? "#8e8e93"
}

export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "#8e8e93"
  return STATUS_COLOR[status.toUpperCase()] ?? "#8e8e93"
}

export function getStatusLabel(status: string | null | undefined): string {
  return status ?? "UNKNOWN"
}
