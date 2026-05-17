"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import type { Tow } from "./types"

export function sfDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}

export function useTows() {
  const [tows, setTows] = useState<Tow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTows = async () => {
    const { data, error } = await supabase
      .from("tows")
      .select("*")
      .order("towed_at", { ascending: false })
    if (!error && data) {
      setTows(data as Tow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTows()
    const interval = setInterval(fetchTows, 60_000)
    return () => clearInterval(interval)
  }, [])

  const todayStr = sfDateString(new Date())
  const todayCount = tows.filter((t) => sfDateString(new Date(t.towed_at)) === todayStr).length

  return { tows, loading, todayCount, refetch: fetchTows }
}
