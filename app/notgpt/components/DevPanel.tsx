"use client";

import type { ClassifyTrace } from "../engine/envelope";

type DevPanelProps = {
  trace: ClassifyTrace | null;
  intent?: string;
  confidence?: number;
  timingMs?: number;
  onClose: () => void;
};

const RESULT_STYLES: Record<
  "claimed" | "passed" | "fallthrough",
  string
> = {
  claimed:
    "bg-[#dcfce7] dark:bg-[#14532d] text-[#15803d] dark:text-[#4ade80] border-[#bbf7d0] dark:border-[#166534]",
  passed:
    "bg-[#fef9c3] dark:bg-[#713f12] text-[#a16207] dark:text-[#fde047] border-[#fef08a] dark:border-[#854d0e]",
  fallthrough:
    "bg-[#f1f5f9] dark:bg-[#1e293b] text-[#64748b] dark:text-[#94a3b8] border-[#e2e8f0] dark:border-[#334155]",
};

export default function DevPanel({
  trace,
  intent,
  confidence,
  timingMs,
  onClose,
}: DevPanelProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[480px] max-h-[70vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[#e5e7eb] dark:border-[#3f3f3f] bg-white dark:bg-[#1a1a1a] shadow-2xl overflow-hidden"
      style={{ animation: "slideUp 0.25s ease-out" }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-[#e5e7eb] dark:border-[#3f3f3f] flex-shrink-0">
        <div>
          <h2 className="text-[13px] font-semibold text-[#0d0d0d] dark:text-[#ececec] leading-snug">
            You wanted to see the weights.
          </h2>
          <p className="text-[12px] text-[#9ca3af] dark:text-[#6b7280] mt-0.5">
            There are no weights. There are these.
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-4 p-1.5 rounded-lg text-[#9ca3af] hover:text-[#0d0d0d] dark:hover:text-[#ececec] hover:bg-[#f7f7f8] dark:hover:bg-[#2a2a2a] transition-colors"
          aria-label="Close dev panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 2L12 12M12 2L2 12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 px-5 py-2.5 bg-[#f7f7f8] dark:bg-[#111] border-b border-[#e5e7eb] dark:border-[#2a2a2a] flex-shrink-0 flex-wrap">
        {intent && (
          <div>
            <span className="text-[10px] uppercase tracking-wide text-[#9ca3af] dark:text-[#6b7280] font-medium">
              intent
            </span>
            <p className="text-[12px] font-mono font-medium text-[#0d0d0d] dark:text-[#ececec]">
              {intent}
            </p>
          </div>
        )}
        {confidence !== undefined && (
          <div>
            <span className="text-[10px] uppercase tracking-wide text-[#9ca3af] dark:text-[#6b7280] font-medium">
              confidence
            </span>
            <p className="text-[12px] font-mono font-medium text-[#0d0d0d] dark:text-[#ececec]">
              {(confidence * 100).toFixed(0)}%
            </p>
          </div>
        )}
        {timingMs !== undefined && (
          <div>
            <span className="text-[10px] uppercase tracking-wide text-[#9ca3af] dark:text-[#6b7280] font-medium">
              total
            </span>
            <p className="text-[12px] font-mono font-medium text-[#0d0d0d] dark:text-[#ececec]">
              {timingMs}ms
            </p>
          </div>
        )}
      </div>

      {/* Trace list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {!trace || trace.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af] dark:text-[#6b7280] py-4 text-center">
            No trace available for this message.
          </p>
        ) : (
          <div className="space-y-1.5">
            {trace.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-[#f7f7f8] dark:bg-[#2a2a2a]"
              >
                <span className="text-[11px] font-mono text-[#9ca3af] dark:text-[#6b7280] w-6 text-right flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-[12px] font-mono text-[#0d0d0d] dark:text-[#ececec] truncate">
                  {step.matcher}
                </span>
                <span
                  className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    RESULT_STYLES[step.result]
                  }`}
                >
                  {step.result}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-[#e5e7eb] dark:border-[#2a2a2a] flex-shrink-0">
        <p className="text-[11px] text-[#9ca3af] dark:text-[#6b7280]">
          Triggered by Konami code ↑↑↓↓←→←→BA · No AI was involved in this trace
        </p>
      </div>
    </div>
  );
}
