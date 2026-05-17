import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Rodin Roohipour",
  description: "Rodin Roohipour",
  icons: { icon: "/icon.svg?v=2" },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className="h-full"
        style={{
          fontFamily:
            '-apple-system, "SF Pro Display", "SF Pro Text", BlinkMacSystemFont, "Helvetica Neue", sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
