import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Freelist",
  description: "The SF Bay Area craigslist free section",
  metadataBase: new URL("https://www.rodinrooh.com"),
  openGraph: {
    title: "Freelist",
    description: "The SF Bay Area craigslist free section",
    url: "https://www.rodinrooh.com/sf-craigslist",
    siteName: "Freelist",
    type: "website",
  },
}

export default function SFCraigslistLayout({ children }: { children: React.ReactNode }) {
  return children
}
