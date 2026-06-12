import type { ProvenanceEntry } from "../envelope";

export type HNResult = {
  title: string;
  url: string;
  points: number;
  numComments: number;
  objectID: string;
  createdAt: string;
};

export async function searchHN(
  query: string,
  limit = 5
): Promise<HNResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=${limit}`;
  const res = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const hits: Array<{
    title?: string;
    url?: string | null;
    points?: number;
    num_comments?: number;
    objectID?: string;
    created_at?: string;
  }> = data?.hits ?? [];

  return hits
    .filter((h) => h.url != null && h.url !== "")
    .map((h) => ({
      title: h.title ?? "",
      url: h.url!,
      points: h.points ?? 0,
      numComments: h.num_comments ?? 0,
      objectID: h.objectID ?? "",
      createdAt: h.created_at ?? "",
    }));
}

export function hnProvenance(): ProvenanceEntry {
  return {
    source: "hackernews",
    url: "https://news.ycombinator.com/",
    label: "Hacker News",
    fetchedAt: new Date().toISOString(),
  };
}
