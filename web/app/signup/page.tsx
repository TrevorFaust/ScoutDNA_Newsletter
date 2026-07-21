"use client";

import { useState } from "react";
import teamsData from "../../../data/teams.json";
import { createBrowserClient } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createBrowserClient();
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email,
      favorite_team_slug: team || null,
      frequency,
    });
    setMessage(error ? error.message : "Subscribed! Check your inbox when email is enabled.");
  }

  return (
    <main>
      <h1>Subscribe</h1>
      <p style={{ color: "var(--muted)" }}>
        Email delivery is Phase 2 (Resend). Your preferences are saved now.
      </p>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Favorite team (optional)</label>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Top of newsletter</option>
          {(teamsData as { slug: string; name: string }[]).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <label>Frequency</label>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly (Monday)</option>
          <option value="both">Both</option>
        </select>
        <button type="submit" className="btn">
          Save preferences
        </button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
