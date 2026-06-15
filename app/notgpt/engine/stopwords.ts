/**
 * Shared stopword sets for the notgpt engine.
 *
 * Single source of truth — import from here instead of defining inline sets.
 * Each set builds on the previous via spread so additions stay DRY.
 */

// Core English function words: articles, prepositions, pronouns, auxiliaries, conjunctions.
export const CORE_STOPS = new Set<string>([
  // Articles
  "the","a","an",
  // Prepositions
  "of","in","on","at","to","for","with","by","from","as","into","through",
  "during","before","after","since","between","about","over","under","above",
  "below","than","so","if","yet","off","up","down","out","along","around","away","back",
  // Pronouns
  "i","me","we","us","you","he","him","she","her","they","them","it","its",
  "my","your","his","our","their","this","that","these","those","one","whom","whose",
  // Auxiliaries
  "is","are","was","were","be","been","being","am",
  "have","has","had","do","does","did",
  "will","would","could","should","may","might","can","shall","must",
  // Conjunctions / negation
  "and","or","but","nor","not","no",
  // Common adverbs / quantifiers
  "very","just","also","too","both","each","any","all","more","most","some",
])

// CORE_STOPS + question/scaffold words. Use when question words must not score.
export const QUESTION_STOPS = new Set<string>([
  ...CORE_STOPS,
  "what","which","who","when","where","why","how",
])

// Scoring stop set for title-vs-query BM25. Extends QUESTION_STOPS with broad
// action verbs and color/adjective words that produce false matches ("Hot Space"
// for "why is fire hot"; "Water" article for "eyes water").
export const SCORING_STOPS = new Set<string>([
  ...QUESTION_STOPS,
  // Generic action verbs
  "take","put","get","make","come","go","see","let","keep","give","set","run",
  "try","use","work","need","want","know","think","feel","look","turn","rise",
  // Color/adjective words
  "water","warm","cool","big","small","large","tiny","fast","slow",
  "dark","bright","light","heavy","hard","soft","loud","quiet","deep","high",
  "red","blue","green","black","white","yellow","orange","purple","gray",
  "old","new","young","long","short","far","near","good","bad","great",
  "wet","dry","sharp","dull","thick","thin","full","empty","clean","dirty",
  // Generic meta-process words
  "happens","happen","occurring","occurred","occur","resulting","result","causes","caused",
])

// Subject-extraction stops: QUESTION_STOPS + slang + process verbs.
// Used to strip query scaffolding and extract the noun phrase being asked about.
export const SUBJECT_STOPS = new Set<string>([
  ...QUESTION_STOPS,
  // Slang and conversational filler
  "yo","wtf","tf","af","lol","omg","bruh","dude","bro","huh","ngl","tbh","lmao",
  "lowkey","highkey","literally","basically","honestly","actually","seriously",
  // Generic process verbs that appear in questions but aren't the subject
  "happen","happens","happened","work","works","worked","occur","occurs","occurred",
  "form","forms","formed","go","goes","run","runs","come","comes","came",
])

// Passage-scoring stops: words that appear in questions but don't appear in
// mechanism explanations, so they'd skew passage selection if scored.
export const PASSAGE_STOPS = new Set<string>([
  ...CORE_STOPS,
  "how","why","what","who","when","where",
  "feel","make","go","come","give","take","very","just","also","about","some",
  "work","works","happen","happens","occur","occurs","cause","causes",
  "like","want","need","tell","show","find","keep","talk",
])
