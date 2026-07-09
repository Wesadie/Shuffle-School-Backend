import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function getSupabaseSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getSupabaseAccessToken(): Promise<string | undefined> {
  const session = await getSupabaseSession();
  return session?.access_token;
}
