import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "SF Meters",
  description: "Live SF parking meter revenue tracker — watch the money roll in.",
  icons: { icon: "/favicon-meters.png" },
  openGraph: {
    images: [{ url: "/sf-meters-og.png", width: 1393, height: 862 }],
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ fontFamily: inter.style.fontFamily }}>
      {/* Preload MapKit JS so it starts fetching before the map component mounts */}
      <link rel="preload" href="https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js" as="script" />
      {children}
    </div>
  )
}
