import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Every Name in the Sky",
  description:
    "There are ~69,000 named navigation waypoints floating invisibly over America. Type any word and find out if it's one of them — and see exactly where it hangs in the sky.",
  icons: { icon: "/waypoints/icon" },
  openGraph: {
    title: "Every Name in the Sky",
    description:
      "Type any word and find out if it exists as a real FAA navigation waypoint floating over America.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#070a12" }}>{children}</div>
}
