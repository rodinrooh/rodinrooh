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
    <div className="px-4 pb-5 pt-2" style={{ backgroundColor: "#1e1e1e" }}>
      <div className="max-w-3xl mx-auto">
        <div
          className="relative flex items-end gap-2 rounded-2xl px-4 py-3 shadow-lg transition-colors focus-within:ring-1"
          style={{
            backgroundColor: "#2a2a2a",
            border: "1px solid #3a3a3a",
          }}
          // @ts-ignore — CSS custom property trick for focus ring color
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "#f0a04b";
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#3a3a3a";
            }
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              grow();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything — I'll check Wikipedia"
            rows={1}
            disabled={disabled || isLoading}
            className="flex-1 resize-none bg-transparent text-[14px] outline-none leading-6 overflow-y-auto max-h-[120px] disabled:opacity-50"
            style={{
              color: "#ececec",
              minHeight: "24px",
            }}
          />

          {/* Send / Stop button */}
          <div className="flex-shrink-0 mb-0.5">
            {isLoading ? (
              // Stop button — amber
              <button
                onClick={onStop}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                style={{ backgroundColor: "#f0a04b" }}
                aria-label="Stop generating"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="2" width="8" height="8" rx="1.5" fill="#1a1a1a" />
                </svg>
              </button>
            ) : (
              // Send button
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
                style={{
                  backgroundColor: canSend ? "#f0a04b" : "#3a3a3a",
                  color: canSend ? "#1a1a1a" : "#6b7280",
                  cursor: canSend ? "pointer" : "not-allowed",
                }}
                aria-label="Send message"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
        <p className="text-center text-[11px] mt-2" style={{ color: "#4b5563" }}>
          Every answer is sourced. Nothing is stored.
        </p>
      </div>
    </div>
  );
}
