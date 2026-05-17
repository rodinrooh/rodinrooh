import Image from "next/image"
import Link from "next/link"

export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#fff",
      fontFamily: "Georgia, serif",
      color: "#111",
      padding: "48px 40px",
      maxWidth: 900,
      margin: "0 auto",
    }}>
      {/* Header */}
      <h1 style={{ fontSize: 32, fontWeight: "bold", margin: 0, lineHeight: 1 }}>
        <span style={{ background: "linear-gradient(90deg, #e84393, #a855f7, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Rodin Roohipour
        </span>
      </h1>
      <p style={{ fontSize: "11pt", fontStyle: "italic", marginTop: 12, marginBottom: 0, color: "#444", lineHeight: 1.6, maxWidth: 480 }}>
        15 y/o. Founder of{" "}
        <a href="https://atova.co" target="_blank" rel="noopener noreferrer" style={{ color: "#111" }}>Atova</a>.
      </p>
      <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
        <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ fontSize: "10pt", color: "#555" }}>Twitter</a>
        <a href="https://cal.com/atova" target="_blank" rel="noopener noreferrer" style={{ fontSize: "10pt", color: "#555" }}>Book a call</a>
        <a href="mailto:rodin.avella@gmail.com" style={{ fontSize: "10pt", color: "#555" }}>Email</a>
      </div>

      {/* Project cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 40 }}>
        <ProjectCard
          href="/sf-towing"
          title="Find My Towed Car"
          desc="Live map of every car towed in SF"
          imageSrc="/preview-towing.jpg"
          imageAlt="Find My Towed Car screenshot"
        />
        <ProjectCard
          href="/internet-airport"
          title="Internet Airport"
          desc="Live arrivals board for every new domain registered"
          imageSrc="/preview-airport.png"
          imageAlt="Internet Airport screenshot"
          fallbackBg="#1e1e1e"
        />
      </div>

      {/* Press */}
      <div style={{ marginTop: 40 }}>
        <p style={{ fontSize: "10pt", margin: 0, lineHeight: 2, color: "#333" }}>
          <span style={{ background: "yellow", fontWeight: "bold", padding: "0 2px" }}>SF Standard, May 2026</span>{" · "}
          <a href="https://sfstandard.com/2026/05/14/teen-viral-sf-tow-truck-tracker-banned/" target="_blank" rel="noopener noreferrer" style={{ color: "#111", fontStyle: "italic" }}>
            Meet the teen whose viral SF tow truck tracker got banned after 3 hours.
          </a>
        </p>
        <p style={{ fontSize: "10pt", margin: 0, lineHeight: 2, color: "#333" }}>
          <span style={{ background: "yellow", fontWeight: "bold", padding: "0 2px" }}>Business Insider, Dec 2025</span>{" · "}
          <a href="https://www.businessinsider.com/student-advice-writing-cold-emails-mark-cuban-paul-graham-2025-12" target="_blank" rel="noopener noreferrer" style={{ color: "#111", fontStyle: "italic" }}>
            I&apos;m a 15-year-old who got advice from Mark Cuban and Paul Graham over email.
          </a>
        </p>
      </div>
    </div>
  )
}

function ProjectCard({
  href,
  title,
  desc,
  imageSrc,
  imageAlt,
  fallbackBg,
}: {
  href: string
  title: string
  desc: string
  imageSrc: string
  imageAlt: string
  fallbackBg?: string
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
        className="hover:shadow-lg"
      >
        {/* Preview image */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: fallbackBg ?? "#f5f5f5" }}>
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            style={{ objectFit: "cover" }}
            onError={() => {}}
          />
        </div>
        {/* Label */}
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: "bold", fontSize: "12pt" }}>{title}</div>
          <div style={{ fontSize: "10pt", color: "#666", marginTop: 2, fontStyle: "italic" }}>{desc}</div>
        </div>
      </div>
    </Link>
  )
}
