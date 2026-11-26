/**
 * Cyprus VAT facts used by the accounting review. Deterministic and dated: no AI decides a rate or a treatment.
 *
 * Sources (checked 25 November 2026; confirm against the VAT Law 95(I)/2000 and Tax Department guidance before relying
 * on them for a filing):
 * - Rates 19% standard, 9% and 5% reduced, 0%: PwC Worldwide Tax Summaries, Cyprus "Other taxes"
 *   (https://taxsummaries.pwc.com/cyprus/corporate/other-taxes). 19% and 9% apply since 13 January 2014.
 * - 3% reduced rate (books, newspapers, periodicals, orthopaedic and disability items), in force from publication on
 *   21 July 2023, Law 75(I)/2023, section 18B and Fifteenth Schedule: EY Global Tax News
 *   (https://globaltaxnews.ey.com/news/2023-1270-cyprus-introduces-3-percent-vat-rate-and-adds-goods-to-0-percent-vat-list).
 * - Temporary 0% on certain basic goods extended to 31 December 2026 by Decree 337/2025: KPMG TaxNewsFlash
 *   (https://kpmg.com/us/en/taxnewsflash/news/2025/12/cyprus-extension-zero-vat-rate-reduced-educational-buildings.html).
 * - Domestic reverse charge: construction, demolition, repair and maintenance of civil works (Article 11B), scrap and
 *   waste, and mobile phones, tablets and similar devices (Article 11E), where the customer is VAT-registered in
 *   Cyprus: EY (https://globaltaxnews.ey.com/news/2020-6158-cyprus-amends-vat-law-to-improve-tax-collection-and-address-vat-fraud).
 *
 * Which goods or services take which reduced rate is a legal classification, so this module only checks that a stated
 * rate exists and that the arithmetic is right; the treatment itself is flagged for an accountant to review.
 */

/** Rate in basis points (1900 = 19%) and the first invoice date it applies to. */
export interface CyprusRate { basisPoints: number; label: string; from: string; to?: string }

export const CYPRUS_VAT_RATES: readonly CyprusRate[] = [
  { basisPoints: 1900, label: "standard rate", from: "2014-01-13" },
  { basisPoints: 900, label: "reduced rate", from: "2014-01-13" },
  { basisPoints: 500, label: "reduced rate", from: "2014-01-13" },
  { basisPoints: 300, label: "reduced rate (books, press, orthopaedic and disability items)", from: "2023-07-21" },
  { basisPoints: 0, label: "zero rate", from: "2014-01-13" },
];
/** Earliest invoice date this table covers. Older invoices are flagged instead of being checked against today's rates. */
export const RATE_TABLE_FROM = "2014-01-13";
export const STANDARD_RATE_BP = 1900;
export const RULES_VERSION = "cyprus-vat-rules-2026-11";

/** Rates valid on an invoice date (ISO yyyy-mm-dd). */
export function validRatesOn(date: string): CyprusRate[] {
  return CYPRUS_VAT_RATES.filter((rate) => rate.from <= date && (!rate.to || date <= rate.to));
}

/** EU member states by ISO country code. Greece writes its VAT prefix as EL. */
export const EU_COUNTRIES = new Set(["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]);

/** ISO country from an explicit country or, failing that, a VAT number prefix. Null when neither says. */
export function countryOf(country: string | null | undefined, vatNumber: string | null | undefined): string | null {
  const explicit = country?.trim().toUpperCase();
  if (explicit && /^[A-Z]{2}$/.test(explicit)) return explicit === "EL" ? "GR" : explicit;
  const prefix = vatNumber?.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  // Only EU VAT numbers carry a reliable country prefix.
  const iso = prefix === "EL" ? "GR" : prefix;
  return iso && EU_COUNTRIES.has(iso) ? iso : null;
}

/** Percent text such as "19", "19%", "9.00" or "5,5" to basis points; null when it is not a plain percentage. */
export function percentToBasisPoints(value: string | null | undefined): number | null {
  const text = value?.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!text || !/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const points = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return points <= 10_000 ? points : null;
}

/** VAT on a net amount in cents, rounded half up on the absolute value (integer arithmetic only). */
export function vatOn(netCents: number, basisPoints: number): number {
  const sign = netCents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(netCents) * basisPoints + 5_000) / 10_000);
}

export const formatPercent = (basisPoints: number) => `${basisPoints / 100}%`;

/** Words in a line description that point at a Cyprus domestic reverse-charge category. A bare "tablet" is not used: it also means medicine. */
export const DOMESTIC_REVERSE_CHARGE_HINTS: readonly { article: string; label: string; words: RegExp }[] = [
  { article: "Article 11B", label: "construction, repair, maintenance or demolition of civil works", words: /\b(construction|renovation|demolition|building works?|civil works?|plaster(?:ing)?|tiling|roofing|excavation|scaffolding)\b/iu },
  { article: "Article 11E", label: "mobile phones, tablets and similar devices", words: /\b(mobile phones?|smartphones?|tablet (?:computers?|devices?|pcs?)|iphones?|ipads?|phablets?)\b/iu },
  { article: "scrap and waste", label: "scrap and waste materials", words: /\b(scrap|waste metal|metal waste)\b/iu },
];
