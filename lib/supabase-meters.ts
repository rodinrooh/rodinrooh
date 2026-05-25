import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// sf-meters Supabase client — lazy to avoid SSR prerender errors
let _client: SupabaseClient | null = null

export function getSupabaseMeters(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_METERS_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_METERS_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabaseMeters = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getSupabaseMeters().from(...args),
}
