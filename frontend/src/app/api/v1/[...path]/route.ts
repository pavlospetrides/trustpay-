import { sourceText } from "../../../../lib/i18n/core";
import { apiContext } from "@/lib/server/api/runtime";
import { handleApiRequest } from "@/lib/server/api/handler";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function run(request: Request, context: Context): Promise<Response> {
  try { return await handleApiRequest(request, ["v1", ...(await context.params).path], apiContext()); }
  catch { return Response.json({ detail: sourceText("backend-configuration-unavailable") }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
}
export const GET = run;
export const POST = run;
export const PATCH = run;
