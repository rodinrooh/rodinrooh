import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "Every Name in the Sky",
  description:
    "There are ~69,000 named navigation waypoints floating invisibly over America. Search any word and see where it hangs in the sky.",
  icons: { icon: "/waypoints/icon" },
  openGraph: {
    title: "Every Name in the Sky",
    description: "Search any word and find out if it's a real FAA navigation waypoint over America.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ fontFamily: inter.style.fontFamily, background: "#eaeef2" }}>
      {/* Preload MapKit JS so it starts fetching before the map mounts */}
      <link rel="preload" href="https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js" as="script" />
      {children}
    </div>
  )
}
