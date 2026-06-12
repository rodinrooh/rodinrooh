import type { ProvenanceEntry } from "../envelope";

const WIKIMEDIA_UA =
  "notgpt/1.0 (https://rodinrooh.com/notgpt; rodin.roohipour@whop.com)";

export type NewsItem = {
  story: string;
  title: string;
  extract: string;
  url: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export async function fetchTodayNews(): Promise<NewsItem[]> {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = pad2(now.getUTCMonth() + 1);
  const dd = pad2(now.getUTCDate());

  const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 900 },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const newsItems: Array<{
    story?: string;
    links?: Array<{ title?: string; extract?: string }>;
  }> = data?.news ?? [];

  if (!newsItems.length) return [];

  return newsItems.map((item) => {
    const story = stripHtml(item.story ?? "");
    const firstLink = item.links?.[0];
    const title = firstLink?.title ?? "";
    const extract = firstLink?.extract ?? "";
    const articleUrl = title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
      : "";

    return { story, title, extract, url: articleUrl };
  });
}

export function feedProvenance(): ProvenanceEntry {
  return {
    source: "wikipedia-feed",
    url: "https://en.wikipedia.org/wiki/Wikipedia:In_the_news",
    label: "Wikipedia In the News",
    fetchedAt: new Date().toISOString(),
  };
}
