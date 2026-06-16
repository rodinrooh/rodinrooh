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
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
    <div
      className="flex flex-col h-full w-full"
      style={{
        backgroundColor: "#141414",
        borderRight: "1px solid #242424",
      }}
    >
      {/* Top: app name + new chat */}
      <div className="px-3 pt-4 pb-2">
        {/* App name */}
        <div className="px-3 py-1 mb-3">
          <span
            className="text-[15px] font-semibold select-none"
            style={{ color: "#e5e5e5" }}
          >
            notclaude
          </span>
        </div>

        {/* New chat button */}
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors"
          style={{ color: "#6b6b6b" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#e5e5e5";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1e1e1e";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#6b6b6b";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
        >
          <PlusIcon />
          <span>New chat</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length > 0 && (
          <>
            <p
              className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider select-none"
              style={{ color: "#6b6b6b" }}
            >
              Recents
            </p>
            <ul className="space-y-0.5">
              {conversations
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((conv) => {
                  const isActive = conv.id === currentId;
                  return (
                    <li key={conv.id} className="group relative">
                      <button
                        onClick={() => onSelect(conv.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left transition-colors"
                        style={{
                          color: isActive ? "#e5e5e5" : "#6b6b6b",
                          backgroundColor: isActive ? "#242424" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1e1e1e";
                            (e.currentTarget as HTMLButtonElement).style.color = "#e5e5e5";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                            (e.currentTarget as HTMLButtonElement).style.color = "#6b6b6b";
                          }
                        }}
                      >
                        <ChatBubbleIcon />
                        <span className="flex-1 truncate leading-snug">
                          {conv.title || "New conversation"}
                        </span>
                      </button>

                      {/* Delete — visible on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(conv.id);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all"
                        style={{ color: "#6b6b6b" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2a1515";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color = "#6b6b6b";
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        }}
                        aria-label="Delete conversation"
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </div>

      {/* Bottom */}
      <div
        className="px-3 py-3"
        style={{ borderTop: "1px solid #242424" }}
      >
        <Link
          href="/notgpt/about"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] no-underline transition-colors"
          style={{ color: "#6b6b6b" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#9ca3af";
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#1e1e1e";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#6b6b6b";
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
          }}
        >
          <span
            className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold flex-shrink-0"
            style={{ border: "1px solid #383838", color: "#6b6b6b" }}
          >
            ?
          </span>
          <span>What is this?</span>
        </Link>
      </div>
    </div>
  );
}
