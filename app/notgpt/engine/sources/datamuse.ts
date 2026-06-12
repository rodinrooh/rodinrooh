export async function spellSuggest(
  word: string
): Promise<Array<{ word: string; score: number }>> {
  const encoded = encodeURIComponent(word);
  const url = `https://api.datamuse.com/words?sp=${encoded}&max=3`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) return [];

  const data: Array<{ word: string; score?: number }> = await res.json();

  return data
    .map((item) => ({ word: item.word, score: item.score ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

export async function wordExists(word: string): Promise<boolean> {
  const encoded = encodeURIComponent(word);
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`;
  const res = await fetch(url, {
    next: { revalidate: 604800 },
  });

  if (res.status === 200) return true;
  if (res.status === 404) return false;

  // For other errors, assume the word may exist
  return false;
}
