import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getIdentity, type Identity, type AuthMode } from './lib/access'
import { features } from './config'

interface AuthCtx {
  user: Identity | null
  loading: boolean
  authEnabled: boolean
  mode: AuthMode
  refresh: () => void
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: false,
  authEnabled: false,
  mode: 'open',
  refresh: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Identity | null>(null)
  const [mode, setMode] = useState<AuthMode>('open')
  const [loading, setLoading] = useState<boolean>(features.worker)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!features.worker) return
    let alive = true
    setLoading(true)
    getIdentity().then(({ user, mode }) => {
      if (!alive) return
      setUser(user)
      setMode(mode)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [tick])

  const value = useMemo<AuthCtx>(
    () => ({ user, mode, loading, authEnabled: features.worker, refresh: () => setTick((t) => t + 1) }),
    [user, mode, loading],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  return useContext(Ctx)
}
