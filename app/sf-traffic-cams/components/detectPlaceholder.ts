// Caltrans's own "Temporarily Unavailable" graphic is served from the same
// currentImageURL as a real photo, with a normal 200 status — the JSON feed
// has no flag for it, so the only way to tell is to look at the pixels after
// the image loads. The graphic is a near-solid white card with bold blue text
// ("Temporarily Unavailable") centered above the same dark timestamp bar every
// real photo also has. Measured empirically: a real highway photo (day or
// night, including foggy/overexposed ones) never has more than ~4% near-white
// pixels above the timestamp bar; the placeholder is ~83%. The gap is wide
// enough that a coarse, cheap sample is enough — no need for exact matching.
const NEAR_WHITE_FRACTION_THRESHOLD = 0.5
const SAMPLE_W = 32
const SAMPLE_H = 24
const EXCLUDE_BOTTOM_FRACTION = 0.15 // the timestamp bar, present on every image

export function isCaltransPlaceholder(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas")
  canvas.width = SAMPLE_W
  canvas.height = SAMPLE_H
  const ctx = canvas.getContext("2d")
  if (!ctx) return false

  const cropHeight = img.naturalHeight * (1 - EXCLUDE_BOTTOM_FRACTION)
  try {
    ctx.drawImage(img, 0, 0, img.naturalWidth, cropHeight, 0, 0, SAMPLE_W, SAMPLE_H)
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)
    let nearWhite = 0
    const total = SAMPLE_W * SAMPLE_H
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= 235 && data[i + 1] >= 235 && data[i + 2] >= 235) nearWhite++
    }
    return nearWhite / total >= NEAR_WHITE_FRACTION_THRESHOLD
  } catch {
    // Cross-origin canvas read blocked (shouldn't happen — Caltrans sends
    // Access-Control-Allow-Origin: * — but fail open rather than crash).
    return false
  }
}
