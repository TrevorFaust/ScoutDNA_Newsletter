import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createUserClient } from "@/lib/supabaseUser";

export type Viewer = {
  id: string;
  email: string;
  isAdmin: boolean;
  favoriteTeamSlug: string | null;
};

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email) return null;

  const admin = isAdminEmail(user.email);
  const sb = createServerClient();
  const { data: existing } = await sb
    .from("newsletter_profiles")
    .select("favorite_team_slug, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    await sb.from("newsletter_profiles").insert({
      id: user.id,
      email: user.email,
      role: admin ? "admin" : "reader",
    });
    return {
      id: user.id,
      email: user.email,
      isAdmin: admin,
      favoriteTeamSlug: null,
    };
  }

  if (admin && existing.role !== "admin") {
    await sb
      .from("newsletter_profiles")
      .update({ role: "admin", email: user.email })
      .eq("id", user.id);
  }

  return {
    id: user.id,
    email: user.email,
    isAdmin: admin || existing.role === "admin",
    favoriteTeamSlug: existing.favorite_team_slug ?? null,
  };
});

export async function requireAdmin(nextPath = "/admin"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  }
  if (!viewer.isAdmin) {
    redirect("/?denied=1");
  }
  return viewer;
}

export async function requireAdminApi(): Promise<
  { ok: true; viewer: Viewer } | { ok: false; response: NextResponse }
> {
  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  if (!viewer.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Writer access only" }, { status: 403 }),
    };
  }
  return { ok: true, viewer };
}

export function issueTeamHref(slug: string, teamSlug?: string | null) {
  return teamSlug ? `/issue/${slug}?team=${teamSlug}` : `/issue/${slug}`;
}
