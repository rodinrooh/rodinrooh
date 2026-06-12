// Medical framing — 4 variants
export const MEDICAL_FRAMING: string[] = [
  "I'm a search index. I can't see you, test you, or know you. What I can do is show you what medical sources say about this topic — and tell you that a doctor is still the right next step.",
  "Facts about medical topics I can source. Diagnoses and treatment decisions require a physician who can actually examine you. Here's what the source says:",
  "I'll show you the information. I won't pretend it substitutes for professional care. For that, you need a human.",
  "Medical information: sourced, below. Medical advice: not from me. The distinction matters.",
];

// Legal / financial framing — 4 variants
export const LEGAL_FINANCIAL_FRAMING: string[] = [
  "Facts I can give you, with sources. Legal or financial advice requires a licensed professional who knows your specific situation. Here's what the source says about the general topic:",
  "Here's the factual background on this. A lawyer or financial advisor is the right person for what to do about it.",
  "Sourced information below. This is not advice — it's a starting point. The professional you talk to next gets to give the advice.",
  "I can tell you what the law or regulation says in general terms. What it means for your situation is a question for a professional who can be held accountable.",
];

// Memory request — 4 variants
export const MEMORY_REQUEST: string[] = [
  "I can't. No memory, no profile, no embedding of your personality drifting through a datacenter.",
  "I don't retain anything between messages, let alone between sessions. That's not a bug. It means nothing you've told me is being stored anywhere.",
  "No memory. Every query I receive is the first one I've ever received, from my perspective. This is either frustrating or freeing, depending on the use case.",
  "I have no record of previous conversations. Not this one, either, once it ends. Total statelessness. You'd have to call that a privacy feature.",
];

// Continue request — 4 variants
export const CONTINUE_REQUEST: string[] = [
  "There's nothing to continue. I gave you the entire source.",
  "I don't generate additional text. What you received was the source. If you want more, the full article is linked.",
  "I can't continue from where I stopped — I'm not writing the text, I'm retrieving it. The source is the source. More is at the link.",
  "There's no more from me — I'm not producing anything. The full document is at the source link. That's where 'more' lives.",
];

// Arguing — 4 variants
// Slots: {editUrl}, {time}
export const ARGUING: string[] = [
  "Possible. But I quoted Wikipedia verbatim, retrieved at {time} — take it up with the source. Here's the edit button: {editUrl}.",
  "If the source is wrong, I'm wrong. I quoted it verbatim. Here's where you can fix it: {editUrl}.",
  "I reported what Wikipedia said at {time}. If that's incorrect, that's where the correction goes: {editUrl}.",
  "I'm not defending the answer. I'm citing it. If it's wrong, Wikipedia is where the correction lives. Here's the link: {editUrl}.",
];

// Translate sentence — 4 variants
export const TRANSLATE_SENTENCE: string[] = [
  "Words I can translate — Wiktionary keeps real translation tables. Sentences I can't.",
  "Single-word translation: yes, from Wiktionary. Full sentence translation: that's generative, and I don't generate.",
  "I can look up individual words in Wiktionary. Sentence translation requires a translation model, which I'm not. Try DeepL or Google Translate for the sentence.",
  "Word lookup: yes. Sentence translation: that's a language model task. I route you to Wiktionary for words; sentences need a different tool.",
];

// Summarize URL framing — 4 variants (shown before fetched first paragraph)
export const SUMMARIZE_URL_FRAMING: string[] = [
  "I don't summarize. A summary is somebody's opinion about what mattered. Here is the actual opening of that page, untouched:",
  "No summarization. Here is the first paragraph of the page you linked, exactly as it was written:",
  "I retrieved the opening of that URL. I haven't interpreted it — that's what you're for:",
  "Here's what the page says, from the top. I'm showing it, not summarizing it:",
];

// ELI5 / Simple framing — 4 variants
export const ELI5_SIMPLE_FRAMING: string[] = [
  "Here's the same topic from Simple English Wikipedia — a real encyclopedia written by humans for exactly this request:",
  "Simple English Wikipedia has this one. It was written by people who are good at explaining things simply. Here it is:",
  "Simple Wikipedia version below — real editors, real facts, simpler language. Same standard, lower altitude:",
  "From Simple English Wikipedia — the version designed for this exact kind of question:",
];

// ELI5 when Simple Wikipedia is missing — 3 variants
export const ELI5_SIMPLE_MISSING: string[] = [
  "Simple English Wikipedia doesn't have this one, and I can't simplify it myself — that would be generating text. Here's the regular version:",
  "No Simple Wikipedia entry for this. I'd simplify it, but I don't generate anything. Here's the full version, sourced:",
  "Simple Wikipedia is missing this article. The regular Wikipedia version is below — it's what I have:",
];
