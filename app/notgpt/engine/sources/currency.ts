import type { ProvenanceEntry } from "../envelope";

export async function fetchFiatRate(
  from: string,
  to: string,
  amount: number
): Promise<{
  result: number;
  rate: number;
  rateDate: string;
  base: string;
  target: string;
} | null> {
  const url = `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const rate: number | undefined = data?.rates?.[to.toUpperCase()];

  if (rate === undefined) return null;

  return {
    result: amount * rate,
    rate,
    rateDate: data.date ?? "",
    base: data.base ?? from.toUpperCase(),
    target: to.toUpperCase(),
  };
}

export async function fetchCryptoPrice(
  coinId: string,
  vsCurrency = "usd"
): Promise<{ price: number; currency: string } | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${encodeURIComponent(vsCurrency)}`;
  const res = await fetch(url, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const price: number | undefined = data?.[coinId]?.[vsCurrency.toLowerCase()];

  if (price === undefined) return null;

  return { price, currency: vsCurrency.toLowerCase() };
}

export function normalizeCurrency(input: string): string {
  const lower = input.toLowerCase().trim();
  const map: Record<string, string> = {
    dollar: "USD",
    dollars: "USD",
    usd: "USD",
    euro: "EUR",
    euros: "EUR",
    eur: "EUR",
    pound: "GBP",
    pounds: "GBP",
    gbp: "GBP",
    yen: "JPY",
    jpy: "JPY",
    yuan: "CNY",
    rmb: "CNY",
    cny: "CNY",
    franc: "CHF",
    chf: "CHF",
    ruble: "RUB",
    rub: "RUB",
    rupee: "INR",
    inr: "INR",
    won: "KRW",
    krw: "KRW",
    real: "BRL",
    brl: "BRL",
    peso: "MXN",
    mxn: "MXN",
    aud: "AUD",
    "australian dollar": "AUD",
    cad: "CAD",
    "canadian dollar": "CAD",
  };

  return map[lower] ?? input.toUpperCase();
}

export function normalizeCrypto(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const map: Record<string, string> = {
    bitcoin: "bitcoin",
    btc: "bitcoin",
    ethereum: "ethereum",
    eth: "ethereum",
    solana: "solana",
    sol: "solana",
    dogecoin: "dogecoin",
    doge: "dogecoin",
    cardano: "cardano",
    ada: "cardano",
    ripple: "ripple",
    xrp: "ripple",
    polkadot: "polkadot",
    dot: "polkadot",
    litecoin: "litecoin",
    ltc: "litecoin",
    chainlink: "chainlink",
    link: "chainlink",
    avalanche: "avalanche",
    avax: "avalanche",
  };

  return map[lower] ?? null;
}

export function currencyProvenance(source: string): ProvenanceEntry {
  const urlMap: Record<string, string> = {
    frankfurter: "https://www.frankfurter.dev/",
    coingecko: "https://www.coingecko.com/",
  };

  return {
    source,
    url: urlMap[source] ?? "https://www.frankfurter.dev/",
    label: `Exchange rates via ${source}`,
    fetchedAt: new Date().toISOString(),
  };
}
