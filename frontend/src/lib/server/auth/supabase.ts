import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type UserResult = { data: { user: { id: string } | null }; error: { message: string; status?: number } | null };
type UserClient = { auth: { getUser(token: string): Promise<UserResult> } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// As the Python backend did: only 401/403 from Supabase mean a bad token; an outage, a 5xx or any other error is a 503.
export async function verifiedUserId(token: string, client: UserClient): Promise<string> {
  const ask = () => client.auth.getUser(token).catch(() => null);
  const outage = (result: UserResult | null) => !result || (result.error !== null && !(result.error.status && result.error.status < 500));
  let result = await ask();
  // One retry: a single slow or dropped call to Supabase should not fail the request.
  if (outage(result)) result = await ask();
  if (!result) throw new Error("Authentication service unavailable");
  if (result.error) throw new Error(result.error.status === 401 || result.error.status === 403 ? "Invalid or expired access token" : "Authentication service unavailable");
  if (!result.data.user || !UUID.test(result.data.user.id)) throw new Error("Authentication service returned an invalid identity");
  return result.data.user.id;
}

let client: SupabaseClient | null = null;
export function supabaseAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase authentication is not configured");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new Error("SUPABASE_URL must use HTTPS except local development");
  return client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
