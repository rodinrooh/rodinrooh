// Confirmed-live tiles that scroll off-screen are paused (not destroyed) for
// up to 60s so scrolling back is instant — see CameraTile.tsx. Left
// unbounded, that could mean dozens of paused videos each holding a
// MediaSource buffer in memory at once on a long scroll session, which the
// old "destroy immediately" design accidentally avoided by being too
// aggressive. This registry bounds that: past MAX_PAUSED simultaneously
// paused tiles, the oldest-paused one is torn down immediately instead of
// waiting out its remaining grace period.
const MAX_PAUSED = 24

// Map preserves insertion order, so keys() gives oldest-paused-first.
const paused = new Map<string, () => void>()

export function registerPaused(id: string, tearDown: () => void): void {
  paused.set(id, tearDown)
  // Evict oldest-first, skipping the entry we just added (relevant only if
  // MAX_PAUSED is small enough that a single registration can exceed it).
  while (paused.size > MAX_PAUSED) {
    const oldestId = [...paused.keys()].find((k) => k !== id)
    if (oldestId === undefined) break
    paused.get(oldestId)?.()
    paused.delete(oldestId)
  }
}

export function unregisterPaused(id: string): void {
  paused.delete(id)
}
