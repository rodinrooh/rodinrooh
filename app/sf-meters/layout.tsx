import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "SF Meters",
  description: "Live SF parking meter revenue tracker — watch the money roll in.",
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
