import {
  BitId,
  SessionMemory,
  BIT_CAPS,
  SESSION_CAPPED_BITS,
} from "./bits";

/**
 * Simple non-cryptographic hash of a string → positive integer.
 * Used to deterministically seed variant selection (same query → same variant).
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * Pick a variant for a category, respecting no-replacement per session.
 * seed: hash of query — ensures same query always picks same variant within a session.
 */
export function pickVariant(
  variants: string[],
  categoryId: string,
  memory: SessionMemory,
  seed: number
): string {
  if (variants.length === 0) return "";
  if (variants.length === 1) return variants[0];

  const used = memory.usedVariantIds.get(categoryId) ?? new Set<number>();

  // Build pool of unused indices
  const pool: number[] = [];
  for (let i = 0; i < variants.length; i++) {
    if (!used.has(i)) pool.push(i);
  }

  // If all used, reset — start over
  const activePool = pool.length > 0 ? pool : Array.from({ length: variants.length }, (_, i) => i);
  if (pool.length === 0) {
    // Reset the set
    memory.usedVariantIds.set(categoryId, new Set<number>());
  }

  // Deterministically pick from pool using seed
  const idx = activePool[seed % activePool.length];

  // Record usage
  const updatedUsed = memory.usedVariantIds.get(categoryId) ?? new Set<number>();
  updatedUsed.add(idx);
  memory.usedVariantIds.set(categoryId, updatedUsed);

  return variants[idx];
}

/**
 * Fill template slots in a string.
 * Replaces {term}, {ms}, {sourceCount}, {title}, {relativeTime}, {wordCount},
 * {unicodePoint}, {unicodeName}, {year}, {editUrl}, {time}, {source}, {n}.
 */
export function fillSlots(
  template: string,
  slots: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return Object.prototype.hasOwnProperty.call(slots, key) ? slots[key] : `{${key}}`;
  });
}

/**
 * Check if a bit is on cooldown.
 * - Session-capped bits: on cooldown if they've been used at all this session.
 * - OTHER_GUYS (cap=4): on cooldown if used within last 4 messages.
 * - RECEIPTS (cap=0): never on cooldown.
 */
export function isBitOnCooldown(
  bitId: BitId,
  memory: SessionMemory
): boolean {
  const cap = BIT_CAPS[bitId];

  // Uncapped
  if (cap === 0) return false;

  // Session-capped
  if (SESSION_CAPPED_BITS.includes(bitId)) {
    return memory.bitLastUsedAt.has(bitId);
  }

  // Message-interval cooldown (e.g. OTHER_GUYS: 4)
  const lastUsed = memory.bitLastUsedAt.get(bitId);
  if (lastUsed === undefined) return false;
  return memory.messageIndex - lastUsed < cap;
}

/**
 * Record that a bit was fired at the current message index.
 */
export function recordBitUsed(
  bitId: BitId,
  memory: SessionMemory
): void {
  memory.bitLastUsedAt.set(bitId, memory.messageIndex);
}

/**
 * Create a fresh session memory object.
 */
export function createSessionMemory(): SessionMemory {
  return {
    usedVariantIds: new Map(),
    bitLastUsedAt: new Map(),
    failureStreak: 0,
    lastQueryHash: null,
    messageIndex: 0,
    categoryCounts: new Map(),
  };
}

/**
 * Compute a deterministic seed from the raw query string.
 */
export function querySeed(raw: string): number {
  return hashString(raw.trim().toLowerCase());
}
