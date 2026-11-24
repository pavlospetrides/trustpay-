export interface Principal { userId: string; organizationId: string; role: string }
export interface TransitionRow { status: string; score: number; verifiedBy: string | null; createdBy: string | null }
export type TransitionAction = "verify" | "approve" | "hold";

export function authorizeTransition(principal: Principal, action: TransitionAction, row: TransitionRow): void {
  const roles: Record<TransitionAction, string[]> = {
    verify: ["owner", "admin", "analyst"],
    approve: ["owner", "admin", "approver"],
    hold: ["owner", "admin", "analyst"],
  };
  if (!roles[action].includes(principal.role)) throw new Error("Role is not authorized for this action");
  if (action === "verify") {
    if (["approved", "blocked"].includes(row.status) || row.verifiedBy) throw new Error("Invoice cannot be verified in its current state");
    if (row.createdBy === principal.userId) throw new Error("Invoice creator cannot independently verify it");
  } else if (action === "approve") {
    if (row.status !== "ready") throw new Error("Invoice is not ready for approval");
    if (row.score >= 40 && !row.verifiedBy) throw new Error("Risky invoice needs independent verification");
    if (row.verifiedBy === principal.userId || row.createdBy === principal.userId) throw new Error("Maker-checker separation failed");
  } else if (["approved", "blocked"].includes(row.status)) {
    throw new Error("Invoice cannot be placed on hold");
  }
}
