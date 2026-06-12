import type { ProvenanceEntry } from "../envelope";

const WIKIMEDIA_UA =
  "notgpt/1.0 (https://rodinrooh.com/notgpt; rodin.roohipour@whop.com)";

export type WikidataValue =
  | { type: "string"; value: string }
  | { type: "quantity"; amount: number; unit: string | null; unitQid: string | null }
  | { type: "time"; isoDate: string; precision: number }
  | { type: "entity"; id: string; label?: string };

type RawStatement = {
  rank: string;
  value?: {
    type: string;
    content: unknown;
  };
};

function parseDatavalue(content: unknown, type: string): WikidataValue | null {
  if (type === "string" && typeof content === "string") {
    return { type: "string", value: content };
  }

  if (type === "quantity" && typeof content === "object" && content !== null) {
    const q = content as Record<string, unknown>;
    const amountStr = String(q.amount ?? "0").replace(/^\+/, "");
    const amount = parseFloat(amountStr);
    const unitUri = typeof q.unit === "string" ? q.unit : null;
    let unitQid: string | null = null;
    if (unitUri && unitUri !== "1") {
      const match = unitUri.match(/Q\d+$/);
      if (match) unitQid = match[0];
    }
    return { type: "quantity", amount, unit: null, unitQid };
  }

  if (type === "time" && typeof content === "object" && content !== null) {
    const t = content as Record<string, unknown>;
    const timeStr = String(t.time ?? "");
    const precision = typeof t.precision === "number" ? t.precision : 11;
    return { type: "time", isoDate: timeStr, precision };
  }

  if (
    type === "wikibase-entityid" &&
    typeof content === "object" &&
    content !== null
  ) {
    const e = content as Record<string, unknown>;
    const id = String(e.id ?? "");
    return { type: "entity", id };
  }

  return null;
}

export async function fetchStatement(
  qid: string,
  pid: string
): Promise<WikidataValue | null> {
  const url = `https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/${qid}/statements?property=${pid}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const statements: RawStatement[] = data?.[pid] ?? [];

  if (!statements.length) return null;

  // Prefer "preferred" rank, else use first
  const preferred = statements.find((s) => s.rank === "preferred");
  const statement = preferred ?? statements[0];

  if (!statement.value) return null;

  const { type, content } = statement.value;
  return parseDatavalue(content, type);
}

export async function fetchLabel(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/${qid}/labels`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKIMEDIA_UA },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.en ?? null;
}

export async function fetchFirstProperty(
  qid: string,
  pids: string[]
): Promise<WikidataValue | null> {
  for (const pid of pids) {
    const value = await fetchStatement(qid, pid);
    if (value !== null) return value;
  }
  return null;
}

export async function fetchSharedProperties(
  qidA: string,
  qidB: string,
  pids: string[]
): Promise<Array<{ pid: string; valueA: WikidataValue; valueB: WikidataValue }>> {
  const results: Array<{
    pid: string;
    valueA: WikidataValue;
    valueB: WikidataValue;
  }> = [];

  const pairs = await Promise.all(
    pids.map(async (pid) => {
      const [valueA, valueB] = await Promise.all([
        fetchStatement(qidA, pid),
        fetchStatement(qidB, pid),
      ]);
      return { pid, valueA, valueB };
    })
  );

  for (const { pid, valueA, valueB } of pairs) {
    if (valueA !== null && valueB !== null) {
      results.push({ pid, valueA, valueB });
      if (results.length >= 6) break;
    }
  }

  return results;
}

export function wikidataProvenance(qid: string): ProvenanceEntry {
  return {
    source: "wikidata",
    url: `https://www.wikidata.org/wiki/${qid}`,
    label: qid,
    fetchedAt: new Date().toISOString(),
  };
}

export async function formatValue(v: WikidataValue): Promise<string> {
  if (v.type === "string") {
    return v.value;
  }

  if (v.type === "quantity") {
    let unitLabel = "";
    if (v.unitQid) {
      const label = await fetchLabel(v.unitQid);
      unitLabel = label ? ` ${label}` : ` (${v.unitQid})`;
    }
    return `${v.amount.toLocaleString()}${unitLabel}`;
  }

  if (v.type === "time") {
    const iso = v.isoDate.replace(/^\+/, "");
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;

    if (v.precision === 9) {
      return String(date.getUTCFullYear());
    } else if (v.precision === 10) {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        timeZone: "UTC",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
    }
  }

  if (v.type === "entity") {
    if (v.label) return v.label;
    const label = await fetchLabel(v.id);
    return label ?? v.id;
  }

  return "";
}
