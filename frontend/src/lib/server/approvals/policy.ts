export interface Principal { userId: string; organizationId: string; role: string }
export interface TransitionRow { status: string; score: number; verifiedBy: string | null; createdBy: string | null }
export type TransitionAction = "verify" | "approve" | "hold" | "release" | "reject";
export const TRANSITION_ACTIONS: readonly TransitionAction[] = ["verify", "approve", "hold", "release", "reject"];

export function authorizeTransition(principal: Principal, action: TransitionAction, row: TransitionRow): void {
  const roles: Record<TransitionAction, string[]> = {
    verify: ["owner", "admin", "analyst"],
    approve: ["owner", "admin", "approver"],
    hold: ["owner", "admin", "analyst"],
    release: ["owner", "admin", "analyst"],
    reject: ["owner", "admin", "analyst", "approver"],
  };
  if (!roles[action].includes(principal.role)) throw new Error("Role is not authorized for this action");
  if (row.status === "rejected") throw new Error("Rejected invoices are final");
  if (action === "verify") {
    if (["approved", "blocked"].includes(row.status) || row.verifiedBy) throw new Error("Invoice cannot be verified in its current state");
    if (row.createdBy === principal.userId) throw new Error("Invoice creator cannot independently verify it");
  } else if (action === "approve") {
    if (row.status !== "ready") throw new Error("Invoice is not ready for approval");
    if (row.score >= 40 && !row.verifiedBy) throw new Error("Risky invoice needs independent verification");
    if (row.verifiedBy === principal.userId || row.createdBy === principal.userId) throw new Error("Maker-checker separation failed");
  } else if (action === "release") {
    if (row.status !== "hold") throw new Error("Invoice cannot be released because it is not on hold");
    if (row.createdBy === principal.userId) throw new Error("Maker-checker separation failed");
  } else if (action === "hold" && ["approved", "blocked"].includes(row.status)) {
    throw new Error("Invoice cannot be placed on hold");
  }
  // reject: allowed from every other state, including approved, so an approval can be withdrawn before payment.
}

/** Where a released hold goes: a verified or low-risk invoice is ready again; anything else goes back to review. */
export const releasedStatus = (row: TransitionRow): "ready" | "needs_review" => row.verifiedBy || row.score < 40 ? "ready" : "needs_review";
