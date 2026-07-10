import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoImage from "@assets/ChatGPT_Image_Dec_8,_2025,_01_03_50_PM_1765191843507.png";

/**
 * Cross-domain auth handoff page.
 *
 * Lovable redirects here with ?code=<single-use-code>.
 * This page exchanges the code for Supabase tokens and establishes
 * a browser session on the Render domain via supabase.auth.setSession().
 */
export default function AuthHandoffPage() {
  const exchanged = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setError("Missing handoff code. Please return to the sign-up page and try again.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          setError("This sign-in link has expired or already been used. Please return to the sign-up page and try again.");
          return;
        }

        const { access_token, refresh_token } = await res.json();

        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          setError("Failed to establish your session. Please return to the sign-up page and try again.");
          return;
        }

        // Session is now in localStorage on this domain.
        // Full page reload ensures clean state — no race with auth listeners.
        window.location.href = "/dashboard";
      } catch {
        setError("An unexpected error occurred. Please return to the sign-up page and try again.");
      }
    })();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
      <img src={logoImage} alt="ShuffleSchool" className="h-12 w-12 rounded-lg object-contain" />
      {error ? (
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive text-sm">{error}</p>
          <a
            href="/"
            className="inline-block text-sm text-primary underline underline-offset-4"
          >
            Go to home page
          </a>
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">Signing you in…</div>
      )}
    </div>
  );
}
