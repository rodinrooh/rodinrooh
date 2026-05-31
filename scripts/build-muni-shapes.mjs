// Generates public/sf-muni-shapes.json — a simplified set of Muni route
// polylines for the /sf-muni map's faint base layer.
//
// One-time / occasional regeneration. First fetch the SF GTFS static feed:
//   curl -o /tmp/gtfs.zip "https://api.511.org/transit/datafeeds?api_key=$KEY&operator_id=SF"
//   unzip -o /tmp/gtfs.zip -d /tmp/muni-gtfs
// Then: node scripts/build-muni-shapes.mjs [path-to-shapes.txt]
//
// Output: [[ [lng,lat], ... ], ...] — one array of [lng,lat] points per shape.

import { readFileSync, writeFileSync } from "node:fs"

const SHAPES = process.argv[2] ?? "/tmp/muni-gtfs/shapes.txt"
const EPSILON = 0.00012 // ~13m — drops collinear points along straight streets

// Perpendicular distance from point p to the line a→b (in degree space; fine at city scale).
function perpDist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  const t = ((px - ax) * dx + (py - ay) * dy) / len2
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function douglasPeucker(pts, eps) {
  if (pts.length < 3) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD > eps) {
    const left = douglasPeucker(pts.slice(0, idx + 1), eps)
    const right = douglasPeucker(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[pts.length - 1]]
}

const lines = readFileSync(SHAPES, "utf8").trim().split("\n")
lines.shift() // header: shape_id,shape_pt_lon,shape_pt_lat,shape_pt_sequence,...

const byShape = new Map()
for (const line of lines) {
  const [id, lon, lat, seq] = line.split(",")
  if (!byShape.has(id)) byShape.set(id, [])
  byShape.get(id).push([Number(lon), Number(lat), Number(seq)])
}

const shapes = []
let rawPts = 0, keptPts = 0
for (const pts of byShape.values()) {
  pts.sort((a, b) => a[2] - b[2])
  const coords = pts.map(([lon, lat]) => [lon, lat])
  rawPts += coords.length
  const simplified = douglasPeucker(coords, EPSILON).map(([lon, lat]) => [
    Number(lon.toFixed(5)),
    Number(lat.toFixed(5)),
  ])
  if (simplified.length >= 2) { shapes.push(simplified); keptPts += simplified.length }
}

const out = "public/sf-muni-shapes.json"
writeFileSync(out, JSON.stringify(shapes))
const bytes = readFileSync(out).length
console.log(JSON.stringify({
  shapes: shapes.length,
  rawPts,
  keptPts,
  reductionPct: Math.round((1 - keptPts / rawPts) * 100),
  fileKB: Math.round(bytes / 1024),
}))
