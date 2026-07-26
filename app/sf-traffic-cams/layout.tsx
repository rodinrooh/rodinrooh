import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "SF & LA Traffic Cams",
  description:
    "Live Caltrans traffic camera grid for the SF Bay Area and Los Angeles — real streaming video, not slow-refreshing stills.",
  icons: { icon: "/sf-traffic-cams/icon" },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ fontFamily: inter.style.fontFamily, letterSpacing: "-0.02em" }}>
      {children}
    </div>
  )
}
