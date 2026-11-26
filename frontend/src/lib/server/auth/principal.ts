import { sourceText } from "../../i18n/core";
import type { Principal } from "../approvals/policy";

export interface Membership { organizationId: string; role: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function selectPrincipal(userId: string, requestedOrg: string | null, memberships: Membership[]): Principal {
  if (requestedOrg && !UUID.test(requestedOrg)) throw new Error(sourceText("invalid-organization-id"));
  if (!memberships.length) throw new Error(sourceText("no-organization-membership"));
  if (!requestedOrg && memberships.length !== 1) throw new Error(sourceText("x-organization-id-is-required-for-users-in"));
  const chosen = memberships.find((item) => item.organizationId === (requestedOrg ?? memberships[0].organizationId));
  if (!chosen) throw new Error(sourceText("no-membership-in-requested-organization"));
  return { userId, organizationId: chosen.organizationId, role: chosen.role };
}
