import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
let browserClient: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!authConfigured) throw new Error("Supabase Auth is not configured");
  if (!browserClient) browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  return browserClient;
}

export const organizationStorageKey = "trustpay.organizationId";
