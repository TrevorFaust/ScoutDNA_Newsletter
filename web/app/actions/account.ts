"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getTeams } from "@/lib/teams";

async function syncSubscriber(
  email: string,
  favoriteTeamSlug: string | null,
  opts?: { frequency?: "weekly"; unsubscribedAt?: string | null }
) {
  const sb = createServerClient();
  const { data: existing } = await sb
    .from("newsletter_subscribers")
    .select("frequency, unsubscribed_at")
    .eq("email", email)
    .maybeSingle();

  await sb.from("newsletter_subscribers").upsert(
    {
      email,
      favorite_team_slug: favoriteTeamSlug,
      frequency: opts?.frequency ?? existing?.frequency ?? "weekly",
      unsubscribed_at:
        opts && "unsubscribedAt" in opts
          ? opts.unsubscribedAt
          : existing?.unsubscribed_at ?? null,
    },
    { onConflict: "email" }
  );
}

export async function saveFavoriteTeam(slug: string, next = "/") {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/signin?next=${encodeURIComponent("/welcome")}`);
  }

  const team = getTeams().find((t) => t.slug === slug);
  if (!team) {
    return { error: "Pick a team from the list." };
  }

  const sb = createServerClient();
  const { error } = await sb
    .from("newsletter_profiles")
    .update({ favorite_team_slug: slug, email: viewer.email })
    .eq("id", viewer.id);

  if (error) {
    return { error: error.message };
  }

  await syncSubscriber(viewer.email, slug);

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/");
}

export async function saveEmailPreferences(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/signin?next=${encodeURIComponent("/preferences")}`);
  }

  const choice = String(formData.get("frequency") || "");
  const subscribed = choice === "weekly";

  await syncSubscriber(viewer.email, viewer.favoriteTeamSlug, {
    frequency: "weekly",
    unsubscribedAt: subscribed ? null : new Date().toISOString(),
  });

  revalidatePath("/preferences");
  redirect("/preferences?saved=email");
}
