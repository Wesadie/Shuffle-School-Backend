import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";

type AuthUser = Partial<User> & {
  id: string;
  email?: string | null;
  accountContext?: {
    accountId: string;
    accountStatus: string;
    workspaceMode: "demo" | "live";
  };
};

export function useAuth() {
  const [sessionReady, setSessionReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setSessionReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const { data: user, isLoading: userLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: sessionReady,
  });

  return {
    user,
    supabaseSession: session,
    isLoading: !sessionReady || userLoading,
    isAuthenticated: !!user,
  };
}
