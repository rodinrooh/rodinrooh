# notgpt Retrieval — Empirical Findings

*June 2026. Results from 51-query sealed final set, never seen during development.*

## Result: 10/51 correct (20%)

Using the strict definition: "does this response specifically address the mechanism, cause, or fact the question actually asked — not just topically related."

---

## Three Failure Categories

### Category 1: Vocabulary Mismatch (~40% of failures)

The correct Wikipedia article simply does not appear in the top 20 Wikipedia search results for the casual phrasing. BM25 over article titles and text cannot bridge the gap between lay vocabulary and technical article names.

**Confirmed by directly querying the Wikipedia search API (top 20):**

| Casual query | Correct article | Appears in top 20? |
|---|---|---|
| "why does sand squeak when you walk on it" | Singing sand | **No** |
| "why does wood float but metal sinks" | Buoyancy / Archimedes' principle | **No** |
| "why does the ground steam after rain" | Petrichor | **No** |
| "why do moths fly toward light" | Phototaxis | **No** |
| "why do birds sing in the morning" | Dawn chorus (birds) | **No** |
| "why does alcohol make people feel warm" | Vasodilation / Alcohol flush | **No** |
| "why do elephants have such good memory" | Elephant cognition | **No** |
| "why does glass fog up" | Condensation | **No** |
| "why does metal feel colder than wood" | Thermal conductivity | **No** |

The Wikipedia BM25 search matches articles about: a programming language (for "squeak"), a ship sinking, a painting by Dalí, a Maya Angelou book, a Scottish village, a Roman wine practice, a UK phone myth, "Wood's metal" alloy, "ground meat." These single-word collisions dominate BM25 ranking.

**What would fix this:** A query reformulation layer (either a lookup table or a model that can predict the technical article title from the casual question), OR a web search source that returns specific-topic pages rather than Wikipedia's BM25 ranking.

---

### Category 2: Generic Article Returned (~30% of failures)

The system finds the right-domain Wikipedia article but returns its generic lede, which doesn't address the specific mechanism. The answer lives in a subsection or a more specific article.

**Examples from final set:**

| Query | Article returned | What was missing |
|---|---|---|
| "why do onions make your eyes water" | Onion (generic) | Syn-propanethial-S-oxide mechanism in a subsection |
| "why do leaves change color in fall" | Leaf (generic) | Autumn leaf color article / chlorophyll breakdown |
| "why does helium make your voice high" | Helium (generic) | Speed of sound in helium (did appear in search at rank 1 — fixable) |
| "why do bees make honey" | Honey bee (generic) | Honey article explaining colony food storage |
| "why do golf balls have dimples" | Golf ball (generic) | Dimple aerodynamics in subsection |
| "why do cats purr" | Purr (correct article!) | Truncated before the "why" explanation |

**What would fix this:** Section-level retrieval (already prototyped — fetch sections, score headings against query, return best section). For cases where the right article IS in search results, passage-level BM25 or sentence similarity over article text would select the right paragraph.

---

### Category 3: Pure Retrieval Gap (~15% of failures)

No relevant article appears in Wikipedia search at all, because the query doesn't contain any words that appear in relevant article titles OR body text at high BM25 rank.

**Examples:**

| Query | What returns | Why it fails |
|---|---|---|
| "why does sand squeak when you walk on it" | Programming language "Squeak" | "squeak" has a famous Wikipedia article as a language |
| "why do birds sing in the morning" | Maya Angelou book "I Know Why the Caged Bird Sings" | BM25 matches song/book titles, not bird behavior |
| "why does the ground steam after rain" | "Ground meat" | "ground" → food article, not geology |
| "why does wood float but metal sinks" | Ship sinkings, "Wood's metal" alloy | Both "wood" and "metal" name entirely different things |
| "why do elephants have such good memory" | Salvador Dalí painting "The Elephants" | BM25 matches on "elephants" |

These queries have zero overlap between their casual vocabulary and any relevant article title. The problem is not ranking — it's that relevant articles genuinely don't rank. 

**What would fix this:** Web search (Google/DuckDuckGo would immediately return "Singing sand", "Dawn chorus", "Petrichor"), OR a precomputed phrase→article mapping built offline from Wikipedia redirects + ConceptNet (currently down) + manual curation.

---

## What Actually Works (the 20%)

The system reliably handles queries where:
1. The casual phrase directly redirects to a technical article ("brain freeze" → Cold-stimulus headache, "charley horse" → Muscle cramp, "funny bone" → Ulnar nerve)
2. The technical article name is predictable from the mechanism verb ("hibernate" → Hibernation, "ferment" → Fermentation, "shiver" → Shivering)
3. The article name closely matches the question's vocabulary ("lunar phases" for "why does the moon have phases", "thunder" for "why does thunder follow lightning", "sleep inertia" for "feel groggy after nap")

**Correctly answered in final set:** Moon phases, Sleep inertia, Fermentation, Acute muscle soreness, Food preservation, Thunder/lightning, Borborygmus (stomach growl), Mirror lateral inversion, Blepharospasm (eye twitch), Popcorn expansion.

---

## Architectural Conclusion

The current architecture ("extract a subject → BM25 search → return article lede") has a ceiling of roughly 20-25% on a diverse set of casual mechanism questions. This is not a parameter-tuning problem — it's an architectural one.

The ceiling is set by how often the casual vocabulary in the question overlaps with words in the correct article's title. For questions where the correct article is "Phototaxis", "Petrichor", "Dawn chorus", "Thermal conductivity", "Vasodilation", the question words have zero overlap with the article title and BM25 cannot bridge the gap.

**The three things that would genuinely move the needle:**

1. **Web search** (highest impact): Replace Wikipedia BM25 with a real search engine for the initial retrieval. Google/DuckDuckGo surfaces "Singing sand", "Dawn chorus", "Petrichor" immediately for the casual phrasing, because they index anchor text, user queries, and semantic signals that Wikipedia's internal search doesn't.

2. **Dense retrieval over Wikipedia full text**: A precomputed FAISS index over 100-word Wikipedia passages (DPR-style, but offline) would surface "Phototaxis" for "moths toward light" because the passage text contains both concepts. 85GB is impractical for serverless; a smaller filtered index (~5-10GB on mechanism-relevant articles) might be viable.

3. **Query reformulation**: Map casual questions to technical terms before retrieval — either via a small lookup table (manually curated for high-frequency patterns) or a lightweight model. "Sand squeaking when walking" → search "singing sand". "Metal feels cold" → search "thermal conductivity". Even 500 well-chosen mappings would cover most common cases.

None of these require LLM generation. All keep source text as verbatim Wikipedia (or equivalent free-license factual source). The sentence-similarity model alone does NOT fix the retrieval gap — as confirmed, the correct articles don't appear in search results at all for most failures.
