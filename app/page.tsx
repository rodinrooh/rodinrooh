"use client"

import { useState, useEffect } from "react"

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
        <div style={{ paddingTop: 24 }}>
          <ProjectRow
            href="/sf-towing"
            title="Find My Towed Car"
            desc="Live map of every car being towed in San Francisco"
          />
          <ProjectRow
            href="/internet-airport"
            title="Internet Airport"
            desc="Live arrivals board for every domain registered today"
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

function ProjectRow({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <div className="home-press-row">
      <a href={href} target="_blank" rel="noopener noreferrer" className="home-press-date" style={{ color: "#111", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>{title}</a>
      <div style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

function PressRow({ date, href, text }: { date: string; href: string; text: string }) {
  return (
    <div className="home-press-row">
      <div className="home-press-date">{date}</div>
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{text}</a>
    </div>
  )
}
