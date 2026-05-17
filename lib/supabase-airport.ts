import { createClient } from "@supabase/supabase-js"

// Internet-airport Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_AIRPORT_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_AIRPORT_SUPABASE_ANON_KEY!
)
