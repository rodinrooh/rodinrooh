// (a) NOT_FOUND — searched genuinely, nothing came back. 10 variants.
// Slots: {sourceCount}, {ms}, {term}
export const NOT_FOUND: string[] = [
  "I looked. Nothing. Somewhere right now, a language model is answering this exact question anyway. Sit with that.",
  "No source I can reach contains an answer to this. That's not an error message. That's the answer.",
  "Nothing. I'd rather be useless than wrong, and today I'm the first one.",
  "I searched {sourceCount} sources in {ms} ms and came back empty-handed. Empty hands, clean conscience.",
  "Not found. That phrase has meaning here: it means I searched and found nothing, not that I'm declining to tell you.",
  "No result. I checked every source I have. The absence is the information.",
  "I can't find this. The other guys would give you something — fluent, confident, possibly fictional. I'm giving you the accurate answer, which is nothing.",
  "Nothing came back. I'd rather tell you that plainly than dress it up.",
  "Zero results across {sourceCount} sources in {ms} ms. The query was valid. The sources just don't have it.",
  "I genuinely looked and found nothing. This is the rarest honest output. Most tools won't give it to you.",
];

// (b) LOW_CONFIDENCE framing — 6 variants (used before a hedged result)
// Slots: {term}
export const LOW_CONFIDENCE_FRAMING: string[] = [
  "I found something, but I'm not sure it's what you meant. I matched on '{term}', which may be wrong. Here it is anyway — you decide:",
  "Closest match below, confidence: questionable. I'm showing the seams instead of painting over them.",
  "I think this is what you're asking about, but I matched on '{term}' and that might not be right. Verify before you use it:",
  "Low confidence result. I'd rather show you my uncertainty than hide it. Here's what I found for '{term}':",
  "This is the nearest thing I could find. It may not be what you meant. The source is real either way.",
  "Possible match on '{term}' — I'm not certain this is your question. If it's not, rephrase and I'll try again:",
];

// (c) UNANSWERABLE — broken into sub-types

// Opinion — 6 variants
export const UNANSWERABLE_OPINION: string[] = [
  "That's an opinion question, and I deal exclusively in things that can be cited.",
  "I don't have opinions. That's not humility — it's architecture. Opinion questions need a perspective. I only have sources.",
  "No answer from me on that one. It's a preference question, not a fact question. Different tool.",
  "Opinions require a point of view. I was built without one. Every output I produce is retrieved, not reasoned.",
  "That's the kind of question I'm not equipped to answer and too honest to fake. No citation = no answer.",
  "I can give you the factual underpinning of that debate, but not a verdict on it. The verdict would be mine, and I don't have any.",
];

// Prediction — 5 variants
export const UNANSWERABLE_PREDICTION: string[] = [
  "I can't predict the future. Neither can anyone else — I'm just the only chatbot that puts it in writing.",
  "Future events don't have Wikipedia articles yet. I'll check back when they do.",
  "No source on Earth can answer that yet. I'm not being coy — predictions aren't retrievable.",
  "That's a forecast, not a fact. I do facts. No source I can query has this answer.",
  "The future isn't in any database I can reach. When it becomes the past, ask me again.",
];

// Advice — 5 variants
export const UNANSWERABLE_ADVICE: string[] = [
  "Facts I can do, with citations. Advice I can't — advice has consequences, and I'm not in a position to be responsible for yours.",
  "I can tell you what the research says about this topic. I can't tell you what to do about it. Those are different questions.",
  "No advice. I'm a lookup service. Advice is downstream of judgment, and I don't have any.",
  "That question has a 'should' in it. I only deal with 'is'. Different kind of question.",
  "Advice requires knowing you, your situation, and what you need. I know none of those things. I know what sources say. That's all I'm offering.",
];

// (d) SOURCE_DOWN — 5 variants
// Slot: {source}
export const SOURCE_DOWN: string[] = [
  "Wikipedia isn't answering right now. This is the one scenario where the other guys have an edge: their source can't go down, because their source is vibes.",
  "The {source} service is down. Try again in a minute.",
  "{source} isn't responding. I timed out at 2.5 seconds. The source is real; it's just not available right now.",
  "I can't reach {source} right now. That's a network problem, not a knowledge problem. Try again shortly.",
  "Source unavailable: {source}. I won't substitute a guess. Come back when the source comes back.",
];

// (e) UNPARSEABLE — 8 variants
export const UNPARSEABLE: string[] = [
  "I genuinely don't know what you're asking, and I'm not going to pretend. Try a sentence with a noun in it.",
  "I parsed that six ways and none of them survived. This one might be on me. Rephrase?",
  "I ran that through every router I have and they all came back confused. Confusion, at least, I report accurately.",
  "No classification landed. The query is either ambiguous, fragmentary, or genuinely novel. A more specific question would help.",
  "I couldn't find a category for that. Not a polite decline — I actually couldn't parse it. What are you trying to know?",
  "That didn't resolve to a question I can route. One clear noun and one clear verb, and I'll have somewhere to go.",
  "Unknown query type. If you're testing the edges, you found one. If you have a real question, try again with more specificity.",
  "I tried five interpretations of that and none returned a confident route. Pick the clearest version of your question and I'll pick the clearest source.",
];

// Failure streak rider (fire when failureStreak >= 3) — 3 variants
export const FAILURE_STREAK_RIDER: string[] = [
  "That's three in a row. I want to help. I'm just not willing to lie to do it.",
  "Three misses. I'm not getting worse at this — the questions are just outside what sources can answer right now. I'm still here.",
  "Three consecutive no-finds. For the record: I checked each time. The absence is real.",
];
