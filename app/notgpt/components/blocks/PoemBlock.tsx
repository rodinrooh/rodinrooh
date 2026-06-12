"use client";

import type { PoemBlock as PoemBlockType } from "../../engine/envelope";

type PoemBlockProps = {
  block: PoemBlockType;
};

export default function PoemBlock({ block }: PoemBlockProps) {
  const { title, author, lines } = block;

  // Split lines into stanzas (blank lines indicate stanza breaks)
  const stanzas: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) stanzas.push(current);

  // If no stanzas parsed (no blank lines), treat all as one stanza
  const renderStanzas = stanzas.length > 0 ? stanzas : [lines];

  return (
    <div className="my-3 rounded-lg border border-[#e5e7eb] dark:border-[#3f3f3f] bg-[#f7f7f8] dark:bg-[#2a2a2a] p-5 max-w-lg">
      {/* Title + author */}
      <div className="mb-4 pb-3 border-b border-[#e5e7eb] dark:border-[#3f3f3f]">
        <h3 className="text-[14px] font-semibold text-[#0d0d0d] dark:text-[#ececec] leading-snug">
          {title}
        </h3>
        <p className="text-[12px] text-[#6b7280] dark:text-[#9ca3af] mt-0.5">
          {author}
        </p>
      </div>

      {/* Poem lines */}
      <div
        className="space-y-4 text-[14px] leading-[1.8] text-[#1f2937] dark:text-[#d1d5db]"
        style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}
      >
        {renderStanzas.map((stanza, si) => (
          <div key={si} className="space-y-0.5">
            {stanza.map((line, li) => (
              <div key={li} className="whitespace-pre-wrap">
                {line || <>&nbsp;</>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Attribution */}
      <div className="mt-4 pt-3 border-t border-[#e5e7eb] dark:border-[#3f3f3f]">
        <a
          href="https://poetrydb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#9ca3af] dark:text-[#6b7280] hover:text-[#6b7280] dark:hover:text-[#9ca3af] transition-colors no-underline"
        >
          <span>Source: PoetryDB</span>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path
              d="M4.5 1H8v3.5M8 1L4 5M1.5 2H1v6h6V7.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
