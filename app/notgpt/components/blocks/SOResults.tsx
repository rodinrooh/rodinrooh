"use client";

import type { SOResultsBlock } from "../../engine/envelope";

type SOResultsProps = {
  block: SOResultsBlock;
};

export default function SOResults({ block }: SOResultsProps) {
  const { question, hits } = block;

  if (!hits.length) return null;

  return (
    <div className="my-3 rounded-lg border border-[#e5e7eb] dark:border-[#3f3f3f] bg-[#f7f7f8] dark:bg-[#2a2a2a] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[#e5e7eb] dark:border-[#3f3f3f] flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="flex-shrink-0"
        >
          <rect
            x="1"
            y="1"
            width="12"
            height="12"
            rx="1.5"
            fill="#f48024"
          />
          <path
            d="M4 9.5h6M4 7.5h6M5.5 5.5h3"
            stroke="white"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[12px] font-medium text-[#6b7280] dark:text-[#9ca3af]">
          Stack Overflow
        </span>
        {question && (
          <>
            <span className="text-[#d1d5db] dark:text-[#525252]">—</span>
            <span className="text-[12px] text-[#9ca3af] dark:text-[#6b7280] truncate max-w-[200px]">
              &ldquo;{question}&rdquo;
            </span>
          </>
        )}
      </div>

      {/* Results list */}
      <ul className="divide-y divide-[#e5e7eb] dark:divide-[#3f3f3f]">
        {hits.map((hit, i) => (
          <li key={i} className="px-4 py-3 hover:bg-[#f0f0f1] dark:hover:bg-[#333] transition-colors">
            <a
              href={hit.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block no-underline"
            >
              <div className="flex items-start gap-3">
                {/* Score + accepted indicator */}
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5 min-w-[36px]">
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      hit.score > 0
                        ? "text-[#374151] dark:text-[#d1d5db]"
                        : "text-[#9ca3af]"
                    }`}
                  >
                    {hit.score}
                  </span>
                  {hit.hasAcceptedAnswer ? (
                    <span
                      className="flex items-center justify-center w-4 h-4 rounded-sm bg-[#2e7d32] text-white"
                      title="Has accepted answer"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5L4 7L8 3"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-sm border border-[#d1d5db] dark:border-[#525252]" />
                  )}
                </div>

                {/* Title + tags */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#10a37f] hover:text-[#0d8f6e] leading-snug mb-1.5 font-medium">
                    {/* Strip HTML entities from title */}
                    {hit.title
                      .replace(/&amp;/g, "&")
                      .replace(/&lt;/g, "<")
                      .replace(/&gt;/g, ">")
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")}
                  </p>
                  {hit.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {hit.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#dbeafe] dark:bg-[#1e3a5f] text-[#1e40af] dark:text-[#93c5fd] font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {/* Attribution */}
      <div className="px-4 py-2 border-t border-[#e5e7eb] dark:border-[#3f3f3f]">
        <a
          href="https://stackoverflow.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#9ca3af] dark:text-[#6b7280] hover:text-[#6b7280] dark:hover:text-[#9ca3af] transition-colors no-underline"
        >
          <span>Source: Stack Overflow via Stack Exchange API</span>
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
