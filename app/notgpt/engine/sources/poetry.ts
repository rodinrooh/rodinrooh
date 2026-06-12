import type { ProvenanceEntry, Block } from "../envelope";

export type Poem = {
  title: string;
  author: string;
  lines: string[];
};

export async function fetchRandomPoem(): Promise<Poem | null> {
  const url = "https://poetrydb.org/random/1";
  const res = await fetch(url, {
    next: { revalidate: 2592000 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const results: Array<{
    title?: string;
    author?: string;
    lines?: string[];
  }> = Array.isArray(data) ? data : [data];

  if (!results.length) return null;

  const first = results[0];
  return {
    title: first.title ?? "Untitled",
    author: first.author ?? "Unknown",
    lines: first.lines ?? [],
  };
}

export async function fetchPoemByTopic(topic: string): Promise<Poem | null> {
  const encoded = encodeURIComponent(topic);

  // Try by title first
  const titleUrl = `https://poetrydb.org/title/${encoded}`;
  const titleRes = await fetch(titleUrl, {
    next: { revalidate: 2592000 },
  });

  if (titleRes.ok) {
    const data = await titleRes.json();

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      return {
        title: first.title ?? "Untitled",
        author: first.author ?? "Unknown",
        lines: first.lines ?? [],
      };
    }

    // Check for 404 status in response body
    if (data && typeof data === "object" && "status" in data && data.status === 404) {
      // fall through to lines search
    } else if (!Array.isArray(data)) {
      // fall through to lines search
    }
  }

  // Try by lines
  const linesUrl = `https://poetrydb.org/lines/${encoded}`;
  const linesRes = await fetch(linesUrl, {
    next: { revalidate: 2592000 },
  });

  if (linesRes.ok) {
    const data = await linesRes.json();

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      return {
        title: first.title ?? "Untitled",
        author: first.author ?? "Unknown",
        lines: first.lines ?? [],
      };
    }
  }

  // Fall back to random poem
  return fetchRandomPoem();
}

export function poemBlock(poem: Poem): Block {
  return {
    type: "poem",
    title: poem.title,
    author: poem.author,
    lines: poem.lines,
  };
}

export function poetryProvenance(): ProvenanceEntry {
  return {
    source: "poetrydb",
    url: "https://poetrydb.org/",
    label: "PoetryDB",
    fetchedAt: new Date().toISOString(),
  };
}
