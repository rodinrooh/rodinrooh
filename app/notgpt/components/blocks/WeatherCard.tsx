"use client";

import type { WeatherCardBlock } from "../../engine/envelope";

type WeatherCardProps = {
  block: WeatherCardBlock;
};

function wmoCategory(code: number): "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog" {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code >= 45 && code <= 48) return "fog";
  if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 75) || code === 77) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

function ConditionGlyph({ code }: { code: number }) {
  const cat = wmoCategory(code);

  const glyphs: Record<typeof cat, React.ReactNode> = {
    clear: (
      // Sun
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="7" fill="#facc15" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 18 + 10 * Math.cos(rad);
          const y1 = 18 + 10 * Math.sin(rad);
          const x2 = 18 + 14 * Math.cos(rad);
          const y2 = 18 + 14 * Math.sin(rad);
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
          );
        })}
      </svg>
    ),
    cloudy: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <ellipse cx="20" cy="20" rx="11" ry="7" fill="#d1d5db" className="dark:fill-[#4b5563]" />
        <ellipse cx="14" cy="22" rx="7" ry="5" fill="#e5e7eb" className="dark:fill-[#374151]" />
        <ellipse cx="24" cy="18" rx="7" ry="5" fill="#e5e7eb" className="dark:fill-[#374151]" />
      </svg>
    ),
    rain: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <ellipse cx="20" cy="16" rx="11" ry="7" fill="#d1d5db" className="dark:fill-[#4b5563]" />
        <ellipse cx="14" cy="18" rx="7" ry="5" fill="#e5e7eb" className="dark:fill-[#374151]" />
        <line x1="14" y1="25" x2="12" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="25" x2="18" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
        <line x1="26" y1="25" x2="24" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    snow: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <ellipse cx="20" cy="16" rx="11" ry="7" fill="#d1d5db" className="dark:fill-[#4b5563]" />
        <ellipse cx="14" cy="18" rx="7" ry="5" fill="#e5e7eb" className="dark:fill-[#374151]" />
        <circle cx="14" cy="28" r="1.5" fill="#bfdbfe" />
        <circle cx="20" cy="26" r="1.5" fill="#bfdbfe" />
        <circle cx="26" cy="28" r="1.5" fill="#bfdbfe" />
      </svg>
    ),
    storm: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <ellipse cx="20" cy="14" rx="11" ry="7" fill="#6b7280" className="dark:fill-[#374151]" />
        <ellipse cx="14" cy="16" rx="7" ry="5" fill="#9ca3af" className="dark:fill-[#4b5563]" />
        <path d="M20 22L16 30L22 26L18 34" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    fog: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <line x1="8" y1="14" x2="28" y2="14" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="10" y1="19" x2="26" y2="19" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="12" y1="24" x2="24" y2="24" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  };

  return glyphs[cat];
}

export default function WeatherCard({ block }: WeatherCardProps) {
  const { location, temperatureF, description, windSpeedMph } = block;

  const tempC = Math.round((temperatureF - 32) * 5 / 9);
  const tempFRounded = Math.round(temperatureF);

  return (
    <div className="my-3 rounded-xl border border-[#e5e7eb] dark:border-[#3f3f3f] bg-[#f7f7f8] dark:bg-[#2a2a2a] p-4 max-w-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#6b7280] dark:text-[#9ca3af] mb-1 truncate">
            {location}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-[42px] font-light text-[#0d0d0d] dark:text-[#ececec] leading-none tracking-tight">
              {tempFRounded}°F
            </span>
            <span className="text-[20px] text-[#6b7280] dark:text-[#9ca3af] font-light">
              {tempC}°C
            </span>
          </div>
          <p className="text-[14px] text-[#374151] dark:text-[#d1d5db] mt-1">
            {description}
          </p>
        </div>
        <div className="flex-shrink-0 mt-1 opacity-80">
          <ConditionGlyph code={block.weatherCode} />
        </div>
      </div>

      {/* Wind */}
      <div className="mt-3 pt-3 border-t border-[#e5e7eb] dark:border-[#3f3f3f] flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-[#9ca3af]"
        >
          <path
            d="M1 6h8.5a2 2 0 1 0 0-4H9M1 9h6.5a2 2 0 1 1 0 4H7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[12px] text-[#6b7280] dark:text-[#9ca3af]">
          Wind {Math.round(windSpeedMph)} mph
        </span>
        <span className="text-[#d1d5db] dark:text-[#525252] text-[12px]">·</span>
        <span className="text-[12px] text-[#9ca3af] dark:text-[#6b7280]">
          via open-meteo.com
        </span>
      </div>
    </div>
  );
}
