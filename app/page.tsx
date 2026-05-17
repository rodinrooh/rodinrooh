"use client"

import Image from "next/image"
import { useState, useEffect } from "react"

const COLORS = ["#f97316", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6", "#e879f9", "#4ade80", "#fb923c"]

export default function Home() {
  const [bgColor, setBgColor] = useState(COLORS[0])
  useEffect(() => {
    setBgColor(COLORS[Math.floor(Math.random() * COLORS.length)])
  }, [])

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>

      {/* Header — name only */}
      <div style={{ background: bgColor }}>
        <div style={{ maxWidth: 1196, margin: "0 auto", padding: "108px 48px 116px" }}>
          <h1 style={{ fontSize: 60, fontWeight: 800, margin: 0, color: "#111", letterSpacing: "-2px", lineHeight: 1 }}>
            Rodin Roohipour
          </h1>
        </div>
      </div>

      {/* Everything below header */}
      <div style={{ maxWidth: 1196, margin: "0 auto", padding: "40px 48px 64px" }}>

        {/* Blurb + links */}
        <p style={{ fontSize: 18, color: "#222", margin: "0 0 10px", lineHeight: 1.7, maxWidth: 640 }}>
          I&apos;m 15 and I&apos;ve been building companies since I was 13. Currently running Atova — previously ChampionPac.
          I ship things fast, some go viral, some get written up in SF Standard or Business Insider.
          I&apos;ve cold emailed Mark Cuban and Paul Graham. They wrote back.
        </p>
        <div style={{ fontSize: 15, color: "#555", marginBottom: 48 }}>
          <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#111" }}>Twitter</a>
          {" · "}
          <a href="mailto:rodin.avella@gmail.com" style={{ color: "#111" }}>Email</a>
        </div>

        {/* Projects */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px 56px" }}>
          <ProjectCard
            href="/sf-towing"
            img="/preview-towing.jpg"
            title="Find My Towed Car"
            desc="Live map of every car being towed in San Francisco"
          />
          <ProjectCard
            href="/internet-airport"
            img="/preview-airport.png"
            title="Internet Airport"
            desc="Live arrivals board for every domain registered today"
          />
        </div>

        {/* Press */}
        <div style={{ marginTop: 56, borderTop: "1px solid #eee", paddingTop: 32 }}>
          <PressRow
            date="May 2026 · SF Standard"
            href="https://sfstandard.com/2026/05/14/teen-viral-sf-tow-truck-tracker-banned/"
            text="Meet the teen whose viral SF tow truck tracker got banned after 3 hours."
          />
          <PressRow
            date="Dec 2025 · Business Insider"
            href="https://www.businessinsider.com/student-advice-writing-cold-emails-mark-cuban-paul-graham-2025-12"
            text="I'm a 15-year-old who got advice from Mark Cuban and Paul Graham over email. Here's how I craft my cold reach-outs."
          />
        </div>
      </div>
    </div>
  )
}

function ProjectCard({ href, img, title, desc }: { href: string; img: string; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", gap: 14, textDecoration: "none", color: "inherit" }}>
      <div style={{ position: "relative", width: "100%", height: 220, borderRadius: 8, overflow: "hidden", background: "#f0f0f0" }}>
        <Image src={img} alt={title} fill style={{ objectFit: "cover" }} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#111" }}>{title}</div>
        <div style={{ fontSize: 15, color: "#888", marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </a>
  )
}

function PressRow({ date, href, text }: { date: string; href: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "baseline" }}>
      <div style={{ fontSize: 13, color: "#aaa", whiteSpace: "nowrap", minWidth: 180 }}>{date}</div>
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{text}</a>
    </div>
  )
}
