import type { ProvenanceEntry, Block } from "../envelope";

export const WIKIMEDIA_UA =
  "notgpt/1.0 (https://rodinrooh.com/notgpt; rodin.roohipour@whop.com)";

export type WikiSummary = {
  type: string;
  title: string;
  displayTitle: string;
  extract: string;
  description: string;
  wikibaseItem: string;
  contentUrl: string;
  revisionTimestamp: string;
};

export type WikiSearchHit = {
  title: string;
  snippet: string;
  description: string;
  rank: number;
};

export type WikiSearchResult = {
  hits: WikiSearchHit[];
  suggestion?: string;
};

export type DabOption = {
  title: string;
  description: string;
  query: string;
};

export async function fetchWikiSummary(
  title: string,
  revalidate = 3600
): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(title);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate },
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = await res.json();

  return {
    type: data.type ?? "",
    title: data.title ?? title,
    displayTitle: data.displaytitle ?? data.title ?? title,
    extract: data.extract ?? "",
    description: data.description ?? "",
    wikibaseItem: data.wikibase_item ?? "",
    contentUrl: data.content_urls?.desktop?.page ?? "",
    revisionTimestamp: data.timestamp ?? "",
  };
}

export async function searchWiki(
  query: string,
  limit = 10
): Promise<WikiSearchResult> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srinfo: "suggestion",
    srlimit: String(limit),
    format: "json",
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return { hits: [] };

  const data = await res.json();
  const rawHits: Array<{
    title: string;
    snippet: string;
    description?: string;
  }> = data?.query?.search ?? [];

  const hits: WikiSearchHit[] = rawHits.map((h, i) => ({
    title: h.title,
    snippet: h.snippet?.replace(/<[^>]+>/g, "") ?? "",
    description: h.description ?? "",
    rank: i,
  }));

  const suggestion: string | undefined =
    data?.query?.searchinfo?.suggestion;

  return { hits, ...(suggestion ? { suggestion } : {}) };
}

export async function fetchDabOptions(title: string): Promise<DabOption[]> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "links",
    namespace: "0",
    format: "json",
  });
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const links: Array<{ ns: number; "*": string }> =
    data?.parse?.links ?? [];

  const ns0 = links
    .filter((l) => l.ns === 0)
    .slice(0, 12)
    .map((l) => ({
      title: l["*"],
      description: "",
      query: l["*"],
    }));

  return ns0;
}

export async function searchAndFetch(
  query: string,
  revalidate = 3600
): Promise<WikiSummary | null> {
  const result = await searchWiki(query, 1);
  if (!result.hits.length) return null;
  return fetchWikiSummary(result.hits[0].title, revalidate);
}

export function wikiProvenance(summary: WikiSummary): ProvenanceEntry {
  return {
    source: "wikipedia",
    url: summary.contentUrl,
    label: summary.title,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchSimpleWikiSummary(
  title: string
): Promise<WikiSummary | null> {
  const encoded = encodeURIComponent(title);
  const url = `https://simple.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 3600 },
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = await res.json();

  return {
    type: data.type ?? "",
    title: data.title ?? title,
    displayTitle: data.displaytitle ?? data.title ?? title,
    extract: data.extract ?? "",
    description: data.description ?? "",
    wikibaseItem: data.wikibase_item ?? "",
    contentUrl: data.content_urls?.desktop?.page ?? "",
    revisionTimestamp: data.timestamp ?? "",
  };
}

export function truncateExtract(extract: string): {
  truncated: string;
  wasTruncated: boolean;
  fullExtract: string;
} {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const segments = Array.from(segmenter.segment(extract));
  const sentences = segments
    .filter((s) => s.segment.trim().length > 0)
    .map((s) => s.segment);

  const maxSentences = 3;
  const maxChars = 480;

  let result = "";
  let count = 0;

  for (const sentence of sentences) {
    if (count >= maxSentences) break;
    if (result.length + sentence.length > maxChars) break;
    result += sentence;
    count++;
  }

  const wasTruncated = result.trim() !== extract.trim();

  return {
    truncated: result.trim(),
    wasTruncated,
    fullExtract: extract,
  };
}
