import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Towing (sf-towing) Supabase client
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_TOWING_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_TOWING_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabase = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getSupabase().from(...args),
}
