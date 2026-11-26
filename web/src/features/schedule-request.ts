// Avoid starting a request when React immediately cleans up an obsolete effect
// (including the mount/cleanup/mount cycle in development Strict Mode).
export function scheduleRequest(start: () => (() => void) | void) {
  let cancelled = false
  let stop: (() => void) | void
  queueMicrotask(() => {
    if (!cancelled) stop = start()
  })
  return () => {
    cancelled = true
    stop?.()
  }
}
