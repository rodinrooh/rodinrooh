import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Find My Towed Car",
  description: "Live map of every car being towed in San Francisco",
  metadataBase: new URL("https://www.rodinrooh.com"),
  openGraph: {
    title: "Find My Towed Car",
    description: "Live map of every car being towed in San Francisco",
    url: "https://www.rodinrooh.com/sf-towing",
    siteName: "Find My Towed Car",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Find My Towed Car",
    description: "Live map of every car being towed in San Francisco",
    images: ["/og.png"],
  },
}

export default function SFTowingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-hidden">
      {children}
    </div>
  )
}
