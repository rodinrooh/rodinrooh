import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Internet Airport",
  description: "A live arrivals board for every newly registered domain.",
  icons: { icon: "/internet-airport/icon.svg?v=2" },
}

export default function InternetAirportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
