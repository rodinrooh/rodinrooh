import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Internet Airport",
  description: "A live arrivals board for every newly registered domain.",
}

export default function InternetAirportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
