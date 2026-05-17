"use client"

import Image from "next/image"
import { useState } from "react"

const COLORS = ["#f97316", "#a78bfa", "#34d399", "#fb7185", "#fbbf24", "#60a5fa", "#f472b6", "#e879f9", "#4ade80", "#fb923c"]

export default function Home() {
  const [bgColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)])

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: bgColor }}>
        <div style={{ maxWidth: 1196, margin: "0 auto", padding: "48px 48px 52px" }}>
          <h1 style={{ fontSize: 56, fontWeight: 800, margin: 0, color: "#111", letterSpacing: "-1px" }}>
            Rodin Roohipour
          </h1>
          <p style={{ fontSize: 18, color: "#222", margin: "20px 0 0", lineHeight: 1.65, maxWidth: 620 }}>
            I&apos;m 15 and I build things people actually use. I made the SF tow truck tracker
            that went viral and got banned after 3 hours, and Internet Airport — a live arrivals
            board for every domain registered today. SF Standard and Business Insider have written about me.
          </p>
          <div style={{ marginTop: 16, fontSize: 15, color: "#333" }}>
            <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#111" }}>Twitter</a>
            {" · "}
            <a href="mailto:rodin.avella@gmail.com" style={{ color: "#111" }}>Email</a>
          </div>
        </div>
      </div>

      {/* Projects */}
      <div style={{ maxWidth: 1196, margin: "0 auto", padding: "48px 48px" }}>
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
            text="I'm a 15-year-old who got advice from Mark Cuban and Paul Graham over email."
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
