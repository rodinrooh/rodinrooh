export type CountryData = {
  name: string;
  capital: string;
  population: number;
  currencies: string[];
  region: string;
  cca2: string;
};

export const COUNTRIES: CountryData[] = [
  { name: "United States", capital: "Washington D.C.", population: 331000000, currencies: ["USD"], region: "Americas", cca2: "US" },
  { name: "China", capital: "Beijing", population: 1412000000, currencies: ["CNY"], region: "Asia", cca2: "CN" },
  { name: "India", capital: "New Delhi", population: 1380000000, currencies: ["INR"], region: "Asia", cca2: "IN" },
  { name: "Russia", capital: "Moscow", population: 144000000, currencies: ["RUB"], region: "Europe", cca2: "RU" },
  { name: "Brazil", capital: "Brasília", population: 215000000, currencies: ["BRL"], region: "Americas", cca2: "BR" },
  { name: "Japan", capital: "Tokyo", population: 125000000, currencies: ["JPY"], region: "Asia", cca2: "JP" },
  { name: "Germany", capital: "Berlin", population: 83000000, currencies: ["EUR"], region: "Europe", cca2: "DE" },
  { name: "United Kingdom", capital: "London", population: 67000000, currencies: ["GBP"], region: "Europe", cca2: "GB" },
  { name: "France", capital: "Paris", population: 68000000, currencies: ["EUR"], region: "Europe", cca2: "FR" },
  { name: "Italy", capital: "Rome", population: 60000000, currencies: ["EUR"], region: "Europe", cca2: "IT" },
  { name: "Canada", capital: "Ottawa", population: 38000000, currencies: ["CAD"], region: "Americas", cca2: "CA" },
  { name: "Australia", capital: "Canberra", population: 25000000, currencies: ["AUD"], region: "Oceania", cca2: "AU" },
  { name: "South Korea", capital: "Seoul", population: 52000000, currencies: ["KRW"], region: "Asia", cca2: "KR" },
  { name: "Mexico", capital: "Mexico City", population: 128000000, currencies: ["MXN"], region: "Americas", cca2: "MX" },
  { name: "Spain", capital: "Madrid", population: 47000000, currencies: ["EUR"], region: "Europe", cca2: "ES" },
  { name: "Indonesia", capital: "Jakarta", population: 273000000, currencies: ["IDR"], region: "Asia", cca2: "ID" },
  { name: "Netherlands", capital: "Amsterdam", population: 17000000, currencies: ["EUR"], region: "Europe", cca2: "NL" },
  { name: "Saudi Arabia", capital: "Riyadh", population: 35000000, currencies: ["SAR"], region: "Asia", cca2: "SA" },
  { name: "Turkey", capital: "Ankara", population: 85000000, currencies: ["TRY"], region: "Asia", cca2: "TR" },
  { name: "Switzerland", capital: "Bern", population: 8000000, currencies: ["CHF"], region: "Europe", cca2: "CH" },
  { name: "Argentina", capital: "Buenos Aires", population: 45000000, currencies: ["ARS"], region: "Americas", cca2: "AR" },
  { name: "Sweden", capital: "Stockholm", population: 10000000, currencies: ["SEK"], region: "Europe", cca2: "SE" },
  { name: "Norway", capital: "Oslo", population: 5000000, currencies: ["NOK"], region: "Europe", cca2: "NO" },
  { name: "Denmark", capital: "Copenhagen", population: 6000000, currencies: ["DKK"], region: "Europe", cca2: "DK" },
  { name: "Finland", capital: "Helsinki", population: 5000000, currencies: ["EUR"], region: "Europe", cca2: "FI" },
  { name: "Poland", capital: "Warsaw", population: 38000000, currencies: ["PLN"], region: "Europe", cca2: "PL" },
  { name: "Belgium", capital: "Brussels", population: 11000000, currencies: ["EUR"], region: "Europe", cca2: "BE" },
  { name: "Austria", capital: "Vienna", population: 9000000, currencies: ["EUR"], region: "Europe", cca2: "AT" },
  { name: "Israel", capital: "Jerusalem", population: 9000000, currencies: ["ILS"], region: "Asia", cca2: "IL" },
  { name: "UAE", capital: "Abu Dhabi", population: 10000000, currencies: ["AED"], region: "Asia", cca2: "AE" },
  { name: "Singapore", capital: "Singapore", population: 6000000, currencies: ["SGD"], region: "Asia", cca2: "SG" },
  { name: "Thailand", capital: "Bangkok", population: 70000000, currencies: ["THB"], region: "Asia", cca2: "TH" },
  { name: "South Africa", capital: "Pretoria", population: 60000000, currencies: ["ZAR"], region: "Africa", cca2: "ZA" },
  { name: "Nigeria", capital: "Abuja", population: 218000000, currencies: ["NGN"], region: "Africa", cca2: "NG" },
  { name: "Egypt", capital: "Cairo", population: 102000000, currencies: ["EGP"], region: "Africa", cca2: "EG" },
  { name: "Pakistan", capital: "Islamabad", population: 220000000, currencies: ["PKR"], region: "Asia", cca2: "PK" },
  { name: "Bangladesh", capital: "Dhaka", population: 167000000, currencies: ["BDT"], region: "Asia", cca2: "BD" },
  { name: "Vietnam", capital: "Hanoi", population: 97000000, currencies: ["VND"], region: "Asia", cca2: "VN" },
  { name: "Philippines", capital: "Manila", population: 113000000, currencies: ["PHP"], region: "Asia", cca2: "PH" },
  { name: "Malaysia", capital: "Kuala Lumpur", population: 32000000, currencies: ["MYR"], region: "Asia", cca2: "MY" },
  { name: "Taiwan", capital: "Taipei", population: 23000000, currencies: ["TWD"], region: "Asia", cca2: "TW" },
  { name: "New Zealand", capital: "Wellington", population: 5000000, currencies: ["NZD"], region: "Oceania", cca2: "NZ" },
  { name: "Colombia", capital: "Bogotá", population: 51000000, currencies: ["COP"], region: "Americas", cca2: "CO" },
  { name: "Chile", capital: "Santiago", population: 19000000, currencies: ["CLP"], region: "Americas", cca2: "CL" },
  { name: "Peru", capital: "Lima", population: 32000000, currencies: ["PEN"], region: "Americas", cca2: "PE" },
  { name: "Ukraine", capital: "Kyiv", population: 44000000, currencies: ["UAH"], region: "Europe", cca2: "UA" },
  { name: "Portugal", capital: "Lisbon", population: 10000000, currencies: ["EUR"], region: "Europe", cca2: "PT" },
  { name: "Greece", capital: "Athens", population: 10000000, currencies: ["EUR"], region: "Europe", cca2: "GR" },
  { name: "Ireland", capital: "Dublin", population: 5000000, currencies: ["EUR"], region: "Europe", cca2: "IE" },
  { name: "Hungary", capital: "Budapest", population: 10000000, currencies: ["HUF"], region: "Europe", cca2: "HU" },
];

// Alias map: lowercase alias -> cca2
const ALIASES: Record<string, string> = {
  usa: "US",
  uk: "GB",
  britain: "GB",
  "great britain": "GB",
  uae: "AE",
  "united arab emirates": "AE",
  "south korea": "KR",
  korea: "KR",
  taiwan: "TW",
};

export function lookupCountry(name: string): CountryData | null {
  const lower = name.toLowerCase().trim();

  // Check aliases first
  const aliasCode = ALIASES[lower];
  if (aliasCode) {
    return COUNTRIES.find((c) => c.cca2 === aliasCode) ?? null;
  }

  // Case-insensitive match by name
  const byName = COUNTRIES.find(
    (c) => c.name.toLowerCase() === lower
  );
  if (byName) return byName;

  // Match by capital
  const byCapital = COUNTRIES.find(
    (c) => c.capital.toLowerCase() === lower
  );
  if (byCapital) return byCapital;

  // Match by cca2 (case-insensitive)
  const byCca2 = COUNTRIES.find(
    (c) => c.cca2.toLowerCase() === lower
  );
  if (byCca2) return byCca2;

  return null;
}
