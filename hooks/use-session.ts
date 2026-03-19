'use client'

import { useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/session-store'
import { stripAppPrefix } from '@/lib/auth-utils'

export function useSession() {
  const { user, setUser, setLoading } = useSessionStore()

  useEffect(() => {
    const supabase = createBrowserSupabase()

    // Fetch current session
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { id: u.id, email: stripAppPrefix(u.email || '') } : null)
      setLoading(false)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: stripAppPrefix(session.user.email || '') })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  return { user, isAuthenticated: !!user }
}
