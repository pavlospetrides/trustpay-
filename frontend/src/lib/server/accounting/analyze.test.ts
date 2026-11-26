import { describe, expect, it } from "vitest";
import { reviewInvoiceAccounting, type AccountingInput, type AccountingReview } from "./analyze";
import { suggestCategory } from "./categories";
import { countryOf, percentToBasisPoints, validRatesOn, vatOn } from "./cyprus-vat";

// Synthetic invoices only. Amounts are integer cents.
const domestic: AccountingInput = {
  invoice_date: "2026-11-20",
  currency: "EUR",
  supplier: { name: "Aegean Supplies Synthetic Ltd", country: "CY", vat_number: "CY10012345A" },
  buyer: { country: "CY", vat_registered: true },
  totals: { net_cents: 100_000, vat_cents: 19_000, gross_cents: 119_000 },
  lines: [{ description: "Printing paper and toner", quantity: "10", unit_price_cents: 10_000, net_cents: 100_000, vat_rate: "19", vat_cents: 19_000 }],
};
const review = (changes: Partial<AccountingInput>) => reviewInvoiceAccounting({ ...domestic, ...changes });
const codes = (result: AccountingReview) => result.findings.map((finding) => finding.code);
const severity = (result: AccountingReview, code: string) => result.findings.find((finding) => finding.code === code)?.severity;
const balanced = (result: AccountingReview) => {
  const lines = result.journal!.lines;
  return lines.reduce((sum, line) => sum + line.debit_cents, 0) === lines.reduce((sum, line) => sum + line.credit_cents, 0);
};

describe("Cyprus VAT helpers", () => {
  it("reads rates as exact basis points", () => {
    expect([percentToBasisPoints("19"), percentToBasisPoints("19%"), percentToBasisPoints(" 9.00 "), percentToBasisPoints("5,5"), percentToBasisPoints("abc"), percentToBasisPoints("101")]).toEqual([1900, 1900, 900, 550, null, null]);
  });
  it("rounds VAT half up in integer cents", () => {
    expect([vatOn(1_950, 1900), vatOn(1_999, 1900), vatOn(100_000, 500), vatOn(-1_950, 1900)]).toEqual([371, 380, 5_000, -371]);
  });
  it("knows the 3% rate only from 21 July 2023", () => {
    expect(validRatesOn("2023-07-20").map((rate) => rate.basisPoints)).not.toContain(300);
    expect(validRatesOn("2023-07-21").map((rate) => rate.basisPoints)).toEqual([1900, 900, 500, 300, 0]);
  });
  it("takes the country from the field or an EU VAT prefix (EL is Greece)", () => {
    expect([countryOf("cy", null), countryOf(null, "EL123456789"), countryOf(null, "DE 123456789"), countryOf(null, "123456"), countryOf(null, "US12-345")]).toEqual(["CY", "GR", "DE", null, null]);
  });
  it("suggests categories from whole words and says which words matched", () => {
    expect(suggestCategory("Annual Adobe licence renewal")).toMatchObject({ category: { id: "software_subscriptions" }, matched: ["licence", "adobe"] });
    expect(suggestCategory("EAC electricity bill, October").category.id).toBe("utilities");
    expect(suggestCategory("Gasket replacement").category.id).toBe("other"); // "gas" must not match inside "gasket"
  });
});

