"use client";

import type {
  Message as MessageType,
  Block,
  ProvenanceEntry,
} from "../engine/envelope";
import SourcedBlock from "./blocks/SourcedBlock";
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
      // Link
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#10a37f] hover:underline"
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

// ---- AssistantAvatar ----
function AssistantAvatar() {
  return (
    <div
      className="flex-shrink-0 w-7 h-7 rounded-full bg-[#10a37f] flex items-center justify-center text-white select-none"
      aria-hidden="true"
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "line-through",
          textDecorationColor: "#ef4444",
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >
        G
      </span>
    </div>
  );
}

// ---- Block renderer ----
function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "wikipedia":
      // Wikipedia text is already rendered as delta stream. No box needed.
      return null;
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
        <div className="my-2 px-4 py-3 rounded-lg bg-[#f7f7f8] dark:bg-[#2a2a2a] border border-[#e5e7eb] dark:border-[#3f3f3f] font-mono text-[14px]">
          <span className="text-[#6b7280] dark:text-[#9ca3af]">
            {block.expression}
          </span>
          <span className="text-[#d1d5db] dark:text-[#525252] mx-2">=</span>
          <span className="font-semibold text-[#0d0d0d] dark:text-[#ececec]">
            {block.result}
          </span>
        </div>
      );
    case "definition":
      return (
        <div className="my-3 rounded-lg border border-[#e5e7eb] dark:border-[#3f3f3f] bg-[#f7f7f8] dark:bg-[#2a2a2a] p-4 max-w-lg">
          <div className="mb-3">
            <span className="text-[16px] font-semibold text-[#0d0d0d] dark:text-[#ececec]">
              {block.word}
            </span>
            {block.phonetic && (
              <span className="ml-2 text-[13px] text-[#9ca3af] font-mono">
                {block.phonetic}
              </span>
            )}
          </div>
          {block.meanings.slice(0, 3).map((meaning, mi) => (
            <div key={mi} className="mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af] dark:text-[#6b7280] italic">
                {meaning.partOfSpeech}
              </span>
              <ol className="mt-1 space-y-1">
                {meaning.definitions.slice(0, 2).map((def, di) => (
                  <li key={di} className="text-[13px] text-[#374151] dark:text-[#d1d5db] leading-relaxed pl-2">
                    {di + 1}. {def.definition}
                    {def.example && (
                      <span className="block pl-3 mt-0.5 text-[12px] text-[#9ca3af] italic">
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
        <div className="my-2 px-4 py-3 rounded-lg bg-[#f7f7f8] dark:bg-[#2a2a2a] border border-[#e5e7eb] dark:border-[#3f3f3f] text-[14px]">
          <span className="font-medium text-[#0d0d0d] dark:text-[#ececec]">
            {block.amount} {block.from}
          </span>
          <span className="text-[#d1d5db] dark:text-[#525252] mx-2">=</span>
          <span className="font-semibold text-[#0d0d0d] dark:text-[#ececec]">
            {block.result.toFixed(2)} {block.to}
          </span>
          <span className="ml-3 text-[12px] text-[#9ca3af]">
            1 {block.from} = {block.rate.toFixed(4)} {block.to} · {block.date}
          </span>
        </div>
      );
    case "unit":
      return (
        <div className="my-2 px-4 py-3 rounded-lg bg-[#f7f7f8] dark:bg-[#2a2a2a] border border-[#e5e7eb] dark:border-[#3f3f3f] font-mono text-[14px]">
          <span className="text-[#0d0d0d] dark:text-[#ececec]">
            {block.value} {block.fromUnit}
          </span>
          <span className="text-[#d1d5db] dark:text-[#525252] mx-2">=</span>
          <span className="font-semibold text-[#0d0d0d] dark:text-[#ececec]">
            {block.result} {block.toUnit}
          </span>
        </div>
      );
    case "time":
      return (
        <div className="my-2 px-4 py-3 rounded-lg bg-[#f7f7f8] dark:bg-[#2a2a2a] border border-[#e5e7eb] dark:border-[#3f3f3f] text-[14px]">
          <span className="font-semibold text-[#0d0d0d] dark:text-[#ececec]">
            {block.display}
          </span>
          <span className="ml-2 text-[12px] text-[#9ca3af]">{block.timezone}</span>
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
          className="w-1 h-1 rounded-full bg-current opacity-60"
          style={{
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
// Shows a single unobtrusive "Source →" link. Multiple sources get comma-separated links.
function ProvenanceFooter({ provenance }: { provenance: ProvenanceEntry[] }) {
  // Only show links to real external sources (not local-computation, social responses, etc.)
  const externalSources = provenance.filter(
    (p) => p.url && p.source !== "local-computation" && p.source !== "static-dataset"
  );
  if (!externalSources.length) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      {externalSources.map((p, i) => (
        <a
          key={i}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[#9ca3af] dark:text-[#6b7280] hover:text-[#6b7280] dark:hover:text-[#9ca3af] transition-colors no-underline"
        >
          Source →
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

  // ---- User message ----
  if (role === "user") {
    return (
      <div className="flex justify-end px-4 py-2 group">
        <div className="max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl bg-[#f4f4f4] dark:bg-[#2f2f2f] text-[14px] text-[#0d0d0d] dark:text-[#ececec] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  // ---- Assistant message ----
  return (
    <div className="flex gap-3 px-4 py-4 group">
      {/* Avatar */}
      <div className="pt-0.5">
        <AssistantAvatar />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-[calc(100%-44px)]">
        {/* Streaming status */}
        {isStreaming && status && !content && (
          <div className="flex items-center gap-2 text-[13px] text-[#9ca3af] dark:text-[#6b7280] mb-2">
            <span>{status}</span>
            <StreamingDots />
          </div>
        )}

        {/* Main text content */}
        {content && (
          <div className="text-[14px] text-[#0d0d0d] dark:text-[#ececec] leading-[1.65]">
            {renderMarkdownText(content)}
            {isStreaming && (
              <span
                className="inline-block w-0.5 h-[1em] bg-current ml-0.5 align-middle"
                style={{ animation: "blink 1s step-end infinite" }}
              />
            )}
            <style>{`
              @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            `}</style>
          </div>
        )}

        {/* Streaming status below content */}
        {isStreaming && status && content && (
          <div className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] dark:text-[#6b7280] mt-1.5">
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
