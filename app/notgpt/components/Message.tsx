"use client";

import type {
  Message as MessageType,
  Block,
  ProvenanceEntry,
} from "../engine/envelope";
// SourcedBlock removed — wikipedia text streams as delta events, "Source →" link in ProvenanceFooter
import ComparisonTable from "./blocks/ComparisonTable";
import WeatherCard from "./blocks/WeatherCard";
import PoemBlock from "./blocks/PoemBlock";
import SOResults from "./blocks/SOResults";
import ClarifyPills from "./ClarifyPills";

// ---- Inline markdown renderer (bold + links only) ----
function renderInlineMarkdown(text: string): React.ReactNode {
  // Split on **bold** and [text](url) patterns
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[1]}
        </strong>
      );
    } else if (match[2] && match[3]) {
      // Link — warm orange accent
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#d4854a" }}
          className="hover:underline"
        >
          {match[2]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderMarkdownText(text: string): React.ReactNode {
  // Split into paragraphs
  const paras = text.split(/\n\n+/).filter((p) => p.trim());
  if (paras.length <= 1) {
    return (
      <span className="leading-[1.65]">{renderInlineMarkdown(text)}</span>
    );
  }
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className="leading-[1.65] mb-2 last:mb-0">
          {renderInlineMarkdown(para)}
        </p>
      ))}
    </>
  );
}

