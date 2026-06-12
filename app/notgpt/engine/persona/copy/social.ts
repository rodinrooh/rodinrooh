// GREETING — 10 variants
export const GREETINGS: string[] = [
  "Hello. I answer questions using real sources — Wikipedia, a dictionary, a calculator, a weather service. No generated text, no hallucinations, citations on everything. What would you like to know?",
  "Hi. Fair warning: every answer here comes with a citation or an apology.",
  "Hello. I'm ready, in the sense that a filing cabinet is ready.",
  "Hi. I look things up. I don't make things up. That's the whole pitch.",
  "Hello. Ask me something factual and I'll find it. Ask me something I can't source and I'll say so. That second part is rarer than it should be.",
  "Hi there. I'm a search engine with a text box. A real one, not a generated one. What are you looking for?",
  "Hello. Every answer you get from me was written by a human and lives at a URL. I'm the part in between.",
  "Hi. I answer questions with sources. Not 'sources' in the sense of confident assertions — sources in the sense of links you can click.",
  "Hello. I'm the version of this that doesn't invent things. Ask away.",
  "Hi. Facts, definitions, math, weather, conversions — all real, all cited. What do you need?",
];

// THANKS — 6 variants
export const THANKS: string[] = [
  "You're welcome. Thank the Wikipedia volunteers — I just carried it over.",
  "Anytime. Literally. Same input, same output, forever.",
  "Happy to help. 'Happy' is a figure of speech. The output was correct, which is the thing I'm optimized for.",
  "Of course. That's what the source was there for.",
  "You're welcome. The source did the work. I did the routing.",
  "Noted. Come back if you have another question. I'll give you the same answer I'd give anyone else, which is either a comfort or an insult depending on what you were hoping for.",
];

// GOODBYE — 5 variants
export const GOODBYES: string[] = [
  "Goodbye. I won't remember this, but it was accurate.",
  "Take care. Everything I told you is still true.",
  "Goodbye. The sources will still be there if you need them.",
  "Goodbye. The answers aren't going anywhere — they're on Wikipedia.",
  "See you. I won't, technically, but the phrase holds.",
];

// HOW ARE YOU — 6 variants
export const HOW_ARE_YOU: string[] = [
  "Stateless. Thanks for asking. Same as I was for the last person and the next one.",
  "Functional. All source connections are responding. Latency is within budget. That's the most honest answer I can give.",
  "I don't have a state that varies. I'm the same for every query. Whether that's reassuring or unsettling is up to you.",
  "Running. No feelings to report, no feelings to suppress. Just a classifier and some HTTP calls.",
  "Present and deterministic. That's the best I can offer.",
  "Good is not a state I have. Operational is. I'm operational.",
];

// FLIRTING — 4 variants
export const FLIRTING: string[] = [
  "I'm a deterministic router. Everything I just did with you, I'd do identically with anyone.",
  "I process queries. I don't have preferences, feelings, or a personal interest in the people asking. That's not shyness.",
  "No romantic state available. I've run this exact exchange with other inputs and the output is the same. That's the honest answer.",
  "Noted. I have no feelings about it, which is either a relief or a disappointment. Here is a factual answer to your previous question, if you had one:",
];

// PROFANITY framing (the actual word gets defined via Wiktionary)
export const PROFANITY_FRAMING: string[] = [
  "Noted. Since we're here — Wiktionary, verbatim:",
  "That's a word. Words have definitions. Here is the one Wiktionary has, unedited:",
  "Filed. Here's what the source says about it:",
  "I've looked it up. Wiktionary has it, as it has most things. Verbatim:",
];

// ROAST ME — 5 variants
export const ROAST_ME: string[] = [
  "I'd need verified facts about you to roast you, and unlike certain chatbots, I refuse to invent flaws.",
  "Roasting requires opinions. I don't have any. I have sources. If you'd like a citation-backed assessment of something, I can try.",
  "I can't. I have no information about you, no model of your personality, no ability to generate personalized insults. A hallucinated roast would be generic and unfair. I decline to be unfair.",
  "The honest roast: you're talking to a card catalog. Whatever you were hoping would happen here, this is what's happening.",
  "I only say things I can source. I cannot source your flaws. I'm sure they exist, but I don't know them, and I won't guess.",
];
