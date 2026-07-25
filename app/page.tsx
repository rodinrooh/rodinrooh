"use client"

import React, { useState, useEffect } from "react"

export default function Home() {
  const [bgColor, setBgColor] = useState("hsl(30, 65%, 38%)")
  useEffect(() => {
    const h = Math.floor(Math.random() * 360)
    setBgColor(`hsl(${h}, 65%, 38%)`)
  }, [])

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>

      {/* Header — name only */}
      <div style={{ background: bgColor }}>
        <div className="home-header-pad">
          <h1 className="home-h1">
            Rodin Roohipour
          </h1>
        </div>
      </div>

      {/* Everything below header */}
      <div className="home-content">

        {/* Blurb + links */}
        <p style={{ fontSize: 16, color: "#333", margin: "0 0 10px", lineHeight: 1.7, maxWidth: 580 }}>
          I&apos;m 15. I ship things fast and some go viral. I&apos;m also cracked at cold emailing.
        </p>
        <div style={{ fontSize: 15, color: "#555", paddingBottom: 32, borderBottom: "1px solid #eee" }}>
          <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#111", textDecoration: "underline" }}>Twitter</a>
          {" · "}
          <a href="mailto:rodin.avella@gmail.com" style={{ color: "#111", textDecoration: "underline" }}>Email</a>
        </div>

        {/* Projects */}
        <div style={{ paddingTop: 32 }}>
          <ProjectRow
            href="/sf-muni"
            date="May 2026"
            title="SF Muni Latency"
            desc="Live map of every Muni bus in SF, colored by how late it is"
          />
          <ProjectRow
            href="/sf-meters"
            date="May 2026"
            title="SF Meter Revenues"
            desc="Live tracker of how much money SF collects from parking meters"
          />
          <ProjectRow
            href="/internet-airport"
            date="May 2026"
            title="Internet Airport"
            desc="Live board showing every domain registered in real time"
          />
          <ProjectRow
            href="/sf-towing"
            date="May 2026"
            title="Find My Towed Car"
            desc="Live map of every car being towed in San Francisco"
          />
        </div>

        {/* Press */}
        <div style={{ marginTop: 32, borderTop: "1px solid #eee", paddingTop: 32 }}>
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

function ProjectRow({ href, date, title, desc }: { href: string; date: string; title: React.ReactNode; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="home-press-row" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="home-press-date">{date} · {title}</div>
      <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{desc}</div>
    </a>
  )
}

function PressRow({ date, href, text }: { date: string; href: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="home-press-row" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="home-press-date">{date}</div>
      <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{text}</div>
    </a>
  )
}
