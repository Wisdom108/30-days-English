import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config, features } from '../config'

// Single Supabase client, created only when auth is configured. When it isn't,
// `supabase` is null and the app runs in its free/offline tier (no login, no AI).
export const supabase: SupabaseClient | null = features.auth
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/** Current access token (Supabase JWT) for authorizing Worker calls, or null. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Send a passwordless magic-link to the given email. */
export async function signInWithEmail(email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: '登录未配置' }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
  return error ? { error: error.message } : {}
}

/** Start Google OAuth sign-in. */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  if (!supabase) return { error: '登录未配置' }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  })
  return error ? { error: error.message } : {}
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}
