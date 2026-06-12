import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "chatGPT",
  description:
    "ChatGPT, but every answer comes from a real source. No AI. No hallucinations. Just Wikipedia, a dictionary, and the truth.",
  icons: { icon: "/notgpt/icon" },
  openGraph: {
    title: "chatGPT",
    description:
      "Looks like ChatGPT. Runs on Wikipedia. Every answer is sourced.",
    type: "website",
    url: "https://rodinrooh.com/notgpt",
  },
};

export default function NotGPTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body
        className="h-full bg-white dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec]"
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
