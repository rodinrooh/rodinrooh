export default function Home() {
  return (
    <div style={{
      maxWidth: 400,
      margin: "auto",
      lineHeight: 1.6,
      padding: "0 20px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "flex-start",
      height: "100vh",
      fontFamily: "Georgia, serif",
      color: "#111",
      background: "white",
    }}>
      <h1 style={{ fontSize: 30, fontWeight: "bold", marginBottom: "0.5rem" }}>
        Rodin Roohipour
      </h1>

      <p style={{ fontSize: "11pt", fontStyle: "italic", marginBottom: "1.5rem", lineHeight: 1.5 }}>
        I&apos;m 15 and the founder of{" "}
        <a href="https://atova.co" target="_blank" rel="noopener noreferrer" style={{ color: "black" }}>
          Atova
        </a>
        , a system that maps invisible credibility in your network. Previously, I founded ChampionPac and
        built a partnership with Trump National Golf Club.
      </p>

      <div style={{ marginBottom: "0.5rem" }}>
        <a href="https://twitter.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ marginRight: 15, fontSize: "11pt", color: "black" }}>
          Twitter
        </a>
        <a href="https://cal.com/atova" target="_blank" rel="noopener noreferrer" style={{ marginRight: 15, fontSize: "11pt", color: "black" }}>
          Book a Call
        </a>
        <a href="mailto:rodin.avella@gmail.com" style={{ fontSize: "11pt", color: "black" }}>
          Email
        </a>
      </div>

      <h2 style={{ marginTop: "2rem", marginBottom: "0.5rem", fontSize: "13pt", fontWeight: "bold" }}>
        Projects
      </h2>
      <div style={{ fontSize: "11pt" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <a href="/sf-towing" style={{ color: "black", fontStyle: "italic" }}>
            Find My Towed Car
          </a>{" "}
          — live map of every car towed in SF
        </div>
        <div>
          <a href="/internet-airport" style={{ color: "black", fontStyle: "italic" }}>
            Internet Airport
          </a>{" "}
          — live arrivals board for every new domain registered
        </div>
      </div>

      <h2 style={{ marginTop: "2rem", marginBottom: "0.5rem", fontSize: "13pt", fontWeight: "bold" }}>
        Recent
      </h2>
      <div style={{ fontSize: "11pt" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <span style={{ background: "yellow", fontWeight: "bold" }}>14 May 2026 (SF Standard)</span>{" "}
          »{" "}
          <a
            href="https://sfstandard.com/2026/05/14/teen-viral-sf-tow-truck-tracker-banned/"
            style={{ fontStyle: "italic", color: "black" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Meet the teen whose viral SF tow truck tracker got banned after 3 hours.
          </a>
        </div>
        <div>
          <span style={{ background: "yellow", fontWeight: "bold" }}>30 December 2025 (Business Insider)</span>{" "}
          »{" "}
          <a
            href="https://www.businessinsider.com/student-advice-writing-cold-emails-mark-cuban-paul-graham-2025-12"
            style={{ fontStyle: "italic", color: "black" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            I&apos;m a 15-year-old who got advice from Mark Cuban and Paul Graham over email. Here&apos;s how I craft my cold reach-outs.
          </a>
        </div>
      </div>
    </div>
  )
}
