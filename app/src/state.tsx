import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

interface Ctx {
  state: AppState
  markBlock: (day: number, block: BlockKey, opts?: { bridged?: boolean; today?: string }) => void
  unmarkBlock: (day: number, block: BlockKey) => void
  addCards: (cards: SrsCard[]) => void
  reviewOne: (card: SrsCard) => void
  storeWriting: (day: number, text: string) => void
  importAll: (next: AppState) => void
  dismissGuide: () => void
  unlockAllDays: () => void
  reset: () => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())

  useEffect(() => {
    saveState(state)
  }, [state])

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

  const reset = useCallback(() => {
    clearState()
    setState(loadState())
  }, [])

  const value = useMemo(
    () => ({ state, markBlock, unmarkBlock, addCards, reviewOne, storeWriting, importAll, dismissGuide, unlockAllDays, reset }),
    [state, markBlock, unmarkBlock, addCards, reviewOne, storeWriting, importAll, dismissGuide, unlockAllDays, reset],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider')
  return ctx
}
