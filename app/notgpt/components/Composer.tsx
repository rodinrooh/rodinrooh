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
    <div
      className="px-4 pb-5 pt-3"
      style={{ backgroundColor: "#1c1c1c" }}
    >
      <div className="mx-auto" style={{ maxWidth: 680 }}>
        <div
          className="relative flex items-end gap-2 px-4 py-3 transition-colors"
          style={{
            backgroundColor: "#242424",
            border: "1px solid #2e2e2e",
            borderRadius: 16,
          }}
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "#3a3a3a";
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#2e2e2e";
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
            placeholder="How can notclaude help you today?"
            rows={1}
            disabled={disabled || isLoading}
            className="flex-1 resize-none bg-transparent text-[14px] outline-none leading-6 overflow-y-auto disabled:opacity-50"
            style={{
              color: "#e5e5e5",
              minHeight: "24px",
              maxHeight: "120px",
            }}
          />

          {/* Send / Stop button */}
          <div className="flex-shrink-0 mb-0.5">
            {isLoading ? (
              // Stop button
              <button
                onClick={onStop}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
                style={{ backgroundColor: "#d4854a" }}
                aria-label="Stop generating"
              >
                {/* Square stop icon */}
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" fill="#1c1c1c" />
                </svg>
              </button>
            ) : (
              // Up-arrow send button
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
                style={{
                  backgroundColor: canSend ? "#d4854a" : "#3a3a3a",
                  color: canSend ? "#1c1c1c" : "#6b6b6b",
                  cursor: canSend ? "pointer" : "not-allowed",
                }}
                aria-label="Send message"
              >
                {/* Up arrow */}
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
        <p
          className="text-center text-[11px] mt-2"
          style={{ color: "#3a3a3a" }}
        >
          Every answer is sourced. Nothing is stored.
        </p>
      </div>
    </div>
  );
}
