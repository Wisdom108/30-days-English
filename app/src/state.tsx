import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppState, BlockKey, SrsCard } from './types'
import {
  completeBlock,
  loadState,
  saveState,
  saveWriting,
  updateCard,
  upsertCards,
} from './lib/storage'

interface Ctx {
  state: AppState
  markBlock: (day: number, block: BlockKey) => void
  addCards: (cards: SrsCard[]) => void
  reviewOne: (card: SrsCard) => void
  storeWriting: (day: number, text: string) => void
  importAll: (next: AppState) => void
  dismissGuide: () => void
  reset: () => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())

  useEffect(() => {
    saveState(state)
  }, [state])

  const markBlock = useCallback((day: number, block: BlockKey) => {
    setState((s) => completeBlock(s, day, block))
  }, [])

  const addCards = useCallback((cards: SrsCard[]) => {
    setState((s) => upsertCards(s, cards))
  }, [])

  const reviewOne = useCallback((card: SrsCard) => {
    setState((s) => updateCard(s, card))
  }, [])

  const storeWriting = useCallback((day: number, text: string) => {
    setState((s) => saveWriting(s, day, text))
  }, [])

  const importAll = useCallback((next: AppState) => {
    setState(next)
  }, [])

  const dismissGuide = useCallback(() => {
    setState((s) => ({ ...s, guideDismissed: true }))
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem('thirty-days-english:v1')
    setState(loadState())
  }, [])

  const value = useMemo(
    () => ({ state, markBlock, addCards, reviewOne, storeWriting, importAll, dismissGuide, reset }),
    [state, markBlock, addCards, reviewOne, storeWriting, importAll, dismissGuide, reset],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider')
  return ctx
}
