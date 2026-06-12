import type { ProvenanceEntry } from "../envelope";

const WIKIMEDIA_UA =
  "notgpt/1.0 (https://rodinrooh.com/notgpt; rodin.roohipour@whop.com)";

export type DictionaryEntry = {
  word: string;
  phonetic?: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }>;
  }>;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

async function fetchWiktionary(
  term: string
): Promise<DictionaryEntry | null> {
  const encoded = encodeURIComponent(term);
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encoded}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 604800 },
  });

  if (!res.ok) return null;

  const data = await res.json();

  // Wiktionary returns { "en": [...] } keyed by language
  const entries: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; examples?: string[] }>;
  }> = data?.en ?? [];

  if (!entries.length) return null;

  const meanings = entries.map((e) => ({
    partOfSpeech: e.partOfSpeech ?? "unknown",
    definitions: (e.definitions ?? []).map((d) => ({
      definition: stripHtml(d.definition ?? ""),
      ...(d.examples && d.examples.length
        ? { example: stripHtml(d.examples[0]) }
        : {}),
    })),
  }));

  return {
    word: term,
    meanings,
  };
}

export async function fetchDefinition(
  term: string
): Promise<{ entry: DictionaryEntry; source: string } | null> {
  const encoded = encodeURIComponent(term);
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`;

  const res = await fetch(url, {
    next: { revalidate: 604800 },
  });

  if (res.status === 404) {
    // Fall back to Wiktionary
    const wkt = await fetchWiktionary(term);
    if (wkt) return { entry: wkt, source: "wiktionary" };
    return null;
  }

  if (!res.ok) {
    const wkt = await fetchWiktionary(term);
    if (wkt) return { entry: wkt, source: "wiktionary" };
    return null;
  }

  const data = await res.json();

  // Check for "No Definitions Found" response
  if (data && !Array.isArray(data) && data.title === "No Definitions Found") {
    const wkt = await fetchWiktionary(term);
    if (wkt) return { entry: wkt, source: "wiktionary" };
    return null;
  }

  const entries: Array<{
    word?: string;
    phonetic?: string;
    meanings?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{
        definition?: string;
        example?: string;
        synonyms?: string[];
        antonyms?: string[];
      }>;
    }>;
  }> = Array.isArray(data) ? data : [data];

  if (!entries.length) return null;

  const first = entries[0];
  const entry: DictionaryEntry = {
    word: first.word ?? term,
    phonetic: first.phonetic,
    meanings: (first.meanings ?? []).map((m) => ({
      partOfSpeech: m.partOfSpeech ?? "unknown",
      definitions: (m.definitions ?? []).map((d) => ({
        definition: d.definition ?? "",
        ...(d.example ? { example: d.example } : {}),
        ...(d.synonyms?.length ? { synonyms: d.synonyms } : {}),
        ...(d.antonyms?.length ? { antonyms: d.antonyms } : {}),
      })),
    })),
  };

  return { entry, source: "dictionaryapi" };
}

export function dictionaryProvenance(
  source: string,
  term: string
): ProvenanceEntry {
  const urlMap: Record<string, string> = {
    dictionaryapi: `https://dictionaryapi.dev/`,
    wiktionary: `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`,
  };

  return {
    source,
    url: urlMap[source] ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`,
    label: `Definition of "${term}"`,
    fetchedAt: new Date().toISOString(),
  };
}
