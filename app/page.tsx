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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 40 }}>
        {/* SF Towing card — has real screenshot */}
        <Link href="/sf-towing" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }} className="hover:shadow-lg">
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
              <Image src="/preview-towing.jpg" alt="Find My Towed Car" fill style={{ objectFit: "cover" }} />
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: "bold", fontSize: "12pt" }}>Find My Towed Car</div>
              <div style={{ fontSize: "10pt", color: "#666", marginTop: 2, fontStyle: "italic" }}>Live map of every car towed in SF</div>
            </div>
          </div>
        </Link>

        <Link href="/internet-airport" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }} className="hover:shadow-lg">
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
              <Image src="/preview-airport.png" alt="Internet Airport" fill style={{ objectFit: "cover" }} />
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontWeight: "bold", fontSize: "12pt" }}>Internet Airport</div>
              <div style={{ fontSize: "10pt", color: "#666", marginTop: 2, fontStyle: "italic" }}>Live arrivals board for every new domain registered</div>
            </div>
          </div>
        </Link>
      </div>

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
