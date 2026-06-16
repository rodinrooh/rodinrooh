import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "notclaude",
  description:
    "Powered by the sum of all human knowledge. Wikipedia or bust. No hallucinations — just citations.",
  icons: { icon: "/notgpt/icon" },
  openGraph: {
    title: "notclaude",
    description: "Every answer is sourced. Nothing is made up.",
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
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin=""
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"
        rel="stylesheet"
      />
      <div
        className="h-full"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          backgroundColor: "#1c1c1c",
          colorScheme: "dark",
        }}
      >
        {children}
      </div>
    </>
  );
}
