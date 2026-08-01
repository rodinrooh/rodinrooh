// Confirmed-live tiles that get demoted to standby (paged away from, or a
// background reserve prefetch that connected on its own) are paused, not
// destroyed, so promoting them back to active is instant — see
// CameraTile.tsx. There's deliberately no per-tile timeout for this
// anymore (removed after it caused a real bug: a tile would blindly expire
// on a clock even with zero actual resource pressure, forcing a needless
// reconnect). This registry is the only thing standing between that and
// unbounded growth: past MAX_PAUSED simultaneously paused tiles, the
// oldest-paused one is torn down immediately to make room.
const MAX_PAUSED = 30

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
