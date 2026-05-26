import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ensureProfile, setProfileStatus, setUsername } from '../lib/api'
import type { Profile, UserStatus } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  needsOnboarding: boolean
  refresh: () => Promise<void>
  saveUsername: (username: string) => Promise<{ error: string | null }>
  updateStatus: (status: UserStatus) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const p = await ensureProfile(user.id)
    setProfile(p)
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setProfile(payload.new as Profile)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const saveUsername = useCallback(
    async (username: string) => {
      if (!user) return { error: 'Not signed in' }
      const normalized = username.trim().toLowerCase()
      if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
        return { error: 'Username must be 3–20 characters: lowercase letters, numbers, underscore.' }
      }

      const { error } = await setUsername(user.id, normalized)
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          return { error: 'That username is already taken.' }
        }
        return { error: error.message }
      }

      await refresh()
      return { error: null }
    },
    [user, refresh],
  )

  const updateStatus = useCallback(
    async (status: UserStatus) => {
      if (!user) return
      await setProfileStatus(user.id, status)
      await refresh()
    },
    [user, refresh],
  )

  const needsOnboarding = !!profile && !profile.username

  const value = useMemo(
    () => ({
      profile,
      loading,
      needsOnboarding,
      refresh,
      saveUsername,
      updateStatus,
    }),
    [profile, loading, needsOnboarding, refresh, saveUsername, updateStatus],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
