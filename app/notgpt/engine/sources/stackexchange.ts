import type { ProvenanceEntry, Block } from "../envelope";
import { getDocsUrl } from "../data/docsMap";

export type SOHit = {
  title: string;
  score: number;
  link: string;
  hasAcceptedAnswer: boolean;
  tags: string[];
};

export async function searchStackOverflow(
  query: string,
  lang?: string
): Promise<SOHit[]> {
  const params = new URLSearchParams({
    order: "desc",
    sort: "relevance",
    q: query,
    site: "stackoverflow",
    pagesize: "5",
    filter: "default",
  });

  if (lang) {
    params.append("tagged", lang);
  }

  if (process.env.STACKEXCHANGE_KEY) {
    params.append("key", process.env.STACKEXCHANGE_KEY);
  }

  const url = `https://api.stackexchange.com/2.3/search/advanced?${params.toString()}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const items: Array<{
    title?: string;
    score?: number;
    link?: string;
    is_answered?: boolean;
    accepted_answer_id?: number;
    tags?: string[];
  }> = data?.items ?? [];

  return items.map((item) => ({
    title: item.title ?? "",
    score: item.score ?? 0,
    link: item.link ?? "",
    hasAcceptedAnswer:
      item.is_answered === true || item.accepted_answer_id !== undefined,
    tags: item.tags ?? [],
  }));
}

export function soBlock(question: string, hits: SOHit[]): Block {
  return {
    type: "so-results",
    question,
    hits,
  };
}

export { getDocsUrl };

export function seProvenance(): ProvenanceEntry {
  return {
    source: "stackoverflow",
    url: "https://stackoverflow.com/",
    label: "Stack Overflow",
    fetchedAt: new Date().toISOString(),
  };
}
