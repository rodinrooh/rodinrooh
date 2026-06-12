"use client";

import type { ClarifyOption } from "../engine/envelope";

type ClarifyPillsProps = {
  question: string;
  options: ClarifyOption[];
  onSelect: (query: string) => void;
};

export default function ClarifyPills({
  question,
  options,
  onSelect,
}: ClarifyPillsProps) {
  if (!options.length) return null;

  return (
    <div className="mt-3">
      <p className="text-[13px] text-[#374151] dark:text-[#d1d5db] mb-2 leading-snug">
        {question}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onSelect(opt.query)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e5e7eb] dark:border-[#3f3f3f] bg-white dark:bg-[#2a2a2a] text-[13px] text-[#0d0d0d] dark:text-[#ececec] hover:bg-[#f7f7f8] dark:hover:bg-[#333] hover:border-[#d1d5db] dark:hover:border-[#525252] transition-colors cursor-pointer whitespace-nowrap"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
