import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Internet-airport Supabase client — lazy to avoid SSR prerender errors
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_AIRPORT_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_AIRPORT_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabase = {
  from: (...args: Parameters<SupabaseClient["from"]>) => getClient().from(...args),
}
