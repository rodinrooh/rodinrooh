// Caps how many tiles can be mid-HLS-negotiation at once. Slots now release
// as soon as a stream's manifest parses (see CameraTile.tsx) rather than
// being held for the stream's entire playing lifetime, so this cap only binds
// during the initial burst when a lot of tiles become visible at once — not
// an ongoing bottleneck. 40 is generous headroom for a normal viewport while
// still bounding a pathological case (a maximized 4K window with 80+ tiles
// pre-loaded via IntersectionObserver's rootMargin).
//
// There's no real evidence Caltrans needs protecting from this traffic — they
// serve these streams with wide-open CORS and no API key specifically for
// public consumption. The actual constraint this cap guards against is the
// *visitor's own device* decoding too many simultaneous videos at once.
const MAX_CONCURRENT = 40

let active = 0
// Two FIFO buckets: a released slot is offered to the priority queue first
// (cameras with a recent localStorage record of having been live — see
// CameraTile.tsx), falling back to normal FIFO order otherwise.
const priorityQueue: (() => void)[] = []
const normalQueue: (() => void)[] = []

export interface HlsSlotTicket {
  // Resolves with the release function once a slot is actually acquired.
  promise: Promise<() => void>
  // Call if the tile scrolls off-screen/unmounts before its turn comes up —
  // removes it from whichever queue it's sitting in so it doesn't hold a
  // phantom place in line.
  cancel: () => void
}

export function acquireHlsSlot(priority = false): HlsSlotTicket {
  let queuedFn: (() => void) | null = null
  let queuedIn: (() => void)[] | null = null

  const promise = new Promise<() => void>((resolve) => {
    const tryAcquire = () => {
      active++
      resolve(() => {
        active--
        const next = priorityQueue.shift() ?? normalQueue.shift()
        if (next) next()
      })
    }
    if (active < MAX_CONCURRENT) {
      tryAcquire()
    } else {
      queuedFn = tryAcquire
      queuedIn = priority ? priorityQueue : normalQueue
      queuedIn.push(tryAcquire)
    }
  })

  return {
    promise,
    cancel: () => {
      if (queuedFn && queuedIn) {
        const idx = queuedIn.indexOf(queuedFn)
        if (idx !== -1) queuedIn.splice(idx, 1)
      }
    },
  }
}
