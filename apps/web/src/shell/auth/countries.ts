// Country dial codes for the sign-in phone entry (#42 follow-up). The user picks a
// country → we prepend its dial code and send a full +E.164 number, which the worker's
// normalizeE164 accepts directly for ANY country (no per-country worker support needed).
// Ordered: common markets first, then alphabetical. Flag emoji for quick visual scan.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // E.164 country calling code, no '+'
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { code: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
  { code: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
  { code: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { code: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { code: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { code: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
  { code: "SE", name: "Sweden", dial: "46", flag: "🇸🇪" },
  { code: "NO", name: "Norway", dial: "47", flag: "🇳🇴" },
  { code: "DK", name: "Denmark", dial: "45", flag: "🇩🇰" },
  { code: "CH", name: "Switzerland", dial: "41", flag: "🇨🇭" },
  { code: "AT", name: "Austria", dial: "43", flag: "🇦🇹" },
  { code: "BE", name: "Belgium", dial: "32", flag: "🇧🇪" },
  { code: "PT", name: "Portugal", dial: "351", flag: "🇵🇹" },
  { code: "PL", name: "Poland", dial: "48", flag: "🇵🇱" },
  { code: "MX", name: "Mexico", dial: "52", flag: "🇲🇽" },
  { code: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
  { code: "AR", name: "Argentina", dial: "54", flag: "🇦🇷" },
  { code: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { code: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { code: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
  { code: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { code: "AE", name: "UAE", dial: "971", flag: "🇦🇪" },
  { code: "IL", name: "Israel", dial: "972", flag: "🇮🇱" },
  { code: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]!; // US

/** Combine a selected country's dial code with a locally-typed number → +E.164.
 * If the user already typed a '+'-prefixed international number, respect it as-is
 * (don't double the country code). */
export function toE164(dial: string, localNumber: string): string {
  const trimmed = localNumber.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  const digits = trimmed.replace(/[^\d]/g, "").replace(/^0+/, ""); // drop trunk-0 + separators
  return `+${dial}${digits}`;
}
