import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Only the public URL and publishable key reach the browser. The service key never does
// (brief §12); access is enforced by row-level security in the database.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Absolute URL inside the app, honouring the GitHub Pages base path (PLAN D-10). */
export function appUrl(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}/${path.replace(/^\//, '')}`
}
