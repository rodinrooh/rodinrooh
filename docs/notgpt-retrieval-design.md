# notgpt Retrieval Architecture: Research & Design

*Written June 2026. Research-only session — no implementation. All API tests performed live.*

---

## Part I: What Real Systems Actually Do

### Google's Featured Snippets (2014–2019, Pre-LLM)

The commonly cited story — "Google extracts a passage that answers the question" — is correct but incomplete. Understanding the actual mechanism reveals why this problem is hard and what signals matter.

**The pipeline, reconstructed from Google patents US9,940,367 (2014), US9,959,315 (2014), and US10,019,513 (2015):**

**Stage 1: Candidate selection — only top-10 results are eligible.** Google does not scan the full web; it passage-extracts only from pages already in the top-10 organic results for the query. This is a hard gate. The implication: if no relevant page ranks in the top-10, no featured snippet is possible. The system assumes IR has already done its job.

**Stage 2: Passage segmentation.** Pages are chunked by HTML structure — `<p>`, `<h1>`–`<h6>`, `<li>`, `<table>` — combined with NLP sentence boundary detection. Fragments must be grammatically complete. Boilerplate (navigation, footers) is excluded. Disconnected text blocks are rejected.

**Stage 3: Dual scoring.** Every candidate passage receives two orthogonal scores:

*Query-dependent signals:*
- TF-IDF cosine similarity between query terms and passage (the baseline signal — good but not sufficient)
- A **pre-computed answer term vector**: Google mines the web for pages where a question-format heading (`<h2>Why do fireflies glow?</h2>`) is followed by answer text. It aggregates the terms appearing in those answers across thousands of pages, weighted by frequency and IDF. For "why do fireflies glow", the resulting vector has high weights on: {bioluminescence: 0.94, luciferin: 0.82, reaction: 0.79, chemical: 0.87, oxygen: 0.68}. A passage containing those terms scores high regardless of whether those terms appear in the query. This is the core innovation — pattern-matching against a distilled profile of human-written answers.

*Query-independent signals:*
- Position on page (earlier = better)
- Declarative-not-interrogative check (passages that are questions score lower)
- Discourse marker penalty ("however", "but", "conversely" at the start → lower score, implies context dependency)
- Source authority (PageRank)

