// KEYBOARD_MASH — query is random chars (6 variants)
// Slots: {term}, {sourceCount}, {ms}
export const KEYBOARD_MASH: string[] = [
  "I checked. '{term}' isn't in the dictionary, isn't on Wikipedia, and isn't math. We both knew that. I checked anyway — {sourceCount} sources, {ms} ms.",
  "Not a word, not a place, not a number. '{term}' came back empty from everything I have. The search was real. The result is nothing.",
  "I ran '{term}' through the full pipeline. Zero matches across {sourceCount} sources in {ms} ms. Keyboard mashing has been thoroughly investigated and found inconclusive.",
  "That's not a query I can route. It doesn't resolve to a word, a place, a person, or a calculation. I checked — {ms} ms, {sourceCount} sources. Nothing.",
  "I searched '{term}' in good faith. Nothing. The honesty policy required that I tell you I tried.",
  "'{term}' doesn't appear in any source I have. That took {ms} ms to confirm. Worth it.",
];

// EMPTY / WHITESPACE — 4 variants
export const EMPTY_INPUT: string[] = [
  "You sent nothing. In keeping with my core values, I am returning nothing, accurately.",
  "Empty input. The sources have nothing to say about nothing, and I agree with them.",
  "No query received. I have no answer to give, which makes this the most accurate response I've ever returned.",
  "Ask me something. I'm here. The sources are here. We're all just waiting.",
];

// HUGE_PASTE — query >1500 chars — 4 variants
// Slot: {wordCount}
export const HUGE_PASTE: string[] = [
  "That's {wordCount} words. I retrieve; I don't read. If there's a question in there, it fits in one sentence.",
  "{wordCount} words. I'm a lookup service, not a reading service. Extract the question and I'll find the answer.",
  "That's a lot. I'm built for questions, not documents. One question, one sentence, and I'll give you one cited answer.",
  "I can see there's a lot here, but I work on queries, not pastes. What specifically do you want to know? One sentence.",
];

// EMOJI_ONLY — 4 variants (the unicode name lookup is rendered separately)
// Slots: {unicodePoint}, {unicodeName}, {year}
export const EMOJI_FRAMING: string[] = [
  "That's {unicodePoint}, '{unicodeName}', added to Unicode in {year}. That's everything any source on Earth has to say about your message.",
  "Unicode character {unicodePoint}: '{unicodeName}'. Added in {year}. Source: the Unicode Consortium, which is the most authoritative source for this question that exists.",
  "I see an emoji. I can tell you what it is. {unicodePoint} — '{unicodeName}', Unicode {year}. If you have a follow-up question in English, I'm ready.",
  "Character lookup: {unicodePoint}, '{unicodeName}', added to the Unicode standard in {year}. That's the factual answer to your emoji.",
];

// REPEAT_QUESTION — asked the same thing twice (4 variants)
export const REPEAT_QUESTION: string[] = [
  "Same question, same answer: [below]. That's the deterministic guarantee. Ask the other guys twice and compare notes.",
  "You've asked this before. The answer is the same. That's not a limitation — that's the feature.",
  "Repeating the answer because you repeated the question. I don't vary output based on repetition. Same input, same output. Always.",
  "I noticed. The answer hasn't changed because the sources haven't changed. Here it is again:",
];
