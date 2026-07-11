import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppState, BlockKey, SrsCard } from './types'
import {
  clearState,
  completeBlock,
  loadState,
  saveState,
  saveWriting,
  uncompleteBlock,
  updateCard,
  upsertCards,
} from './lib/storage'
import { completeLessonReview } from './lib/lessonReview'

interface Ctx {
  state: AppState
  markBlock: (day: number, block: BlockKey, opts?: { bridged?: boolean; today?: string }) => void
  unmarkBlock: (day: number, block: BlockKey) => void
  addCards: (cards: SrsCard[]) => void
  reviewOne: (card: SrsCard) => void
  finishLessonReview: (day: number) => void
  storeWriting: (day: number, text: string) => void
  importAll: (next: AppState) => void
  dismissGuide: () => void
  unlockAllDays: () => void
  reset: () => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())

  // Debounced persistence (300ms): coalesces mutation bursts (rapid card reviews,
  // block toggles) into one localStorage write. pendingRef always holds the latest
  // UNSAVED state; flush() writes it synchronously so nothing is lost when the
  // page hides/unloads or the provider unmounts mid-window.
  const pendingRef = useRef<AppState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current !== null) {
      saveState(pendingRef.current)
      pendingRef.current = null
    }
  }, [])

  useEffect(() => {
    pendingRef.current = state
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (pendingRef.current !== null) {
        saveState(pendingRef.current)
        pendingRef.current = null
      }
    }, 300)
  }, [state])

  // Sync flush on tab hide / bfcache eviction / navigation (visibilitychange is
  // the reliable "last chance" signal on mobile Safari; pagehide covers desktop
  // unload paths) and on unmount — the debounce must never eat the last write.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  // Every LOCAL mutation stamps updatedAt so the cloud merge can pick the newer
  // side for editable fields (writings, SRS cards). importAll/reset do NOT stamp
  // — they adopt an already-merged state and must preserve its timestamp.
  const mutate = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => {
      const next = fn(s)
      if (next === s) return s // no-op reducer (e.g. addCards with nothing new)
      return { ...next, updatedAt: Date.now() }
    })
  }, [])

  const markBlock = useCallback((day: number, block: BlockKey, opts?: { bridged?: boolean; today?: string }) => {
    mutate((s) => completeBlock(s, day, block, opts))
  }, [mutate])

  const unmarkBlock = useCallback((day: number, block: BlockKey) => {
    mutate((s) => uncompleteBlock(s, day, block))
  }, [mutate])

  const addCards = useCallback((cards: SrsCard[]) => {
    mutate((s) => upsertCards(s, cards))
  }, [mutate])

  const reviewOne = useCallback((card: SrsCard) => {
    mutate((s) => updateCard(s, card))
  }, [mutate])

  const finishLessonReview = useCallback((day: number) => {
    mutate((s) => ({ ...s, lessonReviews: completeLessonReview(s.lessonReviews, day) }))
  }, [mutate])

  const storeWriting = useCallback((day: number, text: string) => {
    mutate((s) => saveWriting(s, day, text))
  }, [mutate])

  const importAll = useCallback((next: AppState) => {
    setState(next)
  }, [])

  const dismissGuide = useCallback(() => {
    mutate((s) => ({ ...s, guideDismissed: true }))
  }, [mutate])

  const unlockAllDays = useCallback(() => {
    mutate((s) => ({ ...s, unlockAll: true }))
  }, [mutate])

  // Constraint: local-only. In account mode the caller must push an empty state
  // (fresh updatedAt) to the cloud FIRST (see Progress.tsx doReset), or CloudSync's
  // pull-merge restores the cloud copy ~3s later.
  const reset = useCallback(() => {
    clearState()
    setState(loadState())
  }, [])

  const value = useMemo(
    () => ({ state, markBlock, unmarkBlock, addCards, reviewOne, finishLessonReview, storeWriting, importAll, dismissGuide, unlockAllDays, reset }),
    [state, markBlock, unmarkBlock, addCards, reviewOne, finishLessonReview, storeWriting, importAll, dismissGuide, unlockAllDays, reset],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider')
  return ctx
}
