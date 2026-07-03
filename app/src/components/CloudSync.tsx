import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'
import { useAuth } from '../auth'
import { useApp } from '../state'
import { mergeStates, pullProgress, pushProgress } from '../lib/account'
import { defaultState, parseImport } from '../lib/storage'

// Which account this browser last synced — so a DIFFERENT user logging in adopts
// the cloud copy instead of bleeding the previous user's local progress into it.
const SYNC_OWNER = 'sync:owner'

// Compare two states ignoring updatedAt, so a timestamp-only delta doesn't loop.
const sameContent = (a: AppState, b: AppState) =>
  JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 })

// Cloud progress sync (account mode). One sync = pull → merge → adopt → push, so
// concurrent devices CONVERGE (union completion + last-writer edits) instead of a
// stale tab clobbering newer cloud data. Runs on login and debounced after local
// changes; retries on failure. Renders nothing.
export function CloudSync() {
  const { user, mode } = useAuth()
  const { state, importAll } = useApp()
  // Only REAL D1 accounts sync (a passcode/Access "owner" has no /progress store).
  const owner = mode === 'account' && user?.account ? user.email : null

  const stateRef = useRef(state)
  stateRef.current = state
  const adoptedFor = useRef<string | null>(null)
  const [retry, setRetry] = useState(0)

  const runSync = useCallback(
    async (initial: boolean) => {
      const me = owner
      if (!me) return
      const { data } = await pullProgress()
      if (owner !== me) return // account switched mid-flight
      const remote = data ? parseImport(JSON.stringify(data)) : null
      const prevOwner = localStorage.getItem(SYNC_OWNER)

      let next: AppState
      if (initial && prevOwner && prevOwner !== me) {
        // a DIFFERENT account used this browser → adopt cloud, never bleed local
        next = remote ?? defaultState()
      } else {
        // same user (or first-time adopting anonymous local progress into it)
        next = remote ? mergeStates(stateRef.current, remote) : stateRef.current
      }
      localStorage.setItem(SYNC_OWNER, me)

      // adopt merged locally only if it actually changed (else we'd re-trigger the
      // debounced effect forever)
      if (!sameContent(next, stateRef.current)) importAll(next)
      // push only if the cloud differs from the merged result
      if (!remote || !sameContent(next, remote)) await pushProgress(next)
    },
    [owner, importAll],
  )

  // initial adopt on login / owner change — retry until it lands
  useEffect(() => {
    if (!owner) {
      adoptedFor.current = null
      return
    }
    if (adoptedFor.current === owner) return
    let alive = true
    runSync(true)
      .then(() => {
        if (alive) adoptedFor.current = owner
      })
      .catch(() => {
        if (alive) setTimeout(() => setRetry((r) => r + 1), 15000)
      })
    return () => {
      alive = false
    }
  }, [owner, retry, runSync])

  // debounced re-sync after local changes (pull-merge-push, not a blind push)
  useEffect(() => {
    if (!owner || adoptedFor.current !== owner) return
    const t = setTimeout(() => {
      runSync(false).catch(() => {})
    }, 3000)
    return () => clearTimeout(t)
  }, [state, owner, runSync])

  return null
}
