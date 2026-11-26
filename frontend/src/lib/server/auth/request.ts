import { sourceText } from "../../i18n/core";
import type { Principal } from "../approvals/policy";
import { selectPrincipal, type Membership } from "./principal";

export interface AuthDependencies {
  verifyToken(token: string): Promise<string>;
  memberships(userId: string): Promise<Membership[]>;
}

export async function authenticateRequest(request: Request, dependencies: AuthDependencies): Promise<Principal> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim()) throw new Error(sourceText("authentication-required"));
  const userId = await dependencies.verifyToken(authorization.slice(7).trim());
  return selectPrincipal(userId, request.headers.get("X-Organization-Id"), await dependencies.memberships(userId));
}
