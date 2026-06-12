// Lead-ins for successful factual answers (rotate to feel non-canned)
// Weight toward plainest — several blank entries to let the block speak for itself
export const FACT_LEAD_INS: string[] = [
  "",
  "",
  "",
  "According to Wikipedia — the actual one, retrieved just now:",
  "Wiktionary says, verbatim:",
  "Straight from the source, untouched:",
  "From Wikipedia, word for word — the chip below links to the exact revision:",
  "Here's what the source has:",
];

// Hedge framing (before a low-confidence answer)
// Slot: {title}
export const HEDGE_FRAMING: string[] = [
  "I think you mean **{title}** — here's what Wikipedia has:",
  "Best match: **{title}**. If that's not right, rephrase and I'll try again:",
  "Nearest result is **{title}** — confidence is qualified. Here it is:",
  "I matched **{title}**, which may or may not be what you meant. Here's what's there:",
  "Closest I found: **{title}**. Verify this is what you're asking about:",
];

// "It gets technical from here" truncation affordance — 4 variants
export const TRUNCATION_AFFORDANCE: string[] = [
  "That's the summary. The full article goes deeper — link is in the source chip.",
  "Truncated at three sentences. The full Wikipedia article is linked below.",
  "First paragraph only. The rest is at the source.",
  "Summary cut for length. Full text is one click away.",
];

// For recency-flagged articles — prepended to answer
// Slot: {relativeTime}
export const RECENCY_DISCLAIMER: string[] = [
  "Wikipedia's article was last edited **{relativeTime}** — recent events may be missing or rough.",
  "Note: this article was last updated **{relativeTime}**. Anything that happened after that may not be here.",
  "Last edited **{relativeTime}**. If this is a developing story, the source may be behind.",
  "Wikipedia's version of this is **{relativeTime}** old. Fast-moving topics may have changed.",
];

// Attribution footer (appears below every sourced answer)
export const ATTRIBUTION_FOOTER = "Summarized by Wikipedia's editors, not a language model.";

// Random number delivery
// Slot: {n}
export const RANDOM_NUMBER: string = "**{n}.** Drawn from crypto.getRandomValues(), which pulls from your operating system's entropy pool — actual randomness, not a statistical model's impression of randomness.";

export const RANDOM_NUMBER_SEVEN_RIDER: string = "Yes, language models famously over-pick 7. Mine was a coincidence. I can prove it: run it again.";

export const COIN_FLIP: Record<"heads" | "tails", string> = {
  heads: "**Heads.** One bit, straight from the kernel's entropy pool.",
  tails: "**Tails.** One bit, straight from the kernel's entropy pool.",
};
