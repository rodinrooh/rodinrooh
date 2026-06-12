"use client";

import { useState } from "react";
import type { ProvenanceEntry } from "../../engine/envelope";

type SourcedBlockProps = {
  content: string;
  wasTruncated?: boolean;
  fullContent?: string;
  onExpand?: () => void;
  provenance: ProvenanceEntry[];
};

function relativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    wikipedia: "Wikipedia",
    "simple.wikipedia": "Simple Wikipedia",
    wikidata: "Wikidata",
    wiktionary: "Wiktionary",
    dictionaryapi: "Dictionary API",
    "open-meteo": "Open-Meteo",
    poetrydb: "PoetryDB",
    stackoverflow: "Stack Overflow",
    hackernews: "Hacker News",
    "mathjs": "math.js",
    "currency-api": "Exchange Rate API",
  };
  return labels[source] ?? source;
}

function SourceIcon({ source }: { source: string }) {
  // Minimal text-based source indicators
  const initials: Record<string, string> = {
    wikipedia: "W",
    "simple.wikipedia": "W",
    wikidata: "WD",
    wiktionary: "Wt",
    dictionaryapi: "D",
    "open-meteo": "M",
    poetrydb: "P",
    stackoverflow: "SO",
    hackernews: "HN",
    "mathjs": "∑",
    "currency-api": "$",
  };

  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-[#e5e7eb] dark:bg-[#3f3f3f] text-[9px] font-bold text-[#6b7280] dark:text-[#9ca3af] flex-shrink-0">
      {initials[source] ?? source.charAt(0).toUpperCase()}
    </span>
  );
}

function renderParagraphs(text: string) {
  const paras = text.split(/\n\n+/);
  return paras.map((para, i) => (
    <p key={i} className="leading-[1.65] mb-3 last:mb-0">
      {para.replace(/\n/g, " ")}
    </p>
  ));
}

export default function SourcedBlock({
  content,
  wasTruncated,
  fullContent,
  onExpand,
  provenance,
}: SourcedBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const handleExpand = () => {
    setExpanded(true);
    onExpand?.();
  };

  const displayContent = expanded && fullContent ? fullContent : content;

  return (
    <div className="my-3 rounded-lg border border-[#e5e7eb] dark:border-[#3f3f3f] bg-[#f7f7f8] dark:bg-[#2a2a2a] overflow-hidden">
      {/* Attribution chips row */}
      {provenance.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2 border-b border-[#e5e7eb] dark:border-[#3f3f3f]">
          {provenance.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white dark:bg-[#1f1f1f] border border-[#e5e7eb] dark:border-[#3f3f3f] text-[11px] text-[#6b7280] dark:text-[#9ca3af] hover:text-[#0d0d0d] dark:hover:text-[#ececec] hover:border-[#d1d5db] dark:hover:border-[#525252] transition-colors no-underline"
            >
              <SourceIcon source={p.source} />
              <span className="font-medium text-[#374151] dark:text-[#d1d5db]">
                {sourceLabel(p.source)}
              </span>
              {p.label && (
                <>
                  <span className="text-[#d1d5db] dark:text-[#525252]">—</span>
                  <span className="max-w-[140px] truncate">{p.label}</span>
                </>
              )}
              <span className="text-[#d1d5db] dark:text-[#525252]">—</span>
              <span>retrieved {relativeTime(p.fetchedAt)}</span>
              {p.contentTimestamp && (
                <>
                  <span className="text-[#d1d5db] dark:text-[#525252]">—</span>
                  <span>edited {relativeTime(p.contentTimestamp)}</span>
                </>
              )}
              {/* External link icon */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className="flex-shrink-0 opacity-50"
              >
                <path
                  d="M5.5 1H9v3.5M9 1L5 5M2 2.5H1v6.5h6.5V8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-3 text-[14px] text-[#0d0d0d] dark:text-[#ececec] whitespace-pre-wrap font-[inherit] leading-relaxed">
        {renderParagraphs(displayContent)}
      </div>

      {/* Truncation expand affordance */}
      {wasTruncated && !expanded && (
        <button
          onClick={handleExpand}
          className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-[#e5e7eb] dark:border-[#3f3f3f] text-[12px] text-[#6b7280] dark:text-[#9ca3af] hover:text-[#0d0d0d] dark:hover:text-[#ececec] hover:bg-[#f0f0f1] dark:hover:bg-[#333] transition-colors text-left"
        >
          <span>It gets technical from here</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="flex-shrink-0"
          >
            <path
              d="M2 4.5L6 8.5L10 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
