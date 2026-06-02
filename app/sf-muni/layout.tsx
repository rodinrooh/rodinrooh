import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "SF Muni Latency",
  description:
    "Every Muni bus in San Francisco, live, colored by how late it is. Voters mandated 85% on-time in 1999. Muni has never hit it.",
  // Override the root favicon (/icon-blue.png) with this route's 🚍 icon.
  icons: { icon: "/sf-muni/icon" },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ fontFamily: inter.style.fontFamily, letterSpacing: "-0.02em" }}>
      {/* Preload MapKit JS so it starts fetching before the map component mounts */}
      <link rel="preload" href="https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js" as="script" />
      {children}
    </div>
  )
}
