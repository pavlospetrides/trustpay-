export function syntheticIban(number: number): string {
  const body = `TRST000000${String(number).padStart(8, "0")}`;
  const raw = body + "GB00";
  let remainder = 0;
  for (const char of raw) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return `GB${String(98 - remainder).padStart(2, "0")}${body}`;
}

export const suppliers = [
  { id: "SUP-001", name: "Aegean Supplies Ltd", short: "Aegean Supplies", account: syntheticIban(1), count: 14, typicalCents: 760_000, prefix: "AS-HIST" },
  { id: "SUP-002", name: "Meridian Office Ltd", short: "Meridian Office", account: syntheticIban(2), count: 9, typicalCents: 350_000, prefix: "MO-HIST" },
  { id: "SUP-003", name: "Kastro Maintenance Ltd", short: "Kastro Maintenance", account: syntheticIban(3), count: 12, typicalCents: 496_000, prefix: "KM-HIST" },
  { id: "SUP-004", name: "Palm Tree Logistics Ltd", short: "Palm Tree Logistics", account: syntheticIban(4), count: 8, typicalCents: 120_000, prefix: "PT-HIST" },
];

export const demoInvoices = [
  { id: "INV-2409", supplier_id: "SUP-001", number: "AS-2026-114", amount_cents: 842_000, creditor_account: syntheticIban(99), date: "2026-11-19", source: "jinius_demo_adapter" },
  { id: "INV-2410", supplier_id: "SUP-002", number: "MO-2128", amount_cents: 375_000, creditor_account: syntheticIban(2), date: "2026-11-18", source: "jinius_demo_adapter" },
  { id: "INV-2411", supplier_id: "SUP-003", number: "KM-0921", amount_cents: 1_490_000, creditor_account: syntheticIban(3), date: "2026-11-17", source: "jinius_demo_adapter" },
  { id: "INV-2412", supplier_id: "SUP-004", number: "PT-00891", amount_cents: 124_000, creditor_account: syntheticIban(4), date: "2026-11-16", source: "jinius_demo_adapter" },
];

export class LiveJiniusAdapter {
  listInvoices(): never { throw new Error("Official Jinius sandbox API contract has not been supplied"); }
}
