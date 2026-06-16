import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "notgpt",
  description:
    "Powered by the sum of all human knowledge. Wikipedia or bust. No hallucinations — just citations.",
  icons: { icon: "/notgpt/icon" },
  openGraph: {
    title: "notgpt",
    description:
      "Every answer is sourced. Nothing is made up.",
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
    <div
      className={`${inter.className} h-full`}
      style={{
        fontFamily: inter.style.fontFamily,
        backgroundColor: "#1a1a1a",
        colorScheme: "dark",
      }}
    >
      {children}
    </div>
  );
}
