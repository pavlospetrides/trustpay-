import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type UserClient = { auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifiedUserId(token: string, client: UserClient): Promise<string> {
  let result: Awaited<ReturnType<UserClient["auth"]["getUser"]>>;
  try { result = await client.auth.getUser(token); }
  catch { throw new Error("Authentication service unavailable"); }
  if (result.error) throw new Error("Invalid or expired access token");
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
