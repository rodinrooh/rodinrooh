import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "SF Meters",
  description: "Live SF parking meter revenue tracker — watch the money roll in.",
  icons: { icon: "/favicon-meters.svg" },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={inter.className} style={{ fontFamily: inter.style.fontFamily }}>{children}</div>
}