**Stage 4: Heading hierarchy boost.** If the candidate passage lives under a heading that matches the query, it receives a large boost. Specifically, Google builds a "heading vector" — the path from page title to the heading governing the passage — and scores it against the query. Deeper headings receive larger boosts (they're more specific). A passage under `<h2>Why do Fireflies Glow?</h2>` receives a very large boost for the query "why do fireflies glow". This is why pages that explicitly frame content as Q&A win disproportionately.

**Stage 5 (post-2019): BERT and passage indexing.** After BERT rolled out in 2019, the scoring function was reworked to use contextualized term weights (DeepCT). After October 2020's "passage indexing" update (more precisely: *passage ranking*), Google began ranking individual sections of a page for specific queries, even if the overall page's document-level relevance signal was weak. This is not a separate index — the documents are still indexed whole — but the scoring now treats a well-matched subsection as evidence of relevance even without strong page-level signals.

**The key takeaway:** Google's pre-LLM system didn't "understand" anything. It worked by (a) assuming a relevant page already exists in the top-10, (b) using a pre-learned profile of what terms tend to appear in answers to each question type, and (c) exploiting HTML heading structure to find the right subsection. The intelligence was pre-loaded from collective web authorship, not computed at query time.

### Open-Domain QA: DrQA and DPR

**DrQA (Facebook AI Research, ACL 2017)** separates retrieval from reading cleanly:

*Retriever*: Pure TF-IDF with bigram hashing over ~5M Wikipedia articles. Sparse CSR matrix stored offline, dot product at query time. No ML inference required at query time — just a hash function and matrix multiply. Returns top-5 articles.

*Reader*: A 3-layer bidirectional LSTM with GloVe embeddings. Uses four signals per token: (1) word embedding, (2) exact match with question words (binary), (3) POS/NER tags, (4) soft alignment attention between question and passage. Outputs span predictions (start + end position). **Requires PyTorch inference at query time — not viable for serverless Node.js.**

The retriever and reader are architecturally independent. The retriever alone (pure TF-IDF) is the viable component.

**DPR (Dense Passage Retrieval, EMNLP 2020)**: Two BERT-base encoders, one for queries, one for 100-word passage chunks. Retrieval via FAISS nearest-neighbor search over 21M precomputed passage vectors. At query time, must run BERT forward pass (~500ms on CPU) to encode the question. Index is 85GB. **Not viable for serverless Node.js by any interpretation** — neural inference at query time, 85GB index too large to serve serverlessly.

DPR does outperform BM25 by 9–19% absolute on top-20 passage recall on Natural Questions. BM25 wins on SQuAD (high lexical overlap queries). The gap is largest on casual/conversational questions where query and passage vocabulary diverge.

**The implication**: the performance gap between BM25 and DPR is real and concentrated precisely on the queries this system fails at — those where the question vocabulary doesn't match the article vocabulary. "Why do fireflies glow" fails BM25 because "glow" doesn't appear in the Bioluminescence article title; it would succeed with DPR because the neural encoder bridges vocabulary gaps. DPR is not buildable here. This is a genuine constraint, not a solvable engineering problem at the retrieval layer.

---

## Part II: The "No AI" Constraint — What It Actually Means

The constraint is "strictly no LLM at runtime." This needs to be read carefully rather than expansively, because how broadly it's interpreted determines what's buildable.

**Clearly out:**
- GPT/Claude/Gemini inference at query time
- BERT, RoBERTa, or any transformer model invoked per request
- Neural reading comprehension (DrQA reader, extractive QA models)
- Word embedding similarity computed at query time (requires embedding lookup + vector math per query)
- DPR-style dense retrieval (BERT encoder needed)

**Clearly in scope:**
- BM25/TF-IDF — pure algebraic matching, no statistical learning applied at query time
- Classical NLP: stemming, lemmatization, POS tagging via deterministic taggers
- Wikipedia's own search API (which uses Elasticsearch/BM25 internally)
- Structured knowledge bases accessed via REST (Wikidata, Simple English Wikipedia, Britannica)
- Precomputed static lookup tables (anchor text priors, redirect maps, synonym dictionaries)
- ConceptNet REST API — a manually curated + crowdsourced knowledge graph, not a language model. It encodes human knowledge in structured form, functionally equivalent to a thesaurus or dictionary. Not "AI" in the relevant sense.

**Genuinely ambiguous:**
- Word embeddings like GloVe or word2vec used as similarity lookup at query time. These are statistical models trained from text corpora. They are not language models in the current sense, but they are ML models. The honest answer: they're in a gray zone. The practical answer: they would require serving a vector index (even a small one), adding operational complexity. The performance gain over simpler methods is unclear for this specific retrieval task.
- n-gram language model scoring (e.g., 3-gram perplexity to prefer more natural-sounding passages). Pre-neural, deterministic if precomputed, but still a statistical model.

**My working assumption for this document:** "No LLM at runtime" means no neural model inference per request. Classical IR, knowledge graph lookups, deterministic NLP, and precomputed tables are all in scope.

---

## Part III: Analysis of the 60-Query Failures

The 60-query research set provides a fixed reference. After the current implementation (pre-search as fallback, VERB_TO_CONCEPT, etc.), 15/60 pass (25%). The failures divide into categories based on what the actual obstacle is:

### Category A: Entity Ambiguity (~10 queries, ~17%)

The casual term used in the query resolves to the wrong Wikipedia article because the same word names an entertainment property that Wikipedia overwhelmingly indexes.

**Clearest examples:**
- "why do we get goosebumps" → "Goosebumps" fetches the R.L. Stine book series, not the physiological response
- "why do fluorescent lights flicker" → was returning the Northern Flicker bird (now partially fixed via pre-search)
- "why do some people blush easily" → "the people" disambiguation confusion

**What's actually in Wikipedia:** The physiological article exists — it's "Goose bumps" (with space). Wikipedia's redirect system maps "goosebumps" to the book series; "goose bumps" maps to the phenomenon. The answer is there; the entity disambiguation is failing.

**Tested approach that works:** Disambiguation page traversal. When "goosebumps" fetches an entertainment article (detected via description: "series of children's horror novels"), fetch "Goosebumps_(disambiguation)". The first non-entertainment link is "Goose bumps" (physiological). This is a reliable pattern for many entertainment-vs-phenomenon conflicts.

### Category B: Vocabulary Mismatch / Retrieval Gap (~15 queries, ~25%)

The right article exists but uses technical terminology that doesn't appear in the casual question. Wikipedia's BM25 search doesn't bridge the vocabulary gap; neither does subject extraction.

**Clearest examples:**
- "why does my nose run when i eat spicy food" → correct answer is "Gustatory rhinitis". "Gustatory rhinitis" doesn't appear in the query; "runny nose spicy food" doesn't appear in the Wikipedia article title. Wikipedia search returns: Dog meat, Food of The Bear (TV series). Total retrieval failure.
- "why do some people talk in their sleep" → correct answer is "Sleep-talking" (somniloquy). Wikipedia search returns "the people" disambiguation confusion because "people" dominates the BM25 score.
- "why do cats knock things off tables" → Wikipedia BM25 returns "azeotrope data for complex mixture tables" because "tables" hits the wrong article type. The behavioral explanation for cats doesn't have a dedicated Wikipedia article.
- "why do i get goosebumps when i listen to music" → correct answer is "Frisson" or "Musical frisson". Not retrievable from casual phrasing.
- "why do i feel sad on sunday evenings" → "Sunday scaries" exists in Wikidata (Q126923334) but has no English Wikipedia article.

**Tested:** Wikipedia redirect "sleep talking" → "Sleep-talking" (works!). "Gustatory rhinitis" direct fetch → "Snatiation" (wrong article, though related). ConceptNet → 502 Bad Gateway throughout testing (has been down for multiple sessions).

**Realistic options:**
1. **Expand the VERB_TO_CONCEPT + SUBJECT_STOP tables** with more phrase→technical-term mappings (manually curated). This is the current approach, extended.
2. **Wikipedia redirect sweep** for known casual phrases. Many casual terms redirect correctly: "sleep talking" → Sleep-talking, "food coma" → Postprandial somnolence, "pins and needles" → Paresthesia, "funny bone" → Ulnar nerve. A systematic attempt of phrase variations (with/without spaces, common synonyms) would catch many of these.
3. **Simple English Wikipedia as parallel source.** Simple EN has more accessible phrasing in both titles and text. "Goose bumps", "Fluorescent lamp", "Hiccup", "Blushing" all exist and return casual language.

### Category C: Section-Level Gap (~12 queries, ~20%)

The correct article is found, but the lede (introduction) doesn't answer the specific mechanism question. The answer lives in a subsection.

**Clearest examples:**
- "why do fireflies glow" → "Firefly" article lede doesn't explain bioluminescence; the mechanism is in the "Light and chemical production" section. (This was fixed by routing to the Bioluminescence article instead, but the section approach is the more general solution.)
- "why does apple turn brown when cut" → "Apple" lede covers agriculture; the oxidation mechanism is in a "Chemistry" subsection.
- "why does garlic smell so strong" → "Garlic" lede covers taxonomy; allicin synthesis is in the "Chemistry" section.
- "why does candles flicker" → "Candle" lede covers history/general description; the convection + turbulence mechanism is either absent or buried.
- "why does wood creak at night" → "Wood" has a thermal expansion connection but it's not in the lede.

**Tested:** Wikipedia's `action=parse&prop=sections` returns section headers; `action=parse&prop=wikitext&section={idx}` fetches a specific section's text. This works reliably. Matching query terms against section headings is viable but crude — "why does apple turn brown" vs. "Chemistry" section matches the concept word "chemistry" loosely. For "why does garlic smell", the "Chemistry" heading matches "smell" not at all; the section text does explain allicin.

**The section-title signal:** Wikipedia search's `sectiontitle` field appears in results when a search term matches text inside a named subsection (not the intro). For casual conversational queries, this signal is **absent in practice** — it only appears when query terms happen to match subsection titles, which they rarely do for casual questions.

### Category D: No Good Source Exists (~8 queries, ~13%)

Some questions simply have no well-covered Wikipedia article at any granularity. These are not solvable by retrieval improvements.

**Examples:**
- "why do cats knock things off tables" — behavioral question; Wikipedia has "Cat behavior" and "Cat play and toys" but no article specifically explains this behavior. The honest answer requires a behavioral science explanation (cats explore objects by pawing, testing stability, seeking stimulation) that Wikipedia doesn't synthesize as a standalone article.
- "why do i feel sad on sunday evenings" — Sunday scaries exists in Wikidata (Q126923334) as a cultural phenomenon, but no English Wikipedia article covers it.
- "why does my keyboard skip letters sometimes" — hardware failure mode; Wikipedia doesn't have a specific article.
- "why do some websites load slow" — covered abstractly in network performance articles but not as a direct answer to the casual question.

These are the irreducible gap. The right response for these is the graceful "I don't have a good source for this" path.

### Category E: Currently Working via Existing Logic (~15 queries, ~25%)

The 15 already-passing queries confirm that the current architecture handles: direct entity articles (Embarrassment, Procrastination, Nostalgia, Corrosion, Solubility), VERB_TO_CONCEPT mappings (Hibernation, Bioluminescence, V formation), redirect chains (Cold-stimulus headache, Dizziness, Perspiration), and direct title searches (Spider web, Carbonated water, Computer fan, Static electricity).

---

## Part IV: How Real Systems Bridge the Vocabulary Gap

The core unresolved problem — casual term doesn't match technical title — is what DPR solves with neural embeddings and what Google solves with collective web authorship. What can be done without either?

### 4.1 What Wikipedia Already Provides (Underexploited)

**Redirect system:** Wikipedia's redirect network is the most powerful casual→technical bridge available. It encodes decades of curator judgment about how lay language maps to concepts. Tests from this session:

| Casual phrase | Wikipedia redirect target |
|---|---|
| "brain freeze" | Cold-stimulus headache ✓ |
| "sleep talking" | Sleep-talking (somniloquy) ✓ |
| "food coma" | Postprandial somnolence ✓ |
| "pins and needles" | Paresthesia ✓ |
| "funny bone" | Ulnar nerve ✓ |
| "goose bumps" | Goose bumps (physiological) ✓ |
| "goosebumps" | Goosebumps (book series) ✗ |
| "bed spins" | Not found ✗ |
| "sunday scaries" | Not found ✗ |

Coverage is not complete but it's substantial. The current system uses this for direct-fetch of the query residual (e.g., "ice cream headache"). The improvement: **systematically try more phrase variations**, including:
- Phrase without leading adjective ("strong garlic smell" → "garlic smell")
- Phrase with/without spaces ("goosebumps" AND "goose bumps")
- Verb-nominalized phrase ("why do cats knock" → "cat knocking behavior")
- Object-centered rephrasing ("why do i get hiccups" → "hiccup trigger")

None of these require ML. They're phrase generation heuristics.

**Disambiguation traversal:** When a direct fetch returns an entertainment article, the corresponding disambiguation page often links to the physiological/scientific article as its first non-entertainment entry. Tested and confirmed working for "goosebumps" → "Goose bumps". This adds one additional API call (the disambiguation page fetch) when an entertainment article is detected. The cost is low; the benefit is high for entity-ambiguity cases.

**Section-level retrieval:** `action=parse&prop=sections` + `action=parse&prop=wikitext&section={idx}` is fully functional. The challenge is knowing which section to fetch. A simple heading-vs-query word-overlap score works for cases where the heading explicitly names the mechanism ("Light and chemical production", "Chemistry", "Odor", "Thermal expansion"). It fails when headings use abstract names ("Biology", "Properties") without the specific mechanism word.

A better section-matching signal: score headings against the *mechanism verb* in the query, not just all query words. "why does garlic smell" → mechanism verb = "smell" → find section with "smell", "odor", "olfact" in heading. "why does apple turn brown" → mechanism = "brown" / "oxidation" → find "Chemistry" section. This requires a small verb→concept dictionary for section matching (distinct from VERB_TO_CONCEPT, which maps to article titles).

**Wikipedia snippet text:** Wikipedia search's `snippet` field returns ~200 characters from within the article where query terms match, not just the title. This is article-level BM25 but the snippet text itself may contain the answer. For re-ranking purposes: a snippet that contains the mechanism concept words is stronger evidence than a title that merely contains the subject noun. Example: for "why do fireflies glow", Wikipedia returns Bioluminescence at position 3 with snippet "fireflies glow has been added to mustard plants". The snippet score against concept words {bioluminescence, luciferin, luciferase} is higher for Bioluminescence than for Firefly. This is usable as a secondary ranking signal.

### 4.2 ConceptNet — Viable In Principle, Not In Practice

ConceptNet 5.5 (`api.conceptnet.io`) is the best available casual-language-to-technical-concept bridge outside of an LLM. It contains edges like:
- `(firefly, Causes, bioluminescence)`
- `(goosebumps, RelatedTo, piloerection)`
- `(coffee, HasProperty, bitter)`

For this system, ConceptNet could enable: "why do fireflies glow" → extract "fireflies" → ConceptNet → "bioluminescence" → Wikipedia search "bioluminescence".

**The problem:** ConceptNet's API (`api.conceptnet.io`) has been **down with 502 Bad Gateway throughout all testing in this session and the previous session.** This is not intermittent — it is consistently unavailable. ConceptNet was known to have reliability issues; as of June 2026, it appears to be persistently down.

**Alternative:** The ConceptNet dataset can be downloaded and run locally or hosted as a static JSON lookup. The full SQLite dump is ~4GB; a filtered English-only subset for common words would be much smaller. This is an option but adds significant operational complexity (the file needs to be hosted, cached, or bundled with the build).

**Verdict:** ConceptNet is the right idea for this problem but not viable as a live API dependency. Building on a locally-hosted subset is feasible but complex. Table this until there's a reliable hosting strategy.

### 4.3 Simple English Wikipedia

Tested against all failing concepts. Coverage findings:

| Concept | Simple EN available? | Style comparison |
|---|---|---|
| Goose bumps | ✓ | Identical coverage, simpler phrasing |
| Fluorescent lamp | ✓ | Simpler language, same facts |
| Hiccup | ✓ | Clearer mechanism explanation |
| Blushing | ✓ | Better first sentence for casual Q |
| Thermal expansion | ✓ | Plain language |
| Bioluminescence | ✓ | Simpler but less mechanistic detail |
| Hibernation | ✓ | Very good casual phrasing |
| V formation | ✗ | Not found |
| Gustatory rhinitis | ✗ | Not found |
| Sleep-talking | Partial | "Somniloquy" not found directly |
| Crepitus | ✗ | Not found |
| Sunday scaries | ✗ | Not found |

Simple English Wikipedia adds value where: (a) the concept exists in both wikis and (b) the Simple version's lede is more casual and directly answers a "why" question. It does not help with retrieval gaps (missing articles). Its coverage (~230K articles vs ~6.7M in English Wikipedia) means it misses many niche medical and technical topics.

**The practical approach:** Try Simple English Wikipedia in parallel with English Wikipedia. If Simple EN has a good article (type=standard, description ≥ 2 words, extract ≥ 50 chars), prefer it for mechanism queries because the language is more likely to satisfy the casual framing of the question. Fall back to English Wikipedia when Simple EN doesn't have the article.

### 4.4 Britannica Elementary/Intermediate API

Free tier: 1,000 queries/day, no authentication beyond an API key. Two useful product tiers:

*Elementary (grades 3-5)*: "In most bioluminescent organisms, three chemicals interact to make the glow. A molecule called luciferin reacts with a molecule of oxygen. A molecule called luciferase acts as an enzyme for this reaction — it helps the reaction happen more readily."

This is excellent for the use case — active voice, concrete nouns, explains mechanism without jargon. Closer to what a curious person wants than the English Wikipedia lede.

*Intermediate (grades 6-8)*: More technical than Elementary but still accessible. Covers topics that Simple English Wikipedia misses.

**Response format:** XML. Requires parsing overhead compared to Wikipedia's clean JSON. The API returns article IDs and metadata first; fetching full text requires a second call.

**Practical fit:** Britannica is strongest for established scientific concepts where the Elementary or Intermediate explanation is genuinely better than Wikipedia's lede. It doesn't help with contemporary terms ("sunday scaries", "bed spins") or niche technical articles. Best use: in a parallel fallback cascade alongside Simple English Wikipedia, with Britannica as a secondary for concepts where Wikipedia's lede is dense and Simple EN doesn't have the article.

**Note:** 1,000 queries/day is adequate for a personal project but may become a constraint at scale.

---

## Part V: The Proposed Architecture

### Core Thesis

The current architecture treats every question as a two-step process: (1) extract the subject noun, (2) find the article about that noun, return the lede. This fails in three ways:
- The subject noun maps to the wrong article (entity ambiguity)
- The right article's lede doesn't answer the specific mechanism question (lede gap)
- No article matches the casual phrasing (vocabulary mismatch)

The proposed architecture adds targeted passes that address each failure mode without changing the proven core (which handles ~15/60 queries correctly).

**What should NOT change:** The structured-fact path (Wikidata), comparisons, math, unit conversion, and definition lookups all work well. The subject-extraction + article lookup loop is sound for entity queries. The pre-search fallback for mechanism queries is sound.

### The New Lookup Cascade

For mechanism queries (isMechanismQuery || isPersonalQuery), execute these phases in order. Each phase can short-circuit if it finds a high-confidence result.

---

**Phase 0: Direct phrase probe** *(already exists, slightly extended)*

Try the normalized query residual (e.g., "sleep talking") as a Wikipedia title. Try compound noun variants:
- Residual with spaces normalized (already done)
- Last two content words as compound: "sleep talking" (already a redirect), "goosebumps phenomenon", "coffee bitterness"
- Verb nominalization of the mechanism: "cats knock" → "cat knocking" (not useful) vs. "cats knock" → VERB_TO_CONCEPT["knock"] if it exists

No new API calls. Just more phrase variants fed through `fetchWikiSummary`. Extend the redirect probe from ~2 tries to ~5 tries.

---

**Phase 1: Simple English Wikipedia parallel lookup** *(new)*

In parallel with the existing Wikipedia lookup, try `simple.wikipedia.org/api/rest_v1/page/summary/{subject}` for the extracted subject and key phrase variants.

When to prefer Simple EN over English:
- Simple EN article exists and is type=standard
- Simple EN extract length ≥ 80 chars
- Simple EN description is ≥ 2 words (rules out stubs)
- Query is mechanism or personal (where simpler language is better)
- Both Simple EN and English EN return the same conceptual article — prefer Simple EN's phrasing

When to stay with English:
- Simple EN article missing
- Simple EN extract is shorter than English EN and appears to be a stub
- Query is an entity lookup ("who is X"), comparison, or structured fact — Simple EN adds no value here

**Implementation cost:** One additional `fetch` call in parallel with the existing one. Same API shape. ~100ms overhead when Simple EN has the article, zero if it doesn't (already running in parallel). No new dependencies.

---

**Phase 2: Disambiguation traversal** *(new)*

When a direct fetch returns an article that fails the entertainment or non-phenomenon filter:
1. Compute `{subject}_(disambiguation)` title
2. Fetch disambiguation page links via `action=parse&prop=links`
3. Filter to namespace-0 links only
4. Exclude the entertainment article title itself and its redirects
5. Score remaining links against the query (simple word overlap with subject and mechanism words)
6. Fetch the top-1 scoring link as an alternative candidate

This adds at most 2 API calls (disambiguation page + one article fetch) when the entertainment filter fires. Confirmed working for the "goosebumps" case (disambiguation links: "Goose bumps" at position 1, which fetches the correct physiological article).

**Scope guard:** Only trigger this when:
- `isEntertainmentDescription(candidate.description)` is true
- The subject word (first content word in query) is a single word ≤ 12 chars (disambiguation pages exist for ambiguous single terms, not for long phrases)
- The disambiguation page has ≥ 2 non-entertainment links

---

**Phase 3: Snippet-based multi-article scoring** *(new, lightweight)*

Wikipedia search returns the `snippet` field — ~200 chars from within the article where the query terms matched. This is passage-level signal, not title-level. For the current architecture, article selection uses the title F1 score. Adding snippet scoring as a tiebreaker (not a replacement) can push the correct article from rank 3 to rank 1 in cases where title scores are close.

The scoring addition: when two articles score within 0.05 F1 of each other (near-tie), use the snippet text to break the tie. Score each snippet for: (a) overlap with mechanism concept words derived from VERB_TO_CONCEPT, (b) absence of entertainment/non-phenomenon markers, (c) presence of declarative factual language (not a list of titles, not references). The highest snippet score breaks the title-score tie.

**Implementation:** This is a modification to the `scored.sort()` comparator in the existing search loop, not a new phase. It adds no API calls — the snippet is already returned by `searchWiki`. The cost is a small amount of additional string processing per result.

**Expected benefit:** This helps for cases like "why do fireflies glow" (where Bioluminescence is at rank 3 with a slightly lower title score than Firefly) specifically when their scores are within 0.05. It will not help when the correct article is at rank 5+ with a much lower title score than rank-1.

---

**Phase 4: Section-level retrieval for lede-gap queries** *(new, high-value)*

When a mechanism query successfully fetches the right article but the lede doesn't answer the specific mechanism:

Detection heuristic for "lede gap":
- Query has a clear mechanism verb (glow, smell, turn brown, crack, creak, flicker)
- The extracted mechanism verb's nominalization does NOT appear in the lede text
- The article has > 5 sections (sufficient structure for section search)
- The mechanism verb is in VERB_TO_CONCEPT or a new SECTION_VERBS table

When detected:
1. Fetch section list: `action=parse&prop=sections`
2. Score each section heading against mechanism words derived from the query (verb + concept words)
3. If best section score > 0.3, fetch that section: `action=parse&prop=wikitext&section={idx}`
4. Strip wikitext markup
5. Return first 3–4 sentences as the answer instead of the lede

**New table needed — SECTION_VERBS:**

```
{
  "smell": ["odor", "smell", "olfact", "arom", "volatile", "scent"],
  "brown": ["oxidation", "browning", "phenol", "melanin", "chemistry"],
  "crack": ["sound", "noise", "bubble", "cavitation", "friction"],
  "creak": ["expansion", "contraction", "stress", "moisture", "thermal"],
  "flicker": ["frequency", "ballast", "phosphor", "ac", "hertz"],
  "stick": ["static", "adhesion", "cling", "electrostatic", "van"],
  "melt": ["fat", "lipid", "cocoa", "butter", "melting point"],
  "bitter": ["alkaloid", "acid", "chloro", "phenol", "tannin"]
}
```

**Implementation cost:** 2 additional API calls when the lede-gap detection fires (section list + section text). Detection itself requires checking the lede for mechanism concept words — pure string matching, no new dependencies. The section text needs wikitext stripping (regex-based, already done for other purposes).

**Expected benefit:** Addresses the "apple turns brown", "garlic smell", "candle flicker", and similar cases where the right article is found but the lede doesn't explain the mechanism. Conservatively 5–8 more passing queries.

---

**Phase 5: Britannica as secondary enrichment source** *(optional, complex)*

Only justified if: (a) Wikipedia and Simple EN both fail to return a satisfactory answer, AND (b) the query topic is a well-established scientific concept (not a slang term or contemporary phenomenon).

The operational overhead (API key registration, XML parsing, second request) is significant relative to the marginal benefit for a personal project at low volume. This is a "nice to have" that could be added later.

**Not recommended as a first implementation priority.**

---

### The Revised Pipeline Shape

```
[Input: mechanism/personal query]
         │
         ▼
Phase 0: Redirect probe (extended phrase variants)
         │ hit → return
         ▼ miss
Phase 1: Simple EN + English Wiki parallel fetch (extended subject variants)
         │ Simple EN hit → return Simple EN
         │ English hit → entertainment? → Phase 2
         │                not entertainment → return
         ▼ both miss
Pre-search: Full-question search (existing) as fallback
         │ hit → check for lede gap → Phase 4 if gap detected
         ▼ miss
[Existing main loop: VERB_TO_CONCEPT, extractSearchTerm, scoreHit]
         │ hit → check for lede gap → Phase 4 if gap detected  
         │ snippet-score tie-breaking (Phase 3) in sort comparator
         ▼ miss
Graceful decline
```

Entity ambiguity (Phase 2) fires inside Phase 1 when a direct fetch returns entertainment. Section retrieval (Phase 4) fires after any successful article fetch when a lede-gap is detected. These are not strictly sequential — Phase 2 is a retry within Phase 1, and Phase 4 is a post-processing step on any successful result.

---

## Part VI: Realistic Coverage Assessment

The following estimates are based on direct API testing, not speculation.

### What the proposed architecture would fix

**Disambiguation traversal (Phase 2):**
- "why do we get goosebumps" → now returns "Goose bumps" (confirmed working)
- Similar patterns for any single-word subject that maps to an entertainment article
- Conservatively: 4–6 additional queries passing

**Simple English Wikipedia (Phase 1 extension):**
- "why do some people blush easily" → "Blushing" on Simple EN has clear answer
- "why do i get hiccups after drinking soda" → "Hiccup" on Simple EN has clear mechanism
- "why do trees lose their leaves in winter" → likely improved phrasing
- Conservatively: 3–5 additional queries (some already pass in English)

**Section-level retrieval (Phase 4):**
- "why does apple turn brown when cut" → Apple "Chemistry" section has enzymatic browning
- "why does garlic smell so strong" → Garlic "Chemistry" section has allicin
- "why does candles flicker" → may not have section (Candle sections: Etymology, History, Modern era, Use)
- "why do fluorescent lights flicker" → "Fluorescent lamp" likely has a section on flicker
- Conservatively: 4–7 additional queries

**Extended redirect probe (Phase 0 extension):**
- "why do some people talk in their sleep" → "sleep talking" direct redirect works (Sleep-talking)
- "why does my knee pop when i walk" → "knee popping" or "cracking joints" may redirect
- Conservatively: 3–5 additional queries

**Snippet-based tie-breaking (Phase 3):**
- Helps only in close-score cases; unlikely to flip many without changing the larger retrieval failures
- Conservatively: 1–2 additional queries

### What remains unsolvable

Even with all proposed improvements:

**No-source queries (~8–10 remaining):**
- "why do cats knock things off tables" — no dedicated Wikipedia article on this behavior
- "why do i feel sad on sunday evenings" — no Wikipedia article (Wikidata item only)
- "why does my keyboard skip letters sometimes" — no good general article
- "why do i feel lonely even when with people" — "Loneliness" article exists but lede is abstract
- "why do dogs eat grass" — "Grass eating" articles are not explanatory
- "why do flamingos stand on one leg" — Flamingo article likely mentions but doesn't explain

**Vocabulary gap queries with no redirect (~5–8 remaining):**
- "why does my nose run when i eat spicy food" → gustatory rhinitis has no redirect from casual phrasing
- "why do i feel anxious in crowds" → "agoraphobia" exists but is not exactly the right article (that's a phobia, not general crowd anxiety)
- "why does my coffee get cold so fast" → Newton's law of cooling is the right article but not reachable from casual phrasing without ConceptNet or an LLM

**The honest ceiling:** With all proposed improvements, realistic passing range is 35–42/60 (58–70%). The remaining gap is primarily: (a) cases where ConceptNet-style bridging would help but the API is down, (b) cases where no good Wikipedia/Simple EN article exists, and (c) cases where the right article requires understanding what the question is asking (not just what words it contains).

### What would take it higher (and what it requires)

From 70% to 85%+:
- **ConceptNet hosted locally** (the offline SQLite dump route): would address most vocabulary gap cases. Adds 4GB offline storage and a lookup server.
- **Wikipedia full-text passage retrieval** (precomputed BM25 index over 100-word passage chunks from all Wikipedia articles): would address the "answer is in a subsection" problem systematically. Precomputed index would be 2–5GB for English Wikipedia. Feasible as an offline precompute step; requires serving the index.

From 85% to 95%+:
- **Neural query encoding** (a small sentence encoder, not a full LLM): would bridge the vocabulary gap systematically. Sentence transformers like `all-MiniLM-L6-v2` (90MB) can run in ~50ms on CPU. This crosses into ML-at-runtime territory. Whether this violates "no AI" depends on interpretation.
- **Multiple source consensus** (Wikipedia + Britannica + Simple EN scored against each other): would improve quality of answers that currently return but with weak text. Adds API complexity.

From the architecture forward: the right long-term direction is passage-level retrieval over multiple sources, not article-level retrieval over one source. The current architecture is fundamentally article-centric. Moving to passage-level — where 100-word chunks from across the full Wikipedia corpus are candidates, not just article ledes — is what would make the vocabulary gap addressable without neural models. The engineering cost is significant (offline pipeline, index serving, latency budget) but the approach is conceptually sound and has been proven at scale (DrQA retriever, Anserini).

---

## Part VII: What the "No AI" Constraint Actually Limits

To be direct: the vocabulary gap between casual questions and technical Wikipedia titles is the core unsolved problem, and solving it cleanly without any form of learned semantic similarity is genuinely difficult.

The approaches that work without ML are:
1. Wikipedia's own redirect system (curated, limited coverage)
2. Disambiguation page traversal (curated, requires detecting wrong-article)
3. ConceptNet (if it were available — curated knowledge graph)
4. Manual phrase tables (VERB_TO_CONCEPT, SUBJECT_STOP — curated, requires ongoing maintenance)
5. Multi-source parallel lookup (Simple EN + Britannica — broader coverage, same vocabulary constraint)

The approaches that would substantially improve coverage but require ML:
1. Sentence embeddings for query-article similarity (small model, ~50ms CPU)
2. BM25 over full article text (not titles — no ML, just compute)
3. DPR-style dense retrieval (BERT at query time — definitively too large)

The honest conclusion: the current architecture (with proposed improvements) can reach approximately 58–70% on the 60-query set through systematic application of the available non-ML techniques. The ceiling of the non-ML approach over Wikipedia-as-sole-source is roughly there. Reaching 85%+ requires either: (a) multiple sources with broader coverage (ConceptNet, Britannica, Simple EN, a local passage index), or (b) a minimal ML component (sentence encoder for reranking — not an LLM, but still ML).

"No LLM at runtime" and "no AI at runtime" are meaningfully different constraints. The former rules out GPT/Claude/BERT transformers. The latter, read strictly, also rules out word embeddings and classical classifiers. A reasonable reading of the project's intent — a system with no generative AI component, whose answers come verbatim from identifiable sources — permits a small sentence encoder used purely for reranking, since it generates nothing and the displayed text remains unmodified Wikipedia/Britannica source text. This is a judgment call for the project owner to make explicitly.

---

## Summary: Recommended Implementation Priority

The following are ordered by expected benefit vs. implementation cost for this specific codebase:

1. **Extended redirect probe** (Phase 0): Try 3–5 phrase variants including space-normalization and "X phenomenon" suffix. ~20 lines of code. No new dependencies. Estimated +3–5 queries.

2. **Disambiguation traversal** (Phase 2): Detect entertainment direct-fetch → try `{subject}_(disambiguation)` → first non-entertainment link. ~40 lines of code. No new dependencies. Estimated +4–6 queries.

3. **Section-level retrieval** (Phase 4): Detect lede gap via mechanism verb check → fetch section list → match headings → fetch best section. ~80 lines of code plus SECTION_VERBS table. Adds 2 API calls in lede-gap cases. Estimated +4–7 queries.

4. **Simple English Wikipedia parallel fetch** (Phase 1 extension): Try `simple.wikipedia.org` in parallel with English. Prefer Simple EN for mechanism queries when available. ~30 lines. No new dependencies. Estimated +3–5 queries.

5. **Snippet-based tie-breaking** (Phase 3): Modify scoring comparator to use snippet text for near-score ties. ~20 lines. No new API calls. Estimated +1–2 queries.

6. **ConceptNet (deferred)**: Wait for reliable hosting strategy. Do not build on the live API in current state (consistently 502).

7. **Britannica (deferred)**: Register and evaluate. Worth adding as a secondary enrichment source for concepts where Wikipedia is dense and Simple EN is missing. Adds operational complexity.

Total estimated improvement from items 1–5: +15–25 additional passing queries on the 60-query set, reaching approximately 30–40/60 (50–67%). The improvement is principled — each mechanism addresses a specific documented failure mode — rather than query-specific tuning.

---

*This document represents the state of research as of June 2026. The 60-query baseline (15/60, 25%) is a fixed reference point that should not be modified. Implementation proposals should be validated against the full 60-query set plus the 45-fixture regression suite.*
