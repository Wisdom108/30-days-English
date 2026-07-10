import { useEffect, useRef, type RefObject } from 'react'

// On-screen keyboard tracking (v3.2 §11) via visualViewport:
//   · toggles `kb-open` on <html> — A1's CSS hides the .tabbar, and the
//     appended `html.kb-open .chat-dock { bottom: 0 }` drops the dock's
//     tab-bar clearance while the keyboard covers that area
//   · keeps the dock glued to the keyboard top with a translateY equal to the
//     band of layout viewport the keyboard hides (iOS Safari does NOT resize
//     the layout viewport, so sticky/fixed elements sink behind the keyboard)
//   · after focusing a field inside the dock, nudges it back into view on the
//     next frame (the browser may have scrolled the page arbitrarily)
// The transform is written straight to the DOM node — viewport resize/scroll
// fire continuously while the keyboard animates, and a React state round-trip
// per frame would jank the glue.

const OPEN_THRESHOLD = 80 // px — smaller bands are browser chrome, not a keyboard

export function useKeyboard<T extends HTMLElement>(): RefObject<T> {
  const dockRef = useRef<T>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let raf = 0
    const apply = () => {
      raf = 0
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      const open = hidden > OPEN_THRESHOLD
      document.documentElement.classList.toggle('kb-open', open)
      if (dockRef.current) dockRef.current.style.transform = open ? `translateY(-${hidden}px)` : ''
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onFocus = (e: FocusEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && dockRef.current?.contains(t)) {
        requestAnimationFrame(() => t.scrollIntoView({ block: 'nearest' }))
      }
    }
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('focusin', onFocus)
    apply()
    return () => {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('focusin', onFocus)
      if (raf) cancelAnimationFrame(raf)
      document.documentElement.classList.remove('kb-open')
    }
  }, [])
  return dockRef
}