describe("accounting review of an invoice", () => {
  it("drafts a balanced entry for a clean domestic invoice and never assumes VAT is recoverable", () => {
    const result = review({});
    expect(result.status).toBe("needs_review");
    expect(codes(result)).toEqual(["INPUT_VAT_RECOVERABILITY"]);
    expect(result.treatment.code).toBe("domestic");
    expect(result.category).toEqual({ id: "office_expenses", name: "Office expenses", matched_keywords: ["paper", "toner", "printing paper"] });
    expect(result.journal!.lines.map((line) => [line.account, line.debit_cents, line.credit_cents])).toEqual([
      ["Office expenses", 100_000, 0],
      ["Input VAT (recoverability to confirm)", 19_000, 0],
      ["Accounts payable – Aegean Supplies Synthetic Ltd", 0, 119_000],
    ]);
  });

  it("reports totals that do not add up as confirmed errors and withholds the entry", () => {
    const result = review({ totals: { net_cents: 100_000, vat_cents: 19_000, gross_cents: 120_000 } });
    expect(result.status).toBe("errors_found");
    expect(severity(result, "GROSS_MISMATCH")).toBe("error");
    expect(result.findings[0].message).toContain("€1,190.00");
    expect([result.journal, result.journal_unavailable_reason]).toEqual([null, "Resolve the confirmed errors on the invoice before drafting an entry."]);
  });

  it("checks quantity × price less discount, line VAT, and line sums", () => {
    const lines = [{ description: "Toner", quantity: "1.5", unit_price_cents: 1_000, discount_cents: 100, net_cents: 1_400, vat_rate: "19%", vat_cents: 266 }];
    expect(codes(review({ totals: { net_cents: 1_400, vat_cents: 266, gross_cents: 1_666 }, lines }))).not.toContain("LINE_AMOUNT_MISMATCH");
    expect(codes(review({ totals: { net_cents: 1_500, vat_cents: 266, gross_cents: 1_766 }, lines: [{ ...lines[0], net_cents: 1_500 }] }))).toContain("LINE_AMOUNT_MISMATCH");
    // 19% of €19.99 is €3.80 (rounded); one cent of rounding is accepted, two are not.
    const vatLine = (vat: number) => review({ totals: { net_cents: 1_999, vat_cents: vat, gross_cents: 1_999 + vat }, lines: [{ description: "Toner", net_cents: 1_999, vat_rate: "19", vat_cents: vat }] });
    expect(codes(vatLine(381))).not.toContain("LINE_VAT_MISMATCH");
    expect(codes(vatLine(382))).toContain("LINE_VAT_MISMATCH");
    expect(codes(review({ totals: { net_cents: 90_000, vat_cents: 19_000, gross_cents: 109_000 } }))).toContain("LINES_NET_MISMATCH");
  });

  it("checks a mixed-rate VAT summary against the totals", () => {
    const breakdown = [{ rate: "19", net_cents: 1_000, vat_cents: 190 }, { rate: "5", net_cents: 2_000, vat_cents: 100 }];
    const ok = review({ totals: { net_cents: 3_000, vat_cents: 290, gross_cents: 3_290 }, lines: [], vat_breakdown: breakdown });
    expect(ok.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(codes(ok)).not.toContain("IMPLIED_RATE_UNUSUAL");
    expect(codes(review({ totals: { net_cents: 3_000, vat_cents: 300, gross_cents: 3_300 }, lines: [], vat_breakdown: breakdown }))).toContain("BREAKDOWN_TOTAL_MISMATCH");
    expect(codes(review({ totals: { net_cents: 3_000, vat_cents: 300, gross_cents: 3_300 }, lines: [], vat_breakdown: [breakdown[0], { ...breakdown[1], vat_cents: 110 }] }))).toContain("BREAKDOWN_VAT_MISMATCH");
  });

  it("rejects rates that do not exist in Cyprus, dated correctly", () => {
    const at = (rate: string, date: string, country: string | null = "CY") => review({ invoice_date: date, supplier: { ...domestic.supplier, country, vat_number: country ? domestic.supplier.vat_number : null }, totals: { net_cents: 10_000, vat_cents: vatOn(10_000, percentToBasisPoints(rate)!), gross_cents: 10_000 + vatOn(10_000, percentToBasisPoints(rate)!) }, lines: [{ description: "Books", net_cents: 10_000, vat_rate: rate, vat_cents: vatOn(10_000, percentToBasisPoints(rate)!) }] });
    expect(severity(at("17", "2026-11-20"), "RATE_NOT_CYPRUS")).toBe("error");
    expect(severity(at("17", "2026-11-20", null), "RATE_NOT_CYPRUS")).toBe("review"); // supplier country unknown
    expect(codes(at("3", "2023-07-20"))).toContain("RATE_NOT_CYPRUS");
    expect(codes(at("3", "2023-07-21"))).not.toContain("RATE_NOT_CYPRUS");
    expect(codes(at("19", "2013-12-31"))).toContain("RATE_TABLE_PERIOD");
  });

  it("flags VAT that matches no single rate when there is no breakdown", () => {
    expect(codes(review({ totals: { net_cents: 10_000, vat_cents: 1_500, gross_cents: 11_500 }, lines: [] }))).toContain("IMPLIED_RATE_UNUSUAL");
    expect(codes(review({ totals: { net_cents: 10_000, vat_cents: 900, gross_cents: 10_900 }, lines: [] }))).not.toContain("IMPLIED_RATE_UNUSUAL");
  });

  it("drafts a self-assessed reverse charge for an EU supplier that charged no VAT", () => {
    const result = review({ supplier: { name: "Synthetic Cloud GmbH", vat_number: "DE123456789" }, totals: { net_cents: 50_000, vat_cents: 0, gross_cents: 50_000 }, lines: [{ description: "Cloud hosting subscription, November", net_cents: 50_000 }] });
    expect(result.treatment.code).toBe("eu_reverse_charge");
    expect(codes(result)).toContain("EU_REVERSE_CHARGE");
    expect(result.category.id).toBe("software_subscriptions");
    expect(result.journal!.lines.map((line) => [line.account, line.debit_cents, line.credit_cents])).toEqual([
      ["Software and subscriptions", 50_000, 0],
      ["Accounts payable – Synthetic Cloud GmbH", 0, 50_000],
      ["Input VAT – reverse charge (recoverability to confirm)", 9_500, 0],
      ["Output VAT – reverse charge", 0, 9_500],
    ]);
  });

  it("treats foreign VAT as a cost that the Cyprus return cannot recover", () => {
    const result = review({ supplier: { name: "Synthetic Hellas AE", vat_number: "EL123456789" }, totals: { net_cents: 10_000, vat_cents: 2_400, gross_cents: 12_400 }, lines: [{ description: "Consulting services", net_cents: 10_000 }] });
    expect([result.treatment.code, codes(result)]).toEqual(["foreign_vat_charged", ["FOREIGN_VAT_CHARGED"]]);
    expect(result.journal!.lines[0]).toMatchObject({ account: "Professional services", debit_cents: 12_400 });
  });

  it("tells tablet computers from medicine tablets", () => {
    const totals = { net_cents: 1_000, vat_cents: 0, gross_cents: 1_000 };
    expect(review({ totals, lines: [{ description: "Paracetamol tablets 500mg", net_cents: 1_000 }] }).treatment.code).not.toBe("domestic_reverse_charge");
    expect(review({ totals, lines: [{ description: "Tablet computers for field staff", net_cents: 1_000 }] }).treatment.code).toBe("domestic_reverse_charge");
    expect(review({ totals, lines: [{ description: "iPads, 64 GB", net_cents: 1_000 }] }).treatment.code).toBe("domestic_reverse_charge");
  });

  it("spots a possible domestic reverse charge for construction work", () => {
    const work = { description: "Renovation of warehouse roof, labour and materials", net_cents: 200_000 };
    const noVat = review({ totals: { net_cents: 200_000, vat_cents: 0, gross_cents: 200_000 }, lines: [work] });
    expect(noVat.treatment.code).toBe("domestic_reverse_charge");
    expect(noVat.findings.find((finding) => finding.code === "POSSIBLE_DOMESTIC_REVERSE_CHARGE")!.message).toContain("Article 11B");
    expect(noVat.journal!.lines.some((line) => line.account === "Output VAT – reverse charge" && line.credit_cents === 38_000)).toBe(true);
    const charged = review({ totals: { net_cents: 200_000, vat_cents: 38_000, gross_cents: 238_000 }, lines: [{ ...work, vat_rate: "19", vat_cents: 38_000 }] });
    expect(charged.treatment.code).toBe("domestic_reverse_charge_review");
    // A buyer that is not VAT-registered cannot use the reverse charge.
    expect(review({ buyer: { country: "CY", vat_registered: false }, totals: { net_cents: 200_000, vat_cents: 38_000, gross_cents: 238_000 }, lines: [{ ...work, vat_rate: "19", vat_cents: 38_000 }] }).treatment.code).toBe("domestic");
  });

  it("asks about zero-rated, non-EU and unknown-origin supplies instead of guessing", () => {
    expect(codes(review({ totals: { net_cents: 100_000, vat_cents: 0, gross_cents: 100_000 }, lines: [{ description: "Fresh vegetables", net_cents: 100_000, vat_rate: "0", vat_cents: 0 }] }))).toContain("ZERO_RATED_OR_EXEMPT");
    expect(review({ supplier: { name: "Synthetic SaaS Inc", country: "US" }, totals: { net_cents: 10_000, vat_cents: 0, gross_cents: 10_000 }, lines: [{ description: "Software licence", net_cents: 10_000 }] }).treatment.code).toBe("non_eu_supply");
    const unknown = review({ supplier: { name: "Unknown Ltd" } });
    expect([unknown.treatment.code, codes(unknown)]).toEqual(["unknown", ["SUPPLIER_COUNTRY_UNKNOWN"]]);
  });

  it("never invents missing amounts", () => {
    const result = review({ totals: { gross_cents: 119_000 }, lines: [] });
    expect(codes(result)).toContain("MISSING_NET_OR_VAT");
    expect([result.treatment.code, result.journal, result.journal_unavailable_reason]).toEqual(["unknown", null, "The net and VAT amounts are needed to draft an entry."]);
  });

  it("reverses the entry for a credit note", () => {
    const result = review({ document_type: "credit_note" });
    expect(codes(result)).toContain("CREDIT_NOTE");
    expect(result.journal!.lines.map((line) => [line.account, line.debit_cents, line.credit_cents])).toEqual([
      ["Office expenses", 0, 100_000],
      ["Input VAT (recoverability to confirm)", 0, 19_000],
      ["Accounts payable – Aegean Supplies Synthetic Ltd", 119_000, 0],
    ]);
  });

  it("puts VAT into the cost for a buyer that is not VAT-registered, balanced to the cent across lines", () => {
    const result = review({ buyer: { country: "CY", vat_registered: false }, totals: { net_cents: 300, vat_cents: 57, gross_cents: 357 }, lines: [{ description: "Toner", net_cents: 100 }, { description: "Internet broadband", net_cents: 100 }, { description: "Courier delivery", net_cents: 100 }] });
    expect(codes(result)).toContain("BUYER_NOT_VAT_REGISTERED");
    expect(codes(result)).not.toContain("INPUT_VAT_RECOVERABILITY");
    expect(result.journal!.lines.filter((line) => line.debit_cents).map((line) => line.debit_cents)).toEqual([119, 119, 119]);
    expect(balanced(result)).toBe(true);
  });

  it("suggests capitalising equipment above the threshold and accepts an organization's own categories", () => {
    const laptop = review({ totals: { net_cents: 150_000, vat_cents: 28_500, gross_cents: 178_500 }, lines: [{ description: "Laptop for finance team", net_cents: 150_000, vat_rate: "19", vat_cents: 28_500 }] });
    expect(codes(laptop)).toContain("CAPITALISATION_REVIEW");
    expect(laptop.journal!.lines[0].account).toBe("Fixed assets (capitalisation to confirm)");
    expect(codes(review({ capitalisation_threshold_cents: 200_000, totals: { net_cents: 150_000, vat_cents: 28_500, gross_cents: 178_500 }, lines: [{ description: "Laptop", net_cents: 150_000 }] }))).not.toContain("CAPITALISATION_REVIEW");
    const custom = review({ categories: [{ id: "printing", name: "Print room", account: "7400 Print room", keywords: ["toner"] }] });
    expect([custom.category.id, custom.journal!.lines[0].account]).toEqual(["printing", "7400 Print room"]);
    expect(codes(review({ lines: [{ description: "Miscellaneous", net_cents: 100_000, vat_rate: "19", vat_cents: 19_000 }] }))).toContain("CATEGORY_NOT_RECOGNISED");
  });

  it("flags non-euro invoices for conversion", () => {
    expect(codes(review({ currency: "USD" }))).toContain("NON_EUR_CURRENCY");
  });

  it("validates its input like the rest of the API", () => {
    expect(() => review({ invoice_date: "2026-02-30" })).toThrow();
    expect(() => review({ supplier: { name: "Bad\u0000name", country: "CY" } })).toThrow();
    expect(() => review({ totals: { net_cents: 1.5, vat_cents: 0, gross_cents: 2 } })).toThrow();
    expect(() => review({ totals: { net_cents: 100, vat_cents: 19, gross_cents: 0 } })).toThrow();
  });

  it("produces only balanced draft entries", () => {
    const cases: Partial<AccountingInput>[] = [{}, { document_type: "credit_note" }, { buyer: { country: "CY", vat_registered: false } }, { supplier: { name: "X GmbH", vat_number: "DE1" }, totals: { net_cents: 100_000, vat_cents: 0, gross_cents: 100_000 }, lines: [{ description: "Software", net_cents: 100_000 }] }];
    for (const changes of cases) expect(balanced(review(changes))).toBe(true);
  });

  describe("buyer details gate the Cyprus treatment", () => {
    const arithmeticOnly = (result: AccountingReview) => [result.treatment.code, result.journal, result.findings.filter((finding) => ["INPUT_VAT_RECOVERABILITY", "EU_REVERSE_CHARGE", "POSSIBLE_DOMESTIC_REVERSE_CHARGE", "ZERO_RATED_OR_EXEMPT", "NON_EUR_CURRENCY", "CREDIT_NOTE", "BUYER_NOT_VAT_REGISTERED"].includes(finding.code))];
    it("asks for missing buyer details instead of assuming a VAT-registered Cyprus buyer", () => {
      const none = review({ buyer: undefined });
      expect(arithmeticOnly(none)).toEqual(["not_assessed", null, []]);
      expect(none.findings.find((finding) => finding.code === "BUYER_DETAILS_MISSING")!.message).toContain("country and VAT registration status");
      expect(none.journal_unavailable_reason).toBe("The buyer's country and VAT registration status are needed to draft an entry.");
      expect(review({ buyer: { country: "CY" } }).findings.find((finding) => finding.code === "BUYER_DETAILS_MISSING")!.message).toContain("Enter the buyer's VAT registration status.");
      expect(review({ buyer: { vat_registered: true } }).findings.find((finding) => finding.code === "BUYER_DETAILS_MISSING")!.message).toContain("Enter the buyer's country.");
      // Categories are accounting suggestions, not Cyprus tax treatment, so they stay.
      expect(none.category.id).toBe("office_expenses");
    });
    it("keeps the arithmetic checks when buyer details are missing", () => {
      const wrong = review({ buyer: undefined, totals: { net_cents: 100_000, vat_cents: 19_000, gross_cents: 120_000 } });
      expect([wrong.status, wrong.findings.map((finding) => finding.code)]).toEqual(["errors_found", ["GROSS_MISMATCH", "BUYER_DETAILS_MISSING"]]);
      const badLine = review({ buyer: {}, lines: [{ description: "Toner", quantity: "10", unit_price_cents: 10_000, net_cents: 100_000, vat_rate: "19", vat_cents: 18_000 }] });
      expect(badLine.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["LINE_VAT_MISMATCH", "BUYER_DETAILS_MISSING"]));
    });
    it("reports a buyer outside Cyprus as out of scope, with no Cyprus reverse charge", () => {
      const greek = review({ buyer: { country: "GR", vat_registered: true }, supplier: { name: "X GmbH", vat_number: "DE123456789" }, totals: { net_cents: 50_000, vat_cents: 0, gross_cents: 50_000 }, lines: [{ description: "Software licence", net_cents: 50_000 }] });
      expect(arithmeticOnly(greek)).toEqual(["not_assessed", null, []]);
      expect(greek.findings.map((finding) => finding.code)).toEqual(["BUYER_OUTSIDE_SCOPE"]);
      expect(greek.journal_unavailable_reason).toBe("Cyprus entries are not drafted for a buyer outside Cyprus.");
      // The buyer's EU VAT number alone places it outside Cyprus too.
      expect(review({ buyer: { vat_number: "EL123456789", vat_registered: true } }).findings.map((finding) => finding.code)).toContain("BUYER_OUTSIDE_SCOPE");
    });
    it("keeps the existing behaviour for registered and unregistered Cyprus buyers", () => {
      const registered = review({ buyer: { country: "CY", vat_registered: true } });
      expect([registered.treatment.code, registered.findings.map((finding) => finding.code), registered.journal!.lines[1].account]).toEqual(["domestic", ["INPUT_VAT_RECOVERABILITY"], "Input VAT (recoverability to confirm)"]);
      const unregistered = review({ buyer: { country: "CY", vat_registered: false } });
      expect([unregistered.treatment.code, unregistered.findings.map((finding) => finding.code), unregistered.journal!.lines.map((line) => [line.account, line.debit_cents, line.credit_cents])]).toEqual(["domestic", ["BUYER_NOT_VAT_REGISTERED"], [["Office expenses", 119_000, 0], ["Accounts payable – Aegean Supplies Synthetic Ltd", 0, 119_000]]]);
      // A Cyprus VAT number places the buyer in Cyprus; the registration status is still asked for, not inferred.
      expect(review({ buyer: { vat_number: "CY99999999L" } }).findings.map((finding) => finding.code)).toContain("BUYER_DETAILS_MISSING");
    });
  });
});
