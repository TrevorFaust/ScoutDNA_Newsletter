"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

type Mode = "signin" | "signup";

type Props = {
  mode: Mode;
  next?: string;
};

function safeNext(next?: string) {
  return next && next.startsWith("/") ? next : "/";
}

export function AuthForm({ mode, next }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createBrowserClient();
    const dest = safeNext(next);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
        },
      });
      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        router.push("/welcome");
        router.refresh();
        return;
      }
      setMessage("Check your email to confirm the account, then sign in.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push(dest);
    router.refresh();
  }

  async function onMagicLink() {
    if (!email) {
      setMessage("Enter your email first.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createBrowserClient();
    const dest = mode === "signup" ? "/welcome" : safeNext(next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
      },
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your email for a sign-in link.");
  }

  return (
    <div className="auth-panel">
      <form onSubmit={onPassword}>
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        className="btn btn-secondary auth-magic"
        onClick={onMagicLink}
        disabled={busy}
      >
        Email me a sign-in link
      </button>
      {message ? <p className="auth-message">{message}</p> : null}
    </div>
  );
}
