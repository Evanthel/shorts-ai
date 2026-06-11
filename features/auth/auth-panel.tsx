"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthPanelProps = {
  onUserChange: (user: User | null) => void;
};

export function AuthPanel({ onUserChange }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState(
    isSupabaseConfigured()
      ? "Sign in to save feedback and history."
      : "Supabase is not configured.",
  );
  const isMagicLinkSent = status.startsWith("Magic link sent");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createBrowserSupabaseClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      onUserChange(data.user);
      setStatus(
        data.user
          ? "Signed in. Feedback will update your profile."
          : "Sign in to save feedback and history.",
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      onUserChange(nextUser);
      setStatus(
        nextUser
          ? "Signed in. Feedback will update your profile."
          : "Sign in to save feedback and history.",
      );
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onUserChange]);

  async function sendMagicLink() {
    if (!isSupabaseConfigured()) {
      setStatus("Supabase is not configured.");
      return;
    }

    if (!email.trim()) {
      setStatus("Enter an email address first.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setStatus(error ? error.message : "Magic link sent. Check your email.");
  }

  async function signOut() {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
  }

  return (
    <aside className="auth-panel">
      <p className="panel-label">Account</p>
      {user ? (
        <>
          <h3>Profile is active.</h3>
          <p>{maskEmail(user.email)}</p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <h3>Save your comfort profile.</h3>
          <div className="auth-row">
            <input
              aria-label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="button" onClick={sendMagicLink}>
              Send magic link
            </button>
          </div>
        </>
      )}
      <p
        key={status}
        className={isMagicLinkSent ? "auth-status success" : "auth-status"}
      >
        {status}
      </p>
    </aside>
  );
}

function maskEmail(email?: string) {
  if (!email) {
    return "Signed in";
  }

  const [localPart, domain] = email.split("@");

  if (!domain) {
    return "***";
  }

  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  const [domainName, ...domainRest] = domain.split(".");
  const visibleDomain = domainName.slice(0, Math.min(2, domainName.length));
  const suffix = domainRest.length > 0 ? `.${domainRest.join(".")}` : "";

  return `${visibleLocal}***@${visibleDomain}***${suffix}`;
}
