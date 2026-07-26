import { useEffect, useState, type RefObject } from "react"

// Tracks whether an element is near the viewport. Used to gate expensive
// per-tile work (starting/stopping an HLS connection) to roughly what's visible.
export function useOnScreen(ref: RefObject<Element | null>, rootMargin = "200px"): boolean {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      rootMargin,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, rootMargin])

  return isVisible
}
