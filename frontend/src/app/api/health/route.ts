import { sourceText } from "../../../lib/i18n/core";
import { apiContext } from "@/lib/server/api/runtime";
import { handleApiRequest } from "@/lib/server/api/handler";

export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  try { return await handleApiRequest(request, ["health"], apiContext()); }
  catch { return Response.json({ detail: sourceText("backend-configuration-unavailable") }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
}
