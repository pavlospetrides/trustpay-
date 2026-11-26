/**
 * Expense category suggestions from line descriptions. Deterministic keyword rules, no AI: every suggestion names the
 * words that produced it, and an accountant confirms or changes it. Organizations can pass their own list.
 */

export interface ExpenseCategory {
  id: string;
  name: string;
  /** Ledger account the draft journal debits. */
  account: string;
  keywords: readonly string[];
  /** Items that may need capitalising as fixed assets above the organization's threshold. */
  capitalisable?: boolean;
}

export const DEFAULT_CATEGORIES: readonly ExpenseCategory[] = [
  { id: "office_expenses", name: "Office expenses", account: "Office expenses", keywords: ["office", "stationery", "paper", "toner", "cartridge", "pens", "envelopes", "cleaning supplies", "printing paper"] },
  { id: "utilities", name: "Utilities", account: "Utilities", keywords: ["electricity", "eac", "water", "sewerage", "sewage", "gas", "heating", "power supply"] },
  { id: "software_subscriptions", name: "Software and subscriptions", account: "Software and subscriptions", keywords: ["software", "licence", "license", "subscription", "saas", "cloud", "hosting", "microsoft 365", "adobe", "domain"] },
  { id: "it_equipment", name: "IT equipment", account: "IT equipment", keywords: ["laptop", "computer", "desktop", "monitor", "server", "router", "switch", "keyboard", "hardware", "printer", "notebook pc"], capitalisable: true },
  { id: "fixed_assets", name: "Fixed assets", account: "Fixed assets", keywords: ["machinery", "machine", "vehicle", "furniture", "installation of equipment", "air conditioning unit"], capitalisable: true },
  { id: "inventory", name: "Inventory", account: "Inventory", keywords: ["goods for resale", "stock", "inventory", "raw materials", "wholesale", "merchandise"] },
  { id: "marketing", name: "Marketing", account: "Marketing", keywords: ["advertising", "marketing", "campaign", "promotion", "ads", "sponsorship", "flyers", "social media"] },
  { id: "professional_services", name: "Professional services", account: "Professional services", keywords: ["consulting", "consultancy", "legal", "lawyer", "accounting", "audit", "advisory", "notary", "professional fees"] },
  { id: "transportation", name: "Transportation", account: "Transportation", keywords: ["transport", "freight", "courier", "shipping", "delivery", "logistics", "fuel", "taxi", "haulage"] },
  { id: "telecommunications", name: "Telecommunications", account: "Telecommunications", keywords: ["telephone", "phone line", "mobile plan", "internet", "broadband", "fibre", "telecom", "cyta", "airtime"] },
];
export const OTHER_CATEGORY: ExpenseCategory = { id: "other", name: "Other business expenses", account: "Other business expenses", keywords: [] };

export interface CategorySuggestion { category: ExpenseCategory; matched: string[] }

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The category whose keywords best match a description (most matched words, then list order); Other when none match. */
export function suggestCategory(description: string, categories: readonly ExpenseCategory[] = DEFAULT_CATEGORIES): CategorySuggestion {
  const text = description.normalize("NFKC").toLowerCase();
  let best: CategorySuggestion | null = null;
  for (const category of categories) {
    const matched = category.keywords.filter((word) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(word.toLowerCase())}(?![\\p{L}\\p{N}])`, "u").test(text));
    if (matched.length && (!best || matched.length > best.matched.length)) best = { category, matched };
  }
  return best ?? { category: OTHER_CATEGORY, matched: [] };
}
