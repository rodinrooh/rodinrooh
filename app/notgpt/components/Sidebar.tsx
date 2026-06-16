"use client";

import Link from "next/link";
import type { Conversation } from "../engine/envelope";

type SidebarProps = {
  conversations: Conversation[];
  currentId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

// notgpt wordmark — amber accent, minimal
function NotGPTWordmark({ size = "base" }: { size?: "sm" | "base" | "lg" }) {
  const cls =
    size === "lg"
      ? "text-2xl font-semibold tracking-[-0.02em]"
      : size === "sm"
      ? "text-sm font-semibold tracking-[-0.01em]"
      : "text-[15px] font-semibold tracking-[-0.01em]";

  return (
    <span className={`${cls} text-[#f0a04b] select-none`}>
      notgpt
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 2v10M2 7h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path
        d="M2 3h9M5 3V2h3v1M3.5 3l.5 7.5h5l.5-7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8L5 13v-2.5H2a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Sidebar({
  conversations,
  currentId,
  onNew,
  onSelect,
  onDelete,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full w-full bg-[#1a1a1a] border-r border-[#2a2a2a]">
      {/* Top section: logo + new chat */}
      <div className="px-3 pt-4 pb-2 space-y-1">
        {/* Logo row */}
        <div className="flex items-center px-2 py-1 mb-2">
          <NotGPTWordmark />
        </div>

        {/* New chat button */}
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#9ca3af] hover:text-[#ececec] hover:bg-[#2a2a2a] transition-colors"
        >
          <PlusIcon />
          <span>New chat</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-[#6b7280]">
            No conversations yet
          </p>
        ) : (
          <ul className="space-y-0.5">
            {conversations
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((conv) => (
                <li key={conv.id} className="group relative">
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left transition-colors ${
                      conv.id === currentId
                        ? "bg-[#2a2a2a] text-[#ececec]"
                        : "text-[#9ca3af] hover:bg-[#242424] hover:text-[#ececec]"
                    }`}
                  >
                    <ChatBubbleIcon />
                    <span className="flex-1 truncate leading-snug">
                      {conv.title || "New conversation"}
                    </span>
                  </button>

                  {/* Delete button — shows on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#2a1515] transition-all"
                    aria-label="Delete conversation"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t border-[#2a2a2a]">
        <Link
          href="/notgpt/about"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#2a2a2a] transition-colors no-underline"
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-full border border-[#3a3a3a] text-[11px] font-semibold text-[#6b7280]">
            ?
          </span>
          <span>What is this?</span>
        </Link>
      </div>
    </div>
  );
}

export { NotGPTWordmark };
// Keep ChatGPTWordmark as an alias so existing imports in Chat.tsx don't break
export { NotGPTWordmark as ChatGPTWordmark };
