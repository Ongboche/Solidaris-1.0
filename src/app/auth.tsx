import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { IDLE_TIMEOUT_MINUTES } from '../lib/flags'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  institution_name: string | null
  position: string | null
  country: string | null
  discipline: string | null
  orcid: string | null
  platform_role: 'platform_admin' | 'institution_admin' | 'member'
  consent_processing_at: string | null
  consent_handling_at: string | null
  consent_email_at: string | null
}

interface AuthState {
  session: Session | null
  loading: boolean
  profile: Profile | null
  profileLoading: boolean
  hasConsented: boolean
  signedOutForIdle: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<unknown>
}

const AuthContext = createContext<AuthState | null>(null)

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedOutForIdle, setSignedOutForIdle] = useState(false)
  const queryClient = useQueryClient()
  const idleTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) queryClient.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data as Profile
    },
  })

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Session timeout after inactivity (brief §12).
  useEffect(() => {
    if (!session) return
    const reset = () => {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        setSignedOutForIdle(true)
        void supabase.auth.signOut()
      }, IDLE_TIMEOUT_MINUTES * 60_000)
    }
    reset()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(idleTimer.current)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [session])

  const profile = profileQuery.data ?? null
  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      profile,
      profileLoading: profileQuery.isLoading,
      hasConsented: Boolean(profile?.consent_processing_at && profile?.consent_handling_at),
      signedOutForIdle,
      signOut,
      refreshProfile: () => profileQuery.refetch(),
    }),
    [session, loading, profile, profileQuery, signedOutForIdle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
