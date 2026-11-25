/**
 * Accounting review of one invoice (review item 11): arithmetic, Cyprus VAT rates and treatment, an expense category
 * and a draft journal entry. Deterministic TypeScript on integer cents; no AI. Everything it returns is a suggestion
 * for an authorised accountant: it never finalises a ledger, claims VAT is recoverable, or files a return.
 *
 * Findings separate confirmed errors ("error": the numbers on the document do not add up, or a Cyprus supplier states a
 * rate that does not exist) from possible tax issues that need professional review ("review") and context ("info").
 */
import { z } from "zod";
import { DEFAULT_CATEGORIES, suggestCategory, type ExpenseCategory } from "./categories";
import { DOMESTIC_REVERSE_CHARGE_HINTS, EU_COUNTRIES, RATE_TABLE_FROM, RULES_VERSION, STANDARD_RATE_BP, countryOf, formatPercent, percentToBasisPoints, validRatesOn, vatOn } from "./cyprus-vat";

const MAX_CENTS = 100_000_000_000;
const cents = z.number().int().min(0).max(MAX_CENTS);
const text = (max: number) => z.string().min(1).max(max).refine((value) => !value.includes("\u0000"), "Text must not contain NUL characters");
const isoDate = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "Use an ISO date (yyyy-mm-dd)");
const country = z.string().regex(/^[A-Za-z]{2}$/, "Use a two-letter country code");
const percent = z.string().max(8).refine((value) => percentToBasisPoints(value) !== null, "Use a VAT rate such as 19 or 19%");

export const accountingInputSchema = z.strictObject({
  document_type: z.enum(["invoice", "credit_note"]).default("invoice"),
  invoice_date: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code"),
  supplier: z.strictObject({ name: text(200).nullish(), country: country.nullish(), vat_number: text(40).nullish() }),
  buyer: z.strictObject({ country: country.nullish(), vat_number: text(40).nullish(), vat_registered: z.boolean().default(true) }).default({ vat_registered: true }),
  totals: z.strictObject({ net_cents: cents.nullish(), vat_cents: cents.nullish(), gross_cents: cents.positive() }),
  vat_breakdown: z.array(z.strictObject({ rate: percent, net_cents: cents, vat_cents: cents })).max(20).default([]),
  lines: z.array(z.strictObject({
    description: text(500),
    quantity: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, "Use a plain quantity such as 2 or 1.5").nullish(),
    unit_price_cents: cents.nullish(),
    discount_cents: cents.nullish(),
    net_cents: cents,
    vat_rate: percent.nullish(),
    vat_cents: cents.nullish(),
  })).max(200).default([]),
  categories: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_]{1,40}$/), name: text(80), account: text(80), keywords: z.array(text(60)).max(60), capitalisable: z.boolean().optional() })).min(1).max(50).optional(),
  capitalisation_threshold_cents: cents.positive().default(100_000),
});
export type AccountingInput = z.input<typeof accountingInputSchema>;

export type Severity = "error" | "review" | "info";
export interface Finding { code: string; severity: Severity; field: string; message: string }
export interface JournalLine { account: string; debit_cents: number; credit_cents: number; memo: string }
export type Treatment = "domestic" | "domestic_zero_or_exempt" | "domestic_reverse_charge" | "domestic_reverse_charge_review" | "eu_reverse_charge" | "foreign_vat_charged" | "non_eu_supply" | "unknown";

export interface AccountingReview {
  rules_version: string;
  status: "consistent" | "needs_review" | "errors_found";
  document_type: "invoice" | "credit_note";
  treatment: { code: Treatment; explanation: string };
  findings: Finding[];
  category: { id: string; name: string; matched_keywords: string[] };
  lines: { index: number; description: string; net_cents: number; category_id: string; category_name: string; matched_keywords: string[]; capitalisation_review: boolean }[];
  journal: { status: "draft"; note: string; lines: JournalLine[] } | null;
  journal_unavailable_reason: string | null;
  disclaimer: string;
}

