export interface RiskSignal {
  code: string;
  weight: number;
  explanation: string;
  severity: "critical" | "review";
}

export interface Assessment {
  score: number;
  level: "critical" | "review" | "low";
  recommended_status: "blocked" | "needs_review" | "ready";
  signals: RiskSignal[];
  reason: string;
  kind: "duplicate" | "iban" | "amount" | "new" | "normal";
}

export interface RiskInput {
  invoiceNumber: string;
  currentAccount: string;
  amountCents: number;
  previousAccounts: Iterable<string>;
  previousPaidAmountsCents: Iterable<number>;
  previouslyPaidInvoices: Iterable<string>;
}

const normalizedAccount = (value: string) => value.toUpperCase().replace(/\s+/g, "");
const medianTwice = (amounts: number[]): number => {
  const sorted = [...amounts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] * 2 : sorted[middle - 1] + sorted[middle];
};

function ratioOneDecimal(amount: number, typicalTwice: number): string {
  const numerator = BigInt(amount) * 20n;
  const denominator = BigInt(typicalTwice);
  const whole = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = whole + (remainder * 2n > denominator || (remainder * 2n === denominator && whole % 2n !== 0n) ? 1n : 0n);
  return `${rounded / 10n}.${rounded % 10n}`;
}

export function assessPayment(input: RiskInput): Assessment {
  const { invoiceNumber, currentAccount, amountCents } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("amount_cents must be positive");
  if (!invoiceNumber.trim() || !currentAccount.trim()) throw new Error("invoice_number and current_account are required");

  const accounts = [...input.previousAccounts].filter((account) => account.trim()).map(normalizedAccount);
  const amounts = [...input.previousPaidAmountsCents].filter((amount) => amount > 0);
  const paid = new Set([...input.previouslyPaidInvoices].map((value) => value.trim().toLocaleLowerCase("en-US")));
  const signals: RiskSignal[] = [];

  if (paid.has(invoiceNumber.trim().toLocaleLowerCase("en-US"))) {
    signals.push({ code: "DUPLICATE_PAID_INVOICE", weight: 100, explanation: "This supplier's invoice number matches a previously paid invoice. A second payment must be blocked.", severity: "critical" });
  }
  if (accounts.length) {
    const counts = new Map<string, number>();
    for (const account of accounts) counts.set(account, (counts.get(account) ?? 0) + 1);
    const canonical = [...counts.keys()].sort().reduce((best, account) => (counts.get(account)! > counts.get(best)! ? account : best));
    if (normalizedAccount(currentAccount) !== canonical) {
      signals.push({ code: "BANK_ACCOUNT_CHANGED", weight: 75, explanation: `The payment destination differs from the account used in ${counts.get(canonical)} of ${accounts.length} prior supplier payments. Independently verify the new account.`, severity: "critical" });
    }
  } else {
    signals.push({ code: "NEW_SUPPLIER_OR_NO_HISTORY", weight: 45, explanation: "No historical payments were found for this supplier. Confirm identity and payment instructions before approval.", severity: "review" });
  }
  if (amounts.length >= 3) {
    const typicalTwice = medianTwice(amounts);
    const ratio = ratioOneDecimal(amountCents, typicalTwice);
    const typical = (typicalTwice / 200).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (BigInt(amountCents) * 4n >= BigInt(typicalTwice) * 5n) {
      signals.push({ code: "LARGE_AMOUNT_DEVIATION", weight: 65, explanation: `Amount is ${ratio}× the median of ${amounts.length} historical payments (€${typical}).`, severity: "review" });
    } else if (BigInt(amountCents) * 8n >= BigInt(typicalTwice) * 7n) {
      signals.push({ code: "ELEVATED_AMOUNT", weight: 40, explanation: `Amount is ${ratio}× the historical median (€${typical}).`, severity: "review" });
    }
  }
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const duplicate = signals.some((signal) => signal.code === "DUPLICATE_PAID_INVOICE");
  return {
    score,
    level: score >= 75 ? "critical" : score >= 40 ? "review" : "low",
    recommended_status: duplicate ? "blocked" : score >= 40 ? "needs_review" : "ready",
    signals,
    reason: signals[0]?.explanation ?? "Account, invoice reference and amount are consistent with the available historical data.",
    kind: duplicate ? "duplicate" : signals.some((signal) => signal.code === "BANK_ACCOUNT_CHANGED") ? "iban" : signals.some((signal) => signal.code === "LARGE_AMOUNT_DEVIATION" || signal.code === "ELEVATED_AMOUNT") ? "amount" : signals.length ? "new" : "normal",
  };
}