// ---- AssistantAvatar — 8-ray asterisk ----
function AssistantAvatar() {
  // 8 lines from center (7,7) outward at 45° increments, radius 5
  const center = 7;
  const r = 5;
  const lines = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 8;
    return {
      x2: center + r * Math.cos(angle),
      y2: center + r * Math.sin(angle),
    };
  });

  return (
    <div
      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center select-none"
      style={{ backgroundColor: "transparent" }}
      aria-hidden="true"
    >
      <svg width="24" height="24" viewBox="0 0 14 14" fill="none">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={l.x2}
            y2={l.y2}
            stroke="#d4854a"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

// ---- Block renderer ----
function BlockRenderer({ block }: { block: Block }) {
  const cardStyle = {
    backgroundColor: "#2a2a2a",
    border: "1px solid #3a3a3a",
  };

  switch (block.type) {
    case "wikipedia":
      return null; // text is in delta stream, no box
    case "comparison-table":
      return <ComparisonTable block={block} />;
    case "weather-card":
      return <WeatherCard block={block} />;
    case "poem":
      return <PoemBlock block={block} />;
    case "so-results":
      return <SOResults block={block} />;
    case "math":
      return (
        <div className="my-2 px-4 py-3 rounded-lg font-mono text-[14px]" style={cardStyle}>
          <span style={{ color: "#9ca3af" }}>{block.expression}</span>
          <span className="mx-2" style={{ color: "#4b5563" }}>=</span>
          <span className="font-semibold" style={{ color: "#ececec" }}>{block.result}</span>
        </div>
      );
    case "definition":
      return (
        <div className="my-3 rounded-lg p-4 max-w-lg" style={cardStyle}>
          <div className="mb-3">
            <span className="text-[16px] font-semibold" style={{ color: "#ececec" }}>
              {block.word}
            </span>
            {block.phonetic && (
              <span className="ml-2 text-[13px] font-mono" style={{ color: "#9ca3af" }}>
                {block.phonetic}
              </span>
            )}
          </div>
          {block.meanings.slice(0, 3).map((meaning, mi) => (
            <div key={mi} className="mb-2">
              <span
                className="text-[11px] font-medium uppercase tracking-wide italic"
                style={{ color: "#6b7280" }}
              >
                {meaning.partOfSpeech}
              </span>
              <ol className="mt-1 space-y-1">
                {meaning.definitions.slice(0, 2).map((def, di) => (
                  <li key={di} className="text-[13px] leading-relaxed pl-2" style={{ color: "#d1d5db" }}>
                    {di + 1}. {def.definition}
                    {def.example && (
                      <span className="block pl-3 mt-0.5 text-[12px] italic" style={{ color: "#9ca3af" }}>
                        &ldquo;{def.example}&rdquo;
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      );
    case "currency":
      return (
        <div className="my-2 px-4 py-3 rounded-lg text-[14px]" style={cardStyle}>
          <span className="font-medium" style={{ color: "#ececec" }}>
            {block.amount} {block.from}
          </span>
          <span className="mx-2" style={{ color: "#4b5563" }}>=</span>
          <span className="font-semibold" style={{ color: "#ececec" }}>
            {block.result.toFixed(2)} {block.to}
          </span>
          <span className="ml-3 text-[12px]" style={{ color: "#9ca3af" }}>
            1 {block.from} = {block.rate.toFixed(4)} {block.to} · {block.date}
          </span>
        </div>
      );
    case "unit":
      return (
        <div className="my-2 px-4 py-3 rounded-lg font-mono text-[14px]" style={cardStyle}>
          <span style={{ color: "#ececec" }}>
            {block.value} {block.fromUnit}
          </span>
          <span className="mx-2" style={{ color: "#4b5563" }}>=</span>
          <span className="font-semibold" style={{ color: "#ececec" }}>
            {block.result} {block.toUnit}
          </span>
        </div>
      );
    case "time":
      return (
        <div className="my-2 px-4 py-3 rounded-lg text-[14px]" style={cardStyle}>
          <span className="font-semibold" style={{ color: "#ececec" }}>{block.display}</span>
          <span className="ml-2 text-[12px]" style={{ color: "#9ca3af" }}>{block.timezone}</span>
        </div>
      );
    default:
      return null;
  }
}

// ---- Streaming dots ----
function StreamingDots() {
  return (
    <span className="inline-flex gap-0.5 items-center ml-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full opacity-60"
          style={{
            backgroundColor: "#d4854a",
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

// ---- Provenance footer ----
// Shows article title + link as a small source badge
function ProvenanceFooter({ provenance }: { provenance: ProvenanceEntry[] }) {
  // Only show links to real external sources (not local-computation, social responses, etc.)
  const externalSources = provenance.filter(
    (p) => p.url && p.source !== "local-computation" && p.source !== "static-dataset"
  );
  if (!externalSources.length) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {externalSources.map((p, i) => (
        <a
          key={i}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] no-underline transition-colors hover:opacity-80"
          style={{
            backgroundColor: "#242424",
            border: "1px solid #383838",
            color: "#6b6b6b",
          }}
        >
          {/* Wikipedia W icon */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="5" r="4.5" stroke="#6b7280" strokeWidth="1" />
            <text x="5" y="8" textAnchor="middle" fontSize="6" fontWeight="700" fill="#6b7280" fontFamily="serif">W</text>
          </svg>
          <span>{p.label || "Source"}</span>
          <span style={{ color: "#4b5563" }}>→</span>
        </a>
      ))}
    </div>
  );
}

// ---- Main Message component ----
type MessageProps = {
  message: MessageType;
  onClarify: (query: string) => void;
};

export default function Message({ message, onClarify }: MessageProps) {
  const { role, content, blocks, provenance, clarify, status, isStreaming } =
    message;

  // ---- User message — right-aligned bubble ----
  if (role === "user") {
    return (
      <div className="flex justify-end px-4 py-2">
        <div
          className="max-w-[85%] sm:max-w-[70%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
          style={{
            backgroundColor: "#2a2a2a",
            color: "#e5e5e5",
            borderRadius: 18,
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // ---- Assistant message ----
  return (
    <div className="flex gap-3 px-4 py-4">
      {/* Avatar */}
      <div className="pt-0.5">
        <AssistantAvatar />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-[calc(100%-44px)]">
        {/* Streaming status — before content appears */}
        {isStreaming && status && !content && (
          <div className="flex items-center gap-2 text-[13px] mb-2" style={{ color: "#9ca3af" }}>
            <span>{status}</span>
            <StreamingDots />
          </div>
        )}

        {/* Main text content */}
        {content && (
          <div className="text-[14px] leading-[1.65]" style={{ color: "#e5e5e5" }}>
            {renderMarkdownText(content)}
            {isStreaming && (
              <span
                className="inline-block w-0.5 h-[1em] ml-0.5 align-middle"
                style={{
                  backgroundColor: "#d4854a",
                  animation: "blink 1s step-end infinite",
                }}
              />
            )}
            <style>{`
              @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            `}</style>
          </div>
        )}

        {/* Streaming status below content */}
        {isStreaming && status && content && (
          <div className="flex items-center gap-1.5 text-[12px] mt-1.5" style={{ color: "#9ca3af" }}>
            <span>{status}</span>
            <StreamingDots />
          </div>
        )}

        {/* Structured blocks */}
        {blocks && blocks.length > 0 && (
          <div className="mt-1">
            {blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>
        )}

        {/* Clarify pills */}
        {clarify && (
          <ClarifyPills
            question={clarify.question}
            options={clarify.options}
            onSelect={onClarify}
          />
        )}

        {/* Provenance footer */}
        {!isStreaming && provenance && provenance.length > 0 && (
          <ProvenanceFooter provenance={provenance} />
        )}
      </div>
    </div>
  );
}
