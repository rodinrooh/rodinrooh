// Caps how many tiles can be mid-HLS-negotiation at once. Measured with a real
// headless-browser run: of ~23 tiles that load simultaneously on a 1400x900
// viewport, only ~2 succeed (in ~1s) and the rest hang until the watchdog cuts
// them off — concurrency didn't appear to be *causing* those failures (the
// successes were just as fast whether tested alone or amid the burst), so this
// cap isn't a speed fix. It exists to bound how many simultaneous connections
// we open to Caltrans's infrastructure on wide/tall viewports (a 4K window can
// fit 50+ tiles) — set loose enough that it rarely queues on a normal screen.
const MAX_CONCURRENT = 10

let active = 0
const queue: (() => void)[] = []

export interface HlsSlotTicket {
  // Resolves with the release function once a slot is actually acquired.
  promise: Promise<() => void>
  // Call if the tile scrolls off-screen/unmounts before its turn comes up —
  // removes it from the queue so it doesn't hold a phantom place in line.
  cancel: () => void
}

export function acquireHlsSlot(): HlsSlotTicket {
  let queuedFn: (() => void) | null = null

  const promise = new Promise<() => void>((resolve) => {
    const tryAcquire = () => {
      active++
      resolve(() => {
        active--
        const next = queue.shift()
        if (next) next()
      })
    }
    if (active < MAX_CONCURRENT) {
      tryAcquire()
    } else {
      queuedFn = tryAcquire
      queue.push(tryAcquire)
    }
  })

  return {
    promise,
    cancel: () => {
      if (queuedFn) {
        const idx = queue.indexOf(queuedFn)
        if (idx !== -1) queue.splice(idx, 1)
      }
    },
  }
}
