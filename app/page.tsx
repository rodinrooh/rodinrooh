import Image from "next/image"

export default function Home() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#fff", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: "#f97316", padding: "48px 48px 52px" }}>
        <h1 style={{ fontSize: 52, fontWeight: 800, margin: 0, color: "#111", letterSpacing: "-1px" }}>
          Rodin Roohipour
        </h1>
        <p style={{ fontSize: 16, color: "#333", margin: "14px 0 0", lineHeight: 1.6, maxWidth: 480 }}>
          15 y/o.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 18 }}>
          <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#111", fontSize: 14 }}>My Twitter</a>
          <a href="mailto:rodin.avella@gmail.com" style={{ color: "#111", fontSize: 14 }}>Email</a>
        </div>
      </div>

      {/* Projects */}
      <div style={{ padding: "40px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px 56px" }}>
          <ProjectRow
            href="/sf-towing"
            img="/preview-towing.jpg"
            title="Find My Towed Car"
            desc="Live map of every car being towed in San Francisco"
          />
          <ProjectRow
            href="/internet-airport"
            img="/preview-airport.png"
            title="Internet Airport"
            desc="Live arrivals board for every domain registered today"
          />
        </div>

        {/* Press */}
        <div style={{ marginTop: 48, borderTop: "1px solid #eee", paddingTop: 32 }}>
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

function ProjectRow({ href, img, title, desc }: { href: string; img: string; title: string; desc: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 18, alignItems: "flex-start", textDecoration: "none", color: "inherit" }}>
      <div style={{ position: "relative", width: 240, height: 150, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f0f0f0" }}>
        <Image src={img} alt={title} fill style={{ objectFit: "cover" }} />
      </div>
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>{title}:</div>
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
