export type BitId =
  | "OTHER_GUYS"
  | "RECEIPTS"
  | "DETERMINISM"
  | "NO_MEMORY"
  | "STRIKETHROUGH"
  | "NO_IMAGINATION";

export interface SessionMemory {
  usedVariantIds: Map<string, Set<number>>; // categoryId → used indices
  bitLastUsedAt: Map<BitId, number>; // message index when bit was last fired
  failureStreak: number;
  lastQueryHash: string | null;
  messageIndex: number;
  categoryCounts: Map<string, number>;
}

export const BIT_CAPS: Record<BitId, number> = {
  OTHER_GUYS: 4, // cooldown: 1 per 4 messages (fire only when messageIndex % 4 === 0)
  RECEIPTS: 0, // 0 = uncapped (no cooldown)
  DETERMINISM: -1, // -1 = once per session
  NO_MEMORY: -1, // once per session
  STRIKETHROUGH: -1, // once per session (identity questions only)
  NO_IMAGINATION: -1, // once per session
};

// Which bits are session-capped (used at most once)
export const SESSION_CAPPED_BITS: BitId[] = [
  "DETERMINISM",
  "NO_MEMORY",
  "STRIKETHROUGH",
  "NO_IMAGINATION",
];
