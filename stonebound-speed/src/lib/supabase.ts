import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Supabase browser client — set VITE_SUPABASE_* in .env.local */
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}