const euro = (value: number) => `€${(value / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const TOLERANCE_CENTS = 1;

export function reviewInvoiceAccounting(raw: AccountingInput): AccountingReview {
  const input = accountingInputSchema.parse(raw);
  const findings: Finding[] = [];
  const add = (code: string, severity: Severity, field: string, message: string) => findings.push({ code, severity, field, message });
  const categories: readonly ExpenseCategory[] = input.categories ?? DEFAULT_CATEGORIES;
  const { net_cents: net = null, vat_cents: vat = null, gross_cents: gross } = input.totals;

  // 1. Arithmetic on the document itself: confirmed errors.
  if (net !== null && vat !== null && net + vat !== gross) add("GROSS_MISMATCH", "error", "totals.gross_cents", `Net ${euro(net)} plus VAT ${euro(vat)} is ${euro(net + vat)}, but the invoice total is ${euro(gross)}.`);
  if (net === null || vat === null) add("MISSING_NET_OR_VAT", "review", "totals", "The invoice does not show both a net amount and a VAT amount, so VAT cannot be checked. Enter them from the document; nothing is assumed.");

  input.lines.forEach((line, index) => {
    if (line.quantity != null && line.unit_price_cents != null) {
      const [whole, fraction = ""] = line.quantity.split(".");
      const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
      const expected = Math.floor((milli * line.unit_price_cents + 500) / 1000) - (line.discount_cents ?? 0);
      if (Math.abs(expected - line.net_cents) > TOLERANCE_CENTS) add("LINE_AMOUNT_MISMATCH", "error", `lines.${index}.net_cents`, `Line ${index + 1}: ${line.quantity} × ${euro(line.unit_price_cents)}${line.discount_cents ? ` less ${euro(line.discount_cents)} discount` : ""} is ${euro(expected)}, but the line shows ${euro(line.net_cents)}.`);
    }
    const rate = percentToBasisPoints(line.vat_rate);
    if (rate !== null && line.vat_cents != null && Math.abs(vatOn(line.net_cents, rate) - line.vat_cents) > TOLERANCE_CENTS) add("LINE_VAT_MISMATCH", "error", `lines.${index}.vat_cents`, `Line ${index + 1}: ${formatPercent(rate)} of ${euro(line.net_cents)} is ${euro(vatOn(line.net_cents, rate))}, but the line shows ${euro(line.vat_cents)} VAT.`);
  });
  if (input.lines.length && net !== null) {
    const sum = input.lines.reduce((total, line) => total + line.net_cents, 0);
    if (sum !== net) add("LINES_NET_MISMATCH", "error", "lines", `The line amounts add up to ${euro(sum)}, but the invoice net amount is ${euro(net)}.`);
  }
  if (input.lines.length && vat !== null && input.lines.every((line) => line.vat_cents != null)) {
    const sum = input.lines.reduce((total, line) => total + (line.vat_cents ?? 0), 0);
    if (Math.abs(sum - vat) > input.lines.length * TOLERANCE_CENTS) add("LINES_VAT_MISMATCH", "error", "lines", `The line VAT amounts add up to ${euro(sum)}, but the invoice VAT is ${euro(vat)}.`);
  }
  input.vat_breakdown.forEach((row, index) => {
    const rate = percentToBasisPoints(row.rate)!;
    if (Math.abs(vatOn(row.net_cents, rate) - row.vat_cents) > TOLERANCE_CENTS) add("BREAKDOWN_VAT_MISMATCH", "error", `vat_breakdown.${index}`, `${formatPercent(rate)} of ${euro(row.net_cents)} is ${euro(vatOn(row.net_cents, rate))}, but the VAT summary shows ${euro(row.vat_cents)}.`);
  });
  if (input.vat_breakdown.length) {
    const netSum = input.vat_breakdown.reduce((total, row) => total + row.net_cents, 0), vatSum = input.vat_breakdown.reduce((total, row) => total + row.vat_cents, 0);
    if (net !== null && netSum !== net) add("BREAKDOWN_TOTAL_MISMATCH", "error", "vat_breakdown", `The VAT summary covers a net ${euro(netSum)}, but the invoice net amount is ${euro(net)}.`);
    if (vat !== null && vatSum !== vat) add("BREAKDOWN_TOTAL_MISMATCH", "error", "vat_breakdown", `The VAT summary adds up to ${euro(vatSum)} VAT, but the invoice VAT is ${euro(vat)}.`);
  }

  // 2. Where the supply comes from decides the VAT treatment, which an accountant confirms.
  const supplierCountry = countryOf(input.supplier.country, input.supplier.vat_number);
  const buyerCountry = countryOf(input.buyer.country, input.buyer.vat_number) ?? "CY";
  const registered = input.buyer.vat_registered;
  const vatCharged = vat !== null ? vat > 0 : input.vat_breakdown.some((row) => row.vat_cents > 0) || input.lines.some((line) => (line.vat_cents ?? 0) > 0);
  const vatKnown = vat !== null || input.vat_breakdown.length > 0 || input.lines.some((line) => line.vat_cents != null);
  const descriptions = input.lines.map((line) => line.description).join("\n");
  const reverseHint = supplierCountry === "CY" ? DOMESTIC_REVERSE_CHARGE_HINTS.find((hint) => hint.words.test(descriptions)) : undefined;
  let treatment: Treatment;
  let explanation: string;
  if (buyerCountry !== "CY") add("BUYER_NOT_IN_CYPRUS", "review", "buyer.country", "These rules cover invoices received by a business established in Cyprus. Check the treatment under the buyer's own VAT rules.");
  if (!vatKnown) {
    treatment = "unknown";
    explanation = "The VAT amount is not known, so the VAT treatment cannot be suggested.";
  } else if (supplierCountry === null) {
    treatment = "unknown";
    explanation = "The supplier's country is not known (no country and no EU VAT number), so the VAT treatment cannot be suggested.";
    add("SUPPLIER_COUNTRY_UNKNOWN", "review", "supplier.country", "Enter the supplier's country or VAT number: the VAT treatment depends on where the supply comes from.");
  } else if (supplierCountry === "CY" && reverseHint && registered) {
    treatment = vatCharged ? "domestic_reverse_charge_review" : "domestic_reverse_charge";
    explanation = vatCharged
      ? `The lines look like ${reverseHint.label}, which falls under the Cyprus domestic reverse charge (${reverseHint.article}) when the buyer is VAT-registered, yet the supplier charged VAT.`
      : `The lines look like ${reverseHint.label} with no VAT charged: consistent with the Cyprus domestic reverse charge (${reverseHint.article}). The buyer accounts for the VAT.`;
    add("POSSIBLE_DOMESTIC_REVERSE_CHARGE", "review", "lines", vatCharged
      ? `Possible ${reverseHint.article} supply (${reverseHint.label}) with VAT charged by the supplier. If the reverse charge applies, the supplier should not charge VAT and the buyer self-accounts. Check before paying the VAT amount.`
      : `Possible ${reverseHint.article} supply (${reverseHint.label}). The buyer must self-account for Cyprus VAT; confirm that the reverse charge applies and which rate.`);
  } else if (supplierCountry === "CY") {
    treatment = vatCharged ? "domestic" : "domestic_zero_or_exempt";
    explanation = vatCharged ? "Supply by a Cyprus supplier with Cyprus VAT charged." : "Supply by a Cyprus supplier with no VAT charged.";
    if (!vatCharged) add("ZERO_RATED_OR_EXEMPT", "review", "totals.vat_cents", "No VAT is charged by a Cyprus supplier. Confirm the basis: a zero-rated or exempt supply (including the temporary 0% on certain basic goods, extended to 31 December 2026), or a supplier that is not VAT-registered.");
    if (vatCharged && !input.supplier.vat_number) add("MISSING_SUPPLIER_VAT_NUMBER", "review", "supplier.vat_number", "VAT is charged but the supplier's VAT number is missing. A valid tax invoice shows it; without it an input VAT claim may be refused.");
  } else if (EU_COUNTRIES.has(supplierCountry)) {
    treatment = vatCharged ? "foreign_vat_charged" : "eu_reverse_charge";
    explanation = vatCharged
      ? `Supply from another EU country (${supplierCountry}) with VAT charged.`
      : `Supply from another EU country (${supplierCountry}) with no VAT charged: the usual business-to-business case where the Cyprus buyer self-accounts for VAT (intra-Community acquisition of goods, or reverse charge on services).`;
    add(vatCharged ? "FOREIGN_VAT_CHARGED" : "EU_REVERSE_CHARGE", "review", "totals.vat_cents", vatCharged
      ? "Foreign VAT is charged on a cross-border supply. It cannot be recovered through the Cyprus VAT return (the EU VAT refund procedure may apply). Check whether the supplier should have applied the reverse charge instead."
      : "The buyer must account for Cyprus VAT on this purchase in its own return. Confirm the reverse charge applies (the buyer's VAT number should appear on the invoice) and the applicable Cyprus rate.");
  } else {
    treatment = "non_eu_supply";
    explanation = `Supply from outside the EU (${supplierCountry}).`;
    add(vatCharged ? "FOREIGN_VAT_CHARGED" : "NON_EU_SUPPLY", "review", "supplier.country", vatCharged
      ? "Foreign VAT or sales tax is charged by a supplier outside the EU. It cannot be recovered through the Cyprus VAT return."
      : "For services from outside the EU, the Cyprus buyer usually self-accounts for VAT (reverse charge). For goods, import VAT is paid at customs, not on this invoice. Confirm which applies.");
  }
  if (!registered) add("BUYER_NOT_VAT_REGISTERED", "info", "buyer.vat_registered", "The buyer is not VAT-registered, so any VAT charged is part of the cost and is not recovered. The draft entry includes it in the expense.");
  if (treatment === "domestic" && registered) add("INPUT_VAT_RECOVERABILITY", "review", "totals.vat_cents", "VAT shown on an invoice is not automatically recoverable. Confirm the purchase relates to taxable activities and is not a blocked item (for example entertainment or private passenger cars) before claiming it.");

  // 3. Stated rates must exist in Cyprus on the invoice date (only checked for Cyprus or unknown suppliers).
  const checkCyprusRates = supplierCountry === "CY" || supplierCountry === null;
  if (input.invoice_date < RATE_TABLE_FROM) add("RATE_TABLE_PERIOD", "review", "invoice_date", `The invoice is dated before ${RATE_TABLE_FROM}, which this rate table does not cover. Check the rates in force on that date.`);
  else if (checkCyprusRates) {
    const valid = validRatesOn(input.invoice_date).map((rate) => rate.basisPoints);
    const stated = [...input.vat_breakdown.map((row, index) => ({ rate: percentToBasisPoints(row.rate)!, field: `vat_breakdown.${index}.rate` })), ...input.lines.flatMap((line, index) => line.vat_rate ? [{ rate: percentToBasisPoints(line.vat_rate)!, field: `lines.${index}.vat_rate` }] : [])];
    for (const { rate, field } of stated) if (!valid.includes(rate)) add("RATE_NOT_CYPRUS", supplierCountry === "CY" ? "error" : "review", field, `${formatPercent(rate)} is not a Cyprus VAT rate on ${input.invoice_date}. Valid rates then: ${valid.map(formatPercent).join(", ")}.`);
    if (!stated.length && net !== null && vat !== null && net > 0 && vat > 0 && !valid.some((rate) => rate > 0 && Math.abs(vatOn(net, rate) - vat) <= TOLERANCE_CENTS)) add("IMPLIED_RATE_UNUSUAL", "review", "totals.vat_cents", `VAT of ${euro(vat)} on ${euro(net)} is ${((vat / net) * 100).toFixed(2)}%, which is not a single Cyprus rate. Mixed rates need a VAT breakdown; otherwise the VAT is wrong.`);
  }
  if (input.currency !== "EUR") add("NON_EUR_CURRENCY", "review", "currency", `The invoice is in ${input.currency}. Amounts in the Cyprus VAT return are in euro: convert at the applicable exchange rate.`);
  if (input.document_type === "credit_note") add("CREDIT_NOTE", "info", "document_type", "Credit note: the draft entry reverses the usual direction. Link it to the original invoice and reduce the VAT originally claimed.");

  // 4. Categories per line; the invoice-level suggestion is the category carrying the most net value.
  const lines = input.lines.map((line, index) => {
    const suggestion = suggestCategory(line.description, categories);
    const capitalisation_review = Boolean(suggestion.category.capitalisable) && line.net_cents >= input.capitalisation_threshold_cents;
    if (capitalisation_review) add("CAPITALISATION_REVIEW", "review", `lines.${index}`, `Line ${index + 1} (${euro(line.net_cents)}, ${suggestion.category.name}) is at or above the ${euro(input.capitalisation_threshold_cents)} capitalisation threshold. Decide whether to record it as a fixed asset.`);
    return { index, description: line.description, net_cents: line.net_cents, category_id: suggestion.category.id, category_name: suggestion.category.name, matched_keywords: suggestion.matched, capitalisation_review, account: capitalisation_review ? "Fixed assets (capitalisation to confirm)" : suggestion.category.account };
  });
  const byCategory = new Map<string, { net: number; line: (typeof lines)[number] }>();
  for (const line of lines) { const entry = byCategory.get(line.category_id); byCategory.set(line.category_id, { net: (entry?.net ?? 0) + line.net_cents, line: entry?.line ?? line }); }
  const top = [...byCategory.values()].sort((a, b) => b.net - a.net)[0]?.line;
  const fallback = suggestCategory(input.supplier.name ?? "", categories);
  const category = top ? { id: top.category_id, name: top.category_name, matched_keywords: top.matched_keywords } : { id: fallback.category.id, name: fallback.category.name, matched_keywords: fallback.matched };
  if (category.id === "other") add("CATEGORY_NOT_RECOGNISED", "review", "lines", "No expense category matched the invoice wording. Choose one before posting.");

  // 5. Draft journal: only when the numbers are known and consistent.
  const errors = findings.some((finding) => finding.severity === "error");
  let journal: AccountingReview["journal"] = null, unavailable: string | null = null;
  if (errors) unavailable = "Resolve the confirmed errors on the invoice before drafting an entry.";
  else if (net === null || vat === null) unavailable = "The net and VAT amounts are needed to draft an entry.";
  else journal = { status: "draft", note: "Suggested entry for review by an authorised accountant. Nothing is posted to a ledger.", lines: draftJournal({ net, vat, gross, lines, category, categories, treatment, registered, creditNote: input.document_type === "credit_note", supplier: input.supplier.name ?? "supplier" }) };

  return {
    rules_version: RULES_VERSION,
    status: errors ? "errors_found" : findings.some((finding) => finding.severity === "review") ? "needs_review" : "consistent",
    document_type: input.document_type,
    treatment: { code: treatment, explanation },
    findings,
    category,
    lines: lines.map((line) => ({ index: line.index, description: line.description, net_cents: line.net_cents, category_id: line.category_id, category_name: line.category_name, matched_keywords: line.matched_keywords, capitalisation_review: line.capitalisation_review })),
    journal,
    journal_unavailable_reason: unavailable,
    disclaimer: "Suggestions from documented rules, not tax advice. An authorised accountant reviews the classification, VAT treatment and entry before anything is recorded or filed.",
  };
}

function draftJournal(args: { net: number; vat: number; gross: number; lines: { net_cents: number; account: string }[]; category: { id: string; name: string }; categories: readonly ExpenseCategory[]; treatment: Treatment; registered: boolean; creditNote: boolean; supplier: string }): JournalLine[] {
  const entries: JournalLine[] = [];
  const debit = (account: string, amount: number, memo: string) => amount && entries.push({ account, debit_cents: amount, credit_cents: 0, memo });
  const credit = (account: string, amount: number, memo: string) => amount && entries.push({ account, debit_cents: 0, credit_cents: amount, memo });
  // Expense (or asset) debits by account, from the lines when present.
  const expense = new Map<string, number>();
  if (args.lines.length) for (const line of args.lines) expense.set(line.account, (expense.get(line.account) ?? 0) + line.net_cents);
  else expense.set((args.categories.find((item) => item.id === args.category.id)?.account) ?? args.category.name, args.net);
  // VAT the buyer cannot reclaim through its Cyprus return becomes part of the cost.
  const vatIsCost = args.vat > 0 && (!args.registered || args.treatment === "foreign_vat_charged" || args.treatment === "non_eu_supply");
  const accounts = [...expense.keys()];
  accounts.forEach((account, index) => {
    // Spread non-recoverable VAT over the debit lines, the remainder on the last so the entry balances to the cent.
    const portion = (name: string) => (args.net > 0 ? Math.floor(args.vat * expense.get(name)! / args.net) : 0);
    const share = vatIsCost ? (index === accounts.length - 1 ? args.vat - accounts.slice(0, -1).reduce((sum, other) => sum + portion(other), 0) : portion(account)) : 0;
    debit(account, expense.get(account)! + share, vatIsCost && share ? "Net amount including VAT that is not recoverable" : "Net amount");
  });
  if (args.vat > 0 && !vatIsCost) debit("Input VAT (recoverability to confirm)", args.vat, "VAT charged on the invoice; confirm it is recoverable before claiming");
  credit(`Accounts payable – ${args.supplier}`, args.gross, "Amount owed to the supplier");
  if (args.registered && (args.treatment === "eu_reverse_charge" || args.treatment === "domestic_reverse_charge")) {
    const selfAssessed = vatOn(args.net, STANDARD_RATE_BP);
    debit("Input VAT – reverse charge (recoverability to confirm)", selfAssessed, `Self-assessed at the ${formatPercent(STANDARD_RATE_BP)} standard rate; confirm the applicable rate`);
    credit("Output VAT – reverse charge", selfAssessed, `Self-assessed at the ${formatPercent(STANDARD_RATE_BP)} standard rate; confirm the applicable rate`);
  }
  const lines = args.creditNote ? entries.map((entry) => ({ ...entry, debit_cents: entry.credit_cents, credit_cents: entry.debit_cents })) : entries;
  const debits = lines.reduce((sum, entry) => sum + entry.debit_cents, 0), credits = lines.reduce((sum, entry) => sum + entry.credit_cents, 0);
  if (debits !== credits) throw new Error("Internal error: draft journal does not balance");
  return lines;
}
