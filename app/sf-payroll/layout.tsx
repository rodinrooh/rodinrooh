import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "SF Payroll — every city employee, by name",
  description:
    "Every San Francisco city employee for 2025, by name, with their pay — and the overtime machine that paid hundreds of them more in OT than their salary.",
  openGraph: {
    title: "SF Payroll",
    description:
      "SF paid $482 million in overtime last year. Browse every city employee, by name, and the overtime machine with no brakes.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.className} style={{ fontFamily: inter.style.fontFamily, background: "#0a0a0c" }}>
      {children}
    </div>
  )
}
