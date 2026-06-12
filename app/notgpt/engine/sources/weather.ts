import type { ProvenanceEntry, Block } from "../envelope";

export type GeoResult = {
  name: string;
  lat: number;
  lon: number;
  timezone: string;
  country: string;
};

export type WeatherData = {
  location: string;
  lat: number;
  lon: number;
  temperatureF: number;
  weatherCode: number;
  description: string;
  windSpeedMph: number;
  timezone: string;
};

export async function geocode(location: string): Promise<GeoResult | null> {
  const encoded = encodeURIComponent(location);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encoded}&count=1&language=en&format=json`;
  const res = await fetch(url, {
    next: { revalidate: 2592000 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const results = data?.results;
  if (!results || !results.length) return null;

  const r = results[0];
  return {
    name: r.name ?? location,
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone ?? "UTC",
    country: r.country ?? "",
  };
}

export async function fetchWeather(
  location: string
): Promise<WeatherData | null> {
  const geo = await geocode(location);
  if (!geo) return null;

  const params = new URLSearchParams({
    latitude: String(geo.lat),
    longitude: String(geo.lon),
    current: "temperature_2m,weather_code,wind_speed_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: geo.timezone,
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, {
    next: { revalidate: 600 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const current = data?.current;
  if (!current) return null;

  const weatherCode: number = current.weather_code ?? 0;

  return {
    location: geo.name,
    lat: geo.lat,
    lon: geo.lon,
    temperatureF: current.temperature_2m ?? 0,
    weatherCode,
    description: wmoDescription(weatherCode),
    windSpeedMph: current.wind_speed_10m ?? 0,
    timezone: geo.timezone,
  };
}

export function wmoDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Icy fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight showers",
    81: "Moderate showers",
    82: "Violent showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
  };
  return map[code] ?? "Unknown conditions";
}

export function weatherBlock(data: WeatherData): Block {
  return {
    type: "weather-card",
    location: data.location,
    lat: data.lat,
    lon: data.lon,
    temperatureF: data.temperatureF,
    weatherCode: data.weatherCode,
    description: data.description,
    windSpeedMph: data.windSpeedMph,
    timezone: data.timezone,
  };
}

export function weatherProvenance(location: string): ProvenanceEntry {
  return {
    source: "open-meteo",
    url: "https://open-meteo.com/",
    label: `Weather for ${location}`,
    fetchedAt: new Date().toISOString(),
  };
}
