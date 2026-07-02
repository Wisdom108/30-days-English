import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getIdentity, type Identity } from './lib/access'
import { features } from './config'

interface AuthCtx {
  user: Identity | null
  loading: boolean
  /** Whether auth is available (the Worker is configured). Login itself is
   *  handled by Cloudflare Access at the edge. */
  authEnabled: boolean
  refresh: () => void
}

const Ctx = createContext<AuthCtx>({ user: null, loading: false, authEnabled: false, refresh: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Identity | null>(null)
  const [loading, setLoading] = useState<boolean>(features.worker)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!features.worker) return
    let alive = true
    setLoading(true)
    getIdentity().then((id) => {
      if (!alive) return
      setUser(id)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [tick])

  const value = useMemo<AuthCtx>(
    () => ({ user, loading, authEnabled: features.worker, refresh: () => setTick((t) => t + 1) }),
    [user, loading],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  return useContext(Ctx)
}
