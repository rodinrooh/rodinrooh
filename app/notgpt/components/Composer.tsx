"use client";

import { useRef, useEffect, useCallback } from "react";

type ComposerProps = {
  onSend: (msg: string) => void;
  isLoading: boolean;
  onStop: () => void;
  disabled?: boolean;
  value: string;
  onChange: (val: string) => void;
};

export default function Composer({
  onSend,
  isLoading,
  onStop,
  disabled,
  value,
  onChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  const grow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24; // px
    const maxRows = 4;
    const maxHeight = lineHeight * maxRows + 24; // padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, []);

  useEffect(() => {
    grow();
  }, [value, grow]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSend(value.trim());
      }
    }
  };

  const handleSend = () => {
    if (!disabled && !isLoading && value.trim()) {
      onSend(value.trim());
    }
  };

  const canSend = !disabled && !isLoading && value.trim().length > 0;

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 rounded-2xl border border-[#e5e7eb] dark:border-[#3f3f3f] bg-white dark:bg-[#2f2f2f] px-4 py-3 shadow-sm focus-within:border-[#d1d5db] dark:focus-within:border-[#525252] transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              grow();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything (I'll tell you the truth, or admit I can't)"
            rows={1}
            disabled={disabled || isLoading}
            className="flex-1 resize-none bg-transparent text-[14px] text-[#0d0d0d] dark:text-[#ececec] placeholder-[#9ca3af] dark:placeholder-[#6b7280] outline-none leading-6 overflow-y-auto max-h-[120px] disabled:opacity-60"
            style={{ minHeight: "24px" }}
          />

          {/* Send / Stop button */}
          <div className="flex-shrink-0 mb-0.5">
            {isLoading ? (
              // Stop button
              <button
                onClick={onStop}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#0d0d0d] dark:bg-[#ececec] hover:opacity-80 transition-opacity"
                aria-label="Stop generating"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="text-white dark:text-[#0d0d0d]"
                >
                  <rect
                    x="3"
                    y="3"
                    width="8"
                    height="8"
                    rx="1.5"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ) : (
              // Send button
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  canSend
                    ? "bg-[#10a37f] hover:bg-[#0d8f6e] text-white"
                    : "bg-[#e5e7eb] dark:bg-[#3f3f3f] text-[#9ca3af] dark:text-[#6b7280] cursor-not-allowed"
                }`}
                aria-label="Send message"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                >
                  <path
                    d="M7 11V3M7 3L3.5 6.5M7 3L10.5 6.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-[11px] text-[#9ca3af] dark:text-[#6b7280] mt-2">
          Every answer is sourced. Nothing is stored.
        </p>
      </div>
    </div>
  );
}
