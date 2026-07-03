import { useEffect, useRef } from 'react'
import { useAuth } from '../auth'
import { useApp } from '../state'
import { mergeStates, pullProgress, pushProgress } from '../lib/account'
import { parseImport } from '../lib/storage'

// Cloud progress sync (account mode). On sign-in: pull the cloud copy, merge it
// with local (union — never loses progress from either device), adopt + push
// back. Afterwards every local change is pushed debounced. Renders nothing.
export function CloudSync() {
  const { user, mode } = useAuth()
  const { state, importAll } = useApp()
  const synced = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const account = mode === 'account' && !!user

  // one pull+merge per login
  useEffect(() => {
    if (!account) {
      synced.current = false
      return
    }
    if (synced.current) return
    let alive = true
    ;(async () => {
      try {
        const { data } = await pullProgress()
        if (!alive) return
        // Validate the cloud blob before trusting it (same guard as file import).
        const remote = data ? parseImport(JSON.stringify(data)) : null
        if (remote) {
          const merged = mergeStates(stateRef.current, remote)
          importAll(merged)
          await pushProgress(merged)
        } else {
          await pushProgress(stateRef.current)
        }
        synced.current = true
      } catch {
        /* offline / membership disabled — retry on next login/mount */
      }
    })()
    return () => {
      alive = false
    }
  }, [account, importAll])

  // debounced push of local changes
  useEffect(() => {
    if (!account || !synced.current) return
    const t = setTimeout(() => {
      pushProgress(stateRef.current).catch(() => {})
    }, 3000)
    return () => clearTimeout(t)
  }, [state, account])

  return null
}
