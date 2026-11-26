import { z } from "zod";
import type { InvoiceDraftFields } from "../../intake";
import { normalizeIban } from "../security/account";

const evidence = z.strictObject({
  value: z.string().nullable(),
  source_value: z.string().nullable(),
  supporting_text: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  uncertain: z.boolean(),
});
const party = z.strictObject({ legal_name: evidence, trading_name: evidence, registration_number: evidence, vat_number: evidence, address: evidence, country: evidence, email: evidence, telephone: evidence });
const account = z.strictObject({ iban: evidence, account_number: evidence, bank_name: evidence, bic: evidence, beneficiary_name: evidence, instructions: evidence });
const lineItem = z.strictObject({ description: evidence, code: evidence, quantity: evidence, unit: evidence, unit_price: evidence, discount: evidence, net_amount: evidence, vat_rate: evidence, vat_amount: evidence, total_amount: evidence });
export const universalDocumentSchema = z.strictObject({
  document_type: z.enum(["invoice", "credit_note", "proforma_invoice", "commercial_invoice", "electronic_invoice", "receipt", "purchase_order", "delivery_note", "payment_confirmation", "account_statement", "unknown"]),
  languages: z.array(z.string()).max(12),
  multiple_invoices: z.boolean(),
  document: z.strictObject({ invoice_number: evidence, invoice_date: evidence, due_date: evidence, purchase_order_reference: evidence, payment_reference: evidence, original_invoice_reference: evidence }),
  supplier: party,
  customer: z.strictObject({ ...party.shape, customer_reference: evidence }),
  accounts: z.array(account).max(20),
  financial: z.strictObject({ currency: evidence, subtotal: evidence, discounts: evidence, net_amount: evidence, vat_amount: evidence, additional_charges: evidence, shipping: evidence, gross_total: evidence, amount_paid: evidence, outstanding_balance: evidence }),
  vat_breakdown: z.array(z.strictObject({ rate: evidence, net_amount: evidence, vat_amount: evidence })).max(30),
  line_items: z.array(lineItem).max(300),
  warnings: z.array(z.string()).max(50),
});
export type UniversalDocument = z.infer<typeof universalDocumentSchema>;
export type ValidationFinding = { code: string; severity: "warning" | "blocking"; detail: string; field: string };

