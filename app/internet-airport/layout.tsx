import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Internet Airport",
  description: "A live arrivals board for every newly registered domain.",
  icons: { icon: "/favicon-plane.png" },
}

export default function InternetAirportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
