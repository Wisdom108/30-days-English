import { useEffect, useRef, useState } from 'react'

// Ticks a number up to `target` on mount / whenever target changes — the little
// "system booting up" motion that makes dot-matrix / telemetry readouts feel
// alive. Respects prefers-reduced-motion (jumps straight to the value).
export function useCountUp(target: number, ms = 550): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (typeof window === 'undefined') { setValue(target); return }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    if (reduce || from === target) { setValue(target); fromRef.current = target; return }

    let raf = 0
    let start = 0
    const step = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setValue(Math.round(from + (target - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return value
}