// Decimal conversion is exact for up to two fractional digits; ambiguous notation stays unparsed.
export function minorUnits(input: string | null | undefined): bigint | null {
  if (!input) return null;
  let value = input.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (/^\(.*\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  value = value.replace(/^[A-Z]{3}/i, "").replace(/[A-Z]{3}$/i, "").replace(/^[€£$]/, "").replace(/[€£$]$/, "");
  const sign = value.startsWith("-") ? -1n : 1n;
  value = value.replace(/^[+-]/, "");
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    value = value.replaceAll(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    if (/^\d{1,3}(?:,\d{3})+$/.test(value)) value = value.replaceAll(",", "");
    else value = value.replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replaceAll(".", "");
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return sign * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}

function quantityUnits(input: string | null): bigint | null {
  if (!input) return null;
  const normalized = input.trim().replace(",", ".");
  if (!/^-?\d{1,9}(?:\.\d{1,4})?$/.test(normalized)) return null;
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace(/^-/, "").split(".");
  return (negative ? -1n : 1n) * (BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0")));
}

export function projectPayableFields(document: UniversalDocument): InvoiceDraftFields {
  return {
    supplier_name: document.supplier.legal_name.value,
    registration_number: document.supplier.registration_number.value,
    vat_number: document.supplier.vat_number.value,
    invoice_number: document.document.invoice_number.value,
    invoice_date: document.document.invoice_date.value,
    due_date: document.document.due_date.value,
    total_amount: document.financial.outstanding_balance.value ?? document.financial.gross_total.value,
    currency: document.financial.currency.value,
    iban: document.accounts.length === 1 ? document.accounts[0].iban.value : null,
    payment_reference: document.document.payment_reference.value,
  };
}

export function applyReviewedFields(document: UniversalDocument, fields: InvoiceDraftFields): UniversalDocument {
  const reviewed = structuredClone(document);
  const assign = (target: z.infer<typeof evidence>, value: string | null) => { if (target.value !== value) { target.value = value; target.uncertain = false; } };
  assign(reviewed.supplier.legal_name, fields.supplier_name);
  assign(reviewed.supplier.registration_number, fields.registration_number);
  assign(reviewed.supplier.vat_number, fields.vat_number);
  assign(reviewed.document.invoice_number, fields.invoice_number);
  assign(reviewed.document.invoice_date, fields.invoice_date);
  assign(reviewed.document.due_date, fields.due_date);
  assign(reviewed.document.payment_reference, fields.payment_reference);
  assign(reviewed.financial.currency, fields.currency);
  if (!reviewed.financial.outstanding_balance.value && !reviewed.financial.gross_total.value) assign(reviewed.financial.gross_total, fields.total_amount);
  if (reviewed.accounts.length === 1) assign(reviewed.accounts[0].iban, fields.iban);
  return reviewed;
}

export function validateUniversalDocument(document: UniversalDocument): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const add = (code: string, severity: ValidationFinding["severity"], field: string, detail: string) => findings.push({ code, severity, field, detail });
  if (!["invoice", "commercial_invoice", "electronic_invoice"].includes(document.document_type)) add("NOT_PAYABLE_INVOICE", "blocking", "document_type", "Review the document type before financial analysis");
  if (document.multiple_invoices) add("MULTIPLE_INVOICES", "blocking", "document_type", "Split or manually resolve the invoices before analysis");
  if (document.accounts.length > 1) add("MULTIPLE_ACCOUNTS", "warning", "accounts", "Choose and verify the intended beneficiary account");
  for (const [index, account] of document.accounts.entries()) {
    if (account.iban.value) { try { normalizeIban(account.iban.value); } catch { add("INVALID_IBAN", "warning", `accounts.${index}.iban`, "IBAN checksum or format is invalid"); } }
    const beneficiary = account.beneficiary_name.value?.trim().toLocaleLowerCase();
    const supplier = document.supplier.legal_name.value?.trim().toLocaleLowerCase();
    const trading = document.supplier.trading_name.value?.trim().toLocaleLowerCase();
    if (beneficiary && supplier && beneficiary !== supplier && beneficiary !== trading) add("BENEFICIARY_MISMATCH", "warning", `accounts.${index}.beneficiary_name`, "Beneficiary name differs from the supplier name; verify independently");
  }
  const currency = document.financial.currency.value;
  if (currency && !/^[A-Z]{3}$/.test(currency)) add("CURRENCY_INVALID", "warning", "financial.currency", "Currency must be an ISO 4217 code");
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    const amounts = [document.financial.subtotal.value, document.financial.net_amount.value, document.financial.vat_amount.value, document.financial.gross_total.value, document.financial.outstanding_balance.value, ...document.line_items.flatMap((line) => [line.unit_price.value, line.net_amount.value, line.total_amount.value])];
    if (amounts.some((value) => { const marked = value?.match(/(?:^|\s)([A-Z]{3})(?:\s|$)/)?.[1]; return marked && marked !== currency; })) add("CURRENCY_MISMATCH", "warning", "financial.currency", "An amount uses a different currency code");
  }
  const date = document.document.invoice_date.value;
  const due = document.document.due_date.value;
  if (date && due && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < date) add("DATE_ORDER", "warning", "document.due_date", "Due date precedes invoice date");
  const gross = minorUnits(document.financial.gross_total.value);
  const statedNet = minorUnits(document.financial.net_amount.value);
  const net = statedNet ?? minorUnits(document.financial.subtotal.value);
  const vat = minorUnits(document.financial.vat_amount.value);
  const charges = minorUnits(document.financial.additional_charges.value) ?? 0n;
  const shipping = minorUnits(document.financial.shipping.value) ?? 0n;
  const discounts = minorUnits(document.financial.discounts.value) ?? 0n;
  if (gross !== null && net !== null && vat !== null) {
    const expectedGross = net + vat + charges + shipping - (statedNet === null ? discounts : 0n);
    const withinTolerance = (value: bigint) => value - gross <= 2n && gross - value <= 2n;
    // Net amount already includes discounts; subtotal requires subtracting them.
    if (!withinTolerance(expectedGross)) add("GROSS_MISMATCH", "warning", "financial.gross_total", "Gross total differs from net, tax and adjustments");
  }
  const paid = minorUnits(document.financial.amount_paid.value);
  const outstanding = minorUnits(document.financial.outstanding_balance.value);
  if (gross !== null && paid !== null && outstanding !== null && gross - paid !== outstanding) add("BALANCE_MISMATCH", "warning", "financial.outstanding_balance", "Outstanding balance differs from gross less paid");
  const vatParts = document.vat_breakdown.map((part) => minorUnits(part.vat_amount.value));
  if (vat !== null && vatParts.length && vatParts.every((part) => part !== null)) {
    const sum = vatParts.reduce<bigint>((total, part) => total + (part ?? 0n), 0n);
    if (sum - vat > 2n || vat - sum > 2n) add("VAT_BREAKDOWN_MISMATCH", "warning", "vat_breakdown", "VAT rates do not add up to the stated VAT amount");
  }
  const lineTotals = document.line_items.map((line) => minorUnits(line.total_amount.value));
  const lineNets = document.line_items.map((line) => minorUnits(line.net_amount.value));
  if (net !== null && lineNets.length && lineNets.every((value) => value !== null)) {
    const sum = lineNets.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);
    if (sum - net > 2n || net - sum > 2n) add("LINE_TOTAL_MISMATCH", "warning", "line_items", "Line totals differ from the stated net amount");
  }
  for (const [index, line] of document.line_items.entries()) {
    const quantity = quantityUnits(line.quantity.value);
    const price = minorUnits(line.unit_price.value);
    const discount = minorUnits(line.discount.value) ?? 0n;
    const lineNet = minorUnits(line.net_amount.value);
    if (quantity !== null && price !== null && lineNet !== null) {
      const calculated = (quantity * price + 5_000n) / 10_000n - discount;
      if (calculated - lineNet > 2n || lineNet - calculated > 2n) add("LINE_CALCULATION", "warning", `line_items.${index}`, "Quantity, unit price and discount do not match line net amount");
    }
    const lineVat = minorUnits(line.vat_amount.value);
    const rate = quantityUnits(line.vat_rate.value?.replace(/%$/, "") ?? null);
    if (lineNet !== null && lineVat !== null && rate !== null) {
      const calculated = (lineNet * rate + 500_000n) / 1_000_000n;
      if (calculated - lineVat > 2n || lineVat - calculated > 2n) add("LINE_VAT", "warning", `line_items.${index}.vat_amount`, "Line VAT does not match net amount and VAT rate");
    }
  }
  if (gross !== null && lineTotals.length && lineTotals.every((value) => value !== null) && document.line_items.length && !document.financial.additional_charges.value && !document.financial.shipping.value && !document.financial.discounts.value) {
    const sum = lineTotals.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);
    if (sum - gross > 2n || gross - sum > 2n) add("LINE_GROSS_MISMATCH", "warning", "line_items", "Line gross amounts differ from invoice gross total");
  }
  return findings;
}
