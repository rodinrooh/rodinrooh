"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Conversation,
  Message,
  Block,
  ProvenanceEntry,
  ClassifyTrace,
  SSEEvent,
} from "../engine/envelope";
import Sidebar, { ChatGPTWordmark } from "./Sidebar";
import MessageComponent from "./Message";
import Composer from "./Composer";
import DevPanel from "./DevPanel";

// ---- Konami sequence ----
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

// ---- localStorage helpers ----
const LS_KEY = "notgpt_conversations";

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Conversation[];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(convs));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Theme toggle ----
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(document.documentElement.classList.contains("dark") || mq.matches);
  }, []);

  const toggle = () => {
    const html = document.documentElement;
    if (dark) {
      html.classList.remove("dark");
      setDark(false);
    } else {
      html.classList.add("dark");
      setDark(true);
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-[#9ca3af] dark:text-[#6b7280] hover:text-[#0d0d0d] dark:hover:text-[#ececec] hover:bg-[#f7f7f8] dark:hover:bg-[#2a2a2a] transition-colors"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        // Sun
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 8 + 5 * Math.cos(rad);
            const y1 = 8 + 5 * Math.sin(rad);
            const x2 = 8 + 7 * Math.cos(rad);
            const y2 = 8 + 7 * Math.sin(rad);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      ) : (
        // Moon
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13 10A6 6 0 0 1 6 3c0-.3.02-.6.07-.9A6 6 0 1 0 13.9 9.93c-.3.05-.6.07-.9.07z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

// ---- Suggestion chips for empty state ----
const SUGGESTIONS = [
  "Who is Ada Lovelace",
  "How tall is the Eiffel Tower",
  "What does serendipity mean",
  "Weather in Tokyo",
];

// ---- Main Chat component ----
export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devTrace, setDevTrace] = useState<ClassifyTrace | null>(null);
  const [devMeta, setDevMeta] = useState<{
    intent?: string;
    confidence?: number;
    timingMs?: number;
  }>({});
  const [konamiProgress, setKonamiProgress] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Load from localStorage on mount
  useEffect(() => {
    isMountedRef.current = true;
    const stored = loadConversations();
    setConversations(stored);

    // Apply dark mode from system preference initially
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (conversations.length > 0 || localStorage.getItem(LS_KEY)) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, currentConvId]);

  // Konami code detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const expected = KONAMI[konamiProgress];
      if (e.key === expected) {
        const next = konamiProgress + 1;
        if (next === KONAMI.length) {
          setShowDevPanel(true);
          setKonamiProgress(0);
        } else {
          setKonamiProgress(next);
        }
      } else {
        setKonamiProgress(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [konamiProgress]);

  // Get current conversation
  const currentConv = conversations.find((c) => c.id === currentConvId) ?? null;
  const currentMessages = currentConv?.messages ?? [];

  // Helpers to update conversations immutably
  const upsertConversation = useCallback(
    (conv: Conversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        if (idx === -1) return [conv, ...prev];
        const next = [...prev];
        next[idx] = conv;
        return next;
      });
    },
    []
  );

  const updateMessage = useCallback(
    (convId: string, msgId: string, updater: (m: Message) => Message) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === convId);
        if (idx === -1) return prev;
        const conv = prev[idx];
        const msgIdx = conv.messages.findIndex((m) => m.id === msgId);
        if (msgIdx === -1) return prev;
        const next = [...prev];
        const msgs = [...conv.messages];
        msgs[msgIdx] = updater(msgs[msgIdx]);
        next[idx] = { ...conv, messages: msgs };
        return next;
      });
    },
    []
  );

  // ---- sendMessage ----
  const sendMessage = useCallback(
    async (text: string) => {
      if (isLoading || !text.trim()) return;

      setComposerValue("");

      // Build or get conversation
      let convId = currentConvId;
      let conv: Conversation;

      if (!convId) {
        convId = genId();
        conv = {
          id: convId,
          title: text.slice(0, 40),
          messages: [],
          createdAt: Date.now(),
        };
        setCurrentConvId(convId);
        upsertConversation(conv);
      } else {
        conv = conversations.find((c) => c.id === convId)!;
        if (!conv) {
          convId = genId();
          conv = {
            id: convId,
            title: text.slice(0, 40),
            messages: [],
            createdAt: Date.now(),
          };
          setCurrentConvId(convId);
          upsertConversation(conv);
        }
      }

      // Add user message
      const userMsgId = genId();
      const userMsg: Message = {
        id: userMsgId,
        role: "user",
        content: text,
      };

      // Add streaming placeholder
      const assistantMsgId = genId();
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
        status: "Thinking…",
        blocks: [],
        provenance: [],
      };

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === convId);
        if (idx === -1) {
          return [
            {
              ...conv,
              messages: [userMsg, assistantMsg],
            },
            ...prev,
          ];
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          messages: [...next[idx].messages, userMsg, assistantMsg],
        };
        return next;
      });

      setIsLoading(true);

      // Build context from previous messages
      const contextMessages = (
        conv.messages.filter((m) => !m.isStreaming)
      ).slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
        entities: m.provenance?.map((p) => p.label) ?? [],
      }));

      // Create abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch("/notgpt/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            context: contextMessages,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let sseBuffer = "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processEvent = (eventName: string, dataStr: string) => {
          if (!isMountedRef.current) return;
          if (!dataStr || dataStr === "") return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch {
            return;
          }

          // The SSE `event:` field is the eventName parameter (not inside data JSON)
          switch (eventName) {
            case "delta":
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                content: m.content + (data.text ?? ""),
                status: undefined,
              }));
              break;

            case "block":
              // data IS the block (Block shape)
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                blocks: [...(m.blocks ?? []), data as Block],
              }));
              break;

            case "clarify":
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                clarify: {
                  question: data.question ?? "",
                  options: data.options ?? [],
                },
              }));
              break;

            case "status":
              // server sends { stage, message, source? }
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                status: data.message ?? data.text ?? "",
              }));
              break;

            case "provenance":
              // server sends { sources: ProvenanceEntry[] }
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                provenance: [
                  ...(m.provenance ?? []),
                  ...(data.sources ?? data.entries ?? []) as ProvenanceEntry[],
                ],
              }));
              break;

            case "done":
              // data is AnswerEnvelope
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                isStreaming: false,
                status: undefined,
                timing: data.timing,
              }));
              if (data.trace) {
                setDevTrace(data.trace as ClassifyTrace);
              }
              if (data.timing) {
                setDevMeta((prev: Record<string, unknown>) => ({
                  ...prev,
                  timingMs: data.timing?.totalMs,
                }));
              }
              setIsLoading(false);
              abortControllerRef.current = null;
              break;

            case "error":
              updateMessage(convId!, assistantMsgId, (m) => ({
                ...m,
                isStreaming: false,
                status: undefined,
                content:
                  m.content ||
                  `Something went wrong: ${data.message ?? "unknown error"}`,
              }));
              setIsLoading(false);
              abortControllerRef.current = null;
              break;
          }
        };

        // Read the stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          sseBuffer += chunk;

          // Process complete events from buffer
          const lines = sseBuffer.split("\n");
          // Keep last line (may be incomplete) in buffer
          sseBuffer = lines[lines.length - 1];

          let currentEvent = "";
          let currentData = "";

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              currentData = line.slice(5).trim();
            } else if (line.trim() === "") {
              if (currentData) {
                processEvent(currentEvent, currentData);
              }
              currentEvent = "";
              currentData = "";
            }
          }
        }

        // Process any remaining buffered data
        if (sseBuffer.trim()) {
          const lines = sseBuffer.split("\n");
          let currentEvent = "";
          let currentData = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              currentData = line.slice(5).trim();
            }
          }
          if (currentData) {
            processEvent(currentEvent, currentData);
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        const isAbort =
          err instanceof Error && err.name === "AbortError";

        if (!isAbort) {
          updateMessage(convId!, assistantMsgId, (m) => ({
            ...m,
            isStreaming: false,
            status: undefined,
            content:
              m.content ||
              "I couldn't reach the sources right now. Please try again.",
          }));
        } else {
          // On abort: finalize what we have
          updateMessage(convId!, assistantMsgId, (m) => ({
            ...m,
            isStreaming: false,
            status: undefined,
          }));
        }

        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      isLoading,
      currentConvId,
      conversations,
      upsertConversation,
      updateMessage,
    ]
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentConvId(null);
    setComposerValue("");
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setCurrentConvId((prev) => (prev === id ? null : prev));
  }, []);

  // ---- Empty state ----
  const isEmpty = currentMessages.length === 0;

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-[#212121]">
      {/* ---- Sidebar (desktop always visible, mobile toggleable) ---- */}
      <div
        className={`flex-shrink-0 transition-all duration-200 overflow-hidden ${
          sidebarOpen ? "w-[260px]" : "w-0"
        } hidden sm:block`}
        style={{ minWidth: sidebarOpen ? 260 : 0 }}
      >
        <Sidebar
          conversations={conversations}
          currentId={currentConvId}
          onNew={startNewChat}
          onSelect={(id) => setCurrentConvId(id)}
          onDelete={deleteConversation}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <div className="w-[260px] flex-shrink-0">
            <Sidebar
              conversations={conversations}
              currentId={currentConvId}
              onNew={() => {
                startNewChat();
                setSidebarOpen(false);
              }}
              onSelect={(id) => {
                setCurrentConvId(id);
                setSidebarOpen(false);
              }}
              onDelete={deleteConversation}
            />
          </div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* ---- Main content ---- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#e5e7eb] dark:border-[#2a2a2a] flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Hamburger/sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-lg text-[#9ca3af] dark:text-[#6b7280] hover:text-[#0d0d0d] dark:hover:text-[#ececec] hover:bg-[#f7f7f8] dark:hover:bg-[#2a2a2a] transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Show wordmark when sidebar is closed */}
            {!sidebarOpen && <ChatGPTWordmark size="sm" />}
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* Messages / Empty state */}
        <main className="flex-1 overflow-y-auto">
          {isEmpty ? (
            // ---- Empty state ----
            <div className="h-full flex flex-col items-center justify-center px-4 pb-8">
              <div className="flex flex-col items-center gap-3 mb-8">
                {/* Large logo */}
                <div className="w-12 h-12 rounded-full bg-[#10a37f] flex items-center justify-center">
                  <span
                    className="text-white font-bold text-[22px]"
                    style={{
                      textDecoration: "line-through",
                      textDecorationColor: "#ef4444",
                    }}
                  >
                    G
                  </span>
                </div>
                <h1 className="text-[24px] font-semibold text-[#0d0d0d] dark:text-[#ececec] tracking-tight select-none">
                  chat
                  <span
                    style={{
                      textDecoration: "line-through",
                      textDecorationColor: "#ef4444",
                    }}
                  >
                    GPT
                  </span>
                </h1>
                <p className="text-[14px] text-[#6b7280] dark:text-[#9ca3af] text-center">
                  Looks like ChatGPT. Runs on Wikipedia.
                </p>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2.5 rounded-xl border border-[#e5e7eb] dark:border-[#3f3f3f] bg-white dark:bg-[#2a2a2a] text-[13px] text-[#374151] dark:text-[#d1d5db] hover:bg-[#f7f7f8] dark:hover:bg-[#333] hover:border-[#d1d5db] dark:hover:border-[#525252] transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // ---- Messages list ----
            <div className="max-w-3xl mx-auto py-4 space-y-1">
              {currentMessages.map((msg) => (
                <MessageComponent
                  key={msg.id}
                  message={msg}
                  onClarify={(query) => sendMessage(query)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Composer */}
        <div className="flex-shrink-0 bg-white dark:bg-[#212121]">
          <Composer
            onSend={sendMessage}
            isLoading={isLoading}
            onStop={stopGeneration}
            value={composerValue}
            onChange={setComposerValue}
          />
        </div>
      </div>

      {/* Dev panel */}
      {showDevPanel && (
        <DevPanel
          trace={devTrace}
          intent={devMeta.intent}
          confidence={devMeta.confidence}
          timingMs={devMeta.timingMs}
          onClose={() => setShowDevPanel(false)}
        />
      )}
    </div>
  );
}
