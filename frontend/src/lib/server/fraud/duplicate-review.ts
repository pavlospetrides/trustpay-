/**
 * Duplicate review for invoice numbers that match another record only after normalisation (review item 6).
 *
 * Exact copies stay hard blocks. A normalisation-only match ("AS-2026-0114" vs "AS2026114") may be the same invoice or
 * two genuinely different ones, so an authorized reviewer must record an explicit decision against each matching record:
 * "distinct" (different invoices; approval may proceed) or "duplicate" (the same invoice; this one stays blocked).
 * A general verification note does not clear the match. Both stores apply this same rule at approval time.
 */
import { exactInvoiceNumber, sameInvoiceNumber } from "./risk";

/** Another record of the same supplier: an invoice (by its public ID) or a paid history record. */
export interface DuplicateCandidate { kind: "invoice" | "payment"; id: string; invoiceNumber: string; status: string }
export type DuplicateDecisionValue = "distinct" | "duplicate";
export interface DuplicateDecision { kind: "invoice" | "payment"; id: string; decision: DuplicateDecisionValue; decidedBy: string; reason: string; decidedAt: string }

/** Invoice statuses that still count as live copies. Rejected invoices and blocked copies do not. */
export const LIVE_INVOICE_STATUSES = ["ready", "needs_review", "hold", "approved"] as const;

const exactSame = (left: string, right: string) => exactInvoiceNumber(left) === exactInvoiceNumber(right);

/** Records that match only after normalisation: these need a duplicate review. Exact copies are the hard-block rules' job. */
export function normalisationMatches(invoiceNumber: string, candidates: readonly DuplicateCandidate[]): DuplicateCandidate[] {
  return candidates.filter((candidate) => sameInvoiceNumber(invoiceNumber, candidate.invoiceNumber) && !exactSame(invoiceNumber, candidate.invoiceNumber));
}

const decisionFor = (candidate: DuplicateCandidate, decisions: readonly DuplicateDecision[]) =>
  decisions.find((decision) => decision.kind === candidate.kind && decision.id === candidate.id);

/** The matches with their recorded decisions, for display and for the review endpoint. */
export function duplicateReviewState(invoiceNumber: string, candidates: readonly DuplicateCandidate[], decisions: readonly DuplicateDecision[]) {
  return normalisationMatches(invoiceNumber, candidates).map((candidate) => {
    const decision = decisionFor(candidate, decisions);
    return { kind: candidate.kind, id: candidate.kind === "invoice" ? candidate.id : null, invoice_number: candidate.invoiceNumber, status: candidate.status, decision: decision?.decision ?? null, decided_by: decision?.decidedBy ?? null, reason: decision?.reason ?? null, decided_at: decision?.decidedAt ?? null };
  });
}

/**
 * Approval-time duplicate check, run inside the approval transaction under the supplier lock.
 * - An exact copy that is already approved or paid blocks approval.
 * - Every normalisation-only match needs a recorded "distinct" decision; none, or "duplicate", blocks approval.
 * - The person who confirmed "distinct" cannot also approve.
 */
export function assertApprovableAgainstDuplicates(invoiceNumber: string, candidates: readonly DuplicateCandidate[], decisions: readonly DuplicateDecision[], approver: string): void {
  for (const candidate of candidates) {
    if (!sameInvoiceNumber(invoiceNumber, candidate.invoiceNumber)) continue;
    if (exactSame(invoiceNumber, candidate.invoiceNumber)) {
      if (candidate.kind === "payment") throw new Error("Invoice cannot be approved because this supplier invoice number is already paid");
      if (candidate.status === "approved") throw new Error("Invoice cannot be approved because another copy is already approved");
      continue;
    }
    const decision = decisionFor(candidate, decisions);
    const label = `"${candidate.invoiceNumber}" (${candidate.kind === "payment" ? "paid" : candidate.status})`;
    if (!decision) throw new Error(`Invoice cannot be approved: it may duplicate ${label}. An authorized reviewer must record a duplicate review confirming they are different invoices`);
    if (decision.decision === "duplicate") throw new Error(`Invoice cannot be approved: a reviewer confirmed it duplicates ${label}`);
    if (decision.decidedBy === approver) throw new Error("Maker-checker separation failed: the person who confirmed the invoices are distinct cannot approve");
  }
}
