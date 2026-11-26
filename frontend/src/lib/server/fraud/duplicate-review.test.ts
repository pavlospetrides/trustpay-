import { describe, expect, it } from "vitest";
import { assertApprovableAgainstDuplicates, duplicateReviewState, normalisationMatches, type DuplicateCandidate, type DuplicateDecision } from "./duplicate-review";

const approved: DuplicateCandidate = { kind: "invoice", id: "INV-1", invoiceNumber: "AS-2026-114", status: "approved" };
const open: DuplicateCandidate = { kind: "invoice", id: "INV-2", invoiceNumber: "AS-2026-200", status: "needs_review" };
const paid: DuplicateCandidate = { kind: "payment", id: "p-1", invoiceNumber: "AS-HIST-001", status: "paid" };
const decision = (candidate: DuplicateCandidate, value: "distinct" | "duplicate", decidedBy = "reviewer"): DuplicateDecision => ({ kind: candidate.kind, id: candidate.id, decision: value, decidedBy, reason: "Supplier confirmed by phone", decidedAt: "2026-11-26T10:00:00Z" });
const approve = (number: string, decisions: DuplicateDecision[] = [], approver = "approver") => () => assertApprovableAgainstDuplicates(number, [approved, open, paid], decisions, approver);

describe("duplicate review policy", () => {
  it("separates normalisation-only matches from exact copies", () => {
    expect(normalisationMatches("as2026114", [approved, open, paid]).map((item) => item.id)).toEqual(["INV-1"]);
    expect(normalisationMatches("AS-2026-114", [approved, open, paid])).toEqual([]);
    expect(duplicateReviewState("AS HIST 1", [approved, paid], [decision(paid, "distinct")])).toEqual([{ kind: "payment", id: null, invoice_number: "AS-HIST-001", status: "paid", decision: "distinct", decided_by: "reviewer", reason: "Supplier confirmed by phone", decided_at: "2026-11-26T10:00:00Z" }]);
  });
  it("blocks exact approved or paid copies whatever was reviewed", () => {
    expect(approve("as-2026-114", [decision(approved, "distinct")])).toThrow("already approved");
    expect(approve("AS-HIST-001")).toThrow("already paid");
    expect(approve("AS-2026-200")).not.toThrow(); // an exact open copy is caught at assessment, not here (legacy rows: first approval wins)
  });
  it("requires an explicit distinct decision for every normalisation-only match", () => {
    expect(approve("AS 2026 0114")).toThrow("must record a duplicate review");
    expect(approve("AS 2026 0114", [decision(approved, "duplicate")])).toThrow("confirmed it duplicates");
    expect(approve("AS 2026 0114", [decision(approved, "distinct")])).not.toThrow();
    expect(approve("as hist 0001")).toThrow('"AS-HIST-001" (paid)');
    expect(approve("as 2026 200")).toThrow('"AS-2026-200" (needs_review)');
  });
  it("does not let the person who confirmed 'distinct' approve", () => {
    expect(approve("AS 2026 0114", [decision(approved, "distinct", "approver")])).toThrow("Maker-checker");
  });
  it("ignores unrelated numbers", () => {
    expect(approve("AS-2026-999")).not.toThrow();
  });
});
