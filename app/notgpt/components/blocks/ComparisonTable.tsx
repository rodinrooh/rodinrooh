"use client";

import type { ComparisonTableBlock } from "../../engine/envelope";

type ComparisonTableProps = {
  block: ComparisonTableBlock;
};

export default function ComparisonTable({ block }: ComparisonTableProps) {
  const { entities, rows } = block;

  if (!entities.length || !rows.length) return null;

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-[#e5e7eb] dark:border-[#3f3f3f]">
      <table className="min-w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-[#f7f7f8] dark:bg-[#2a2a2a]">
            <th className="px-4 py-2.5 text-left text-[#6b7280] dark:text-[#9ca3af] font-medium border-b border-r border-[#e5e7eb] dark:border-[#3f3f3f] text-[12px] uppercase tracking-wide w-[140px]">
              Property
            </th>
            {entities.map((entity, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-[#0d0d0d] dark:text-[#ececec] font-semibold border-b border-[#e5e7eb] dark:border-[#3f3f3f] last:border-r-0 border-r"
              >
                {entity}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                i % 2 === 0
                  ? "bg-white dark:bg-[#212121]"
                  : "bg-[#fafafa] dark:bg-[#252525]"
              }
            >
              <td className="px-4 py-2.5 text-[#6b7280] dark:text-[#9ca3af] font-medium border-b border-r border-[#e5e7eb] dark:border-[#3f3f3f] last:border-b-0 whitespace-nowrap">
                {row.property}
              </td>
              {row.values.map((val, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 text-[#0d0d0d] dark:text-[#ececec] border-b border-r border-[#e5e7eb] dark:border-[#3f3f3f] last:border-r-0"
                  style={{
                    borderBottomColor:
                      i === rows.length - 1 ? "transparent" : undefined,
                  }}
                >
                  {val || (
                    <span className="text-[#d1d5db] dark:text-[#525252]">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
