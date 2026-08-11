"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import ThemeToggle from "@/components/ThemeToggle";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setIsSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("Couldn't start sign-in — try again");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6 text-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/40">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          >
            <path d="M12 21s-7-5.686-7-11a7 7 0 1 1 14 0c0 5.314-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Location Timeline
        </h1>
        <p className="text-sm text-faint">Sign in to continue</p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={isSubmitting}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface-recessed px-6 py-3 text-sm font-medium text-text transition hover:border-accent disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.1-5.1l-6.5-5.5c-2 1.4-4.7 2.3-7.6 2.3-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5C39.9 37 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
        </svg>
        Continue with Google
      </button>

      {(error || authError) && (
        <p className="text-sm text-danger">
          {error ?? "Couldn't sign you in — try again"}
        </p>
      )}

      <p className="max-w-xs text-center text-xs text-faint">
        This gates access to personal location history. Once signed in, you
        can only ever see your own location history — never anyone else&apos;s.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
