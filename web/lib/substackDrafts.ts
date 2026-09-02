/**
 * Substack draft-only publisher (undocumented session API).
 * Creates / updates drafts only — never calls publish or send endpoints.
 */

export type SubstackDraftResult = {
  ok: boolean;
  draftId?: string | number;
  draftUrl?: string;
  error?: string;
};

type DraftByline = {
  id: number;
  publicationUserId?: number;
  is_guest?: boolean;
};

function publicationBase(): string {
  const raw =
    process.env.SUBSTACK_PUBLICATION_URL?.trim() ||
    "https://trevorfaust.substack.com";
  return raw.replace(/\/$/, "").replace(/\/publish.*$/, "");
}

function publicationSubdomain(base: string): string {
  try {
    const host = new URL(base).hostname; // trevorfaust.substack.com
    return host.replace(/\.substack\.com$/i, "").toLowerCase();
  } catch {
    return "trevorfaust";
  }
}

function sessionCookie(): string {
  const sid =
    process.env.SUBSTACK_CONNECT_SID?.trim() ||
    process.env.SUBSTACK_SID?.trim();
  if (!sid) {
    throw new Error(
      "Missing SUBSTACK_CONNECT_SID (or SUBSTACK_SID) — paste substack.sid from browser cookies"
    );
  }
  // Allow pasting "connect.sid=..." / "substack.sid=..." or bare value
  const value = sid.includes("=") ? sid.split("=").slice(1).join("=") : sid;
  return `connect.sid=${value}; substack.sid=${value}`;
}

function headers(): HeadersInit {
  return {
    Cookie: sessionCookie(),
    "Content-Type": "application/json",
    "User-Agent":
      process.env.SUBSTACK_USER_AGENT?.trim() ||
      "Mozilla/5.0 (compatible; DraftDNA-Newsletter/1.0)",
  };
}

export function substackDraftsConfigured(): boolean {
  return Boolean(
    process.env.SUBSTACK_CONNECT_SID?.trim() || process.env.SUBSTACK_SID?.trim()
  );
}

async function resolveDraftBylines(base: string): Promise<DraftByline[]> {
  const envUser = Number(process.env.SUBSTACK_USER_ID || "");
  const envPubUser = Number(process.env.SUBSTACK_PUBLICATION_USER_ID || "");
  if (Number.isFinite(envUser) && envUser > 0) {
    const byline: DraftByline = { id: envUser, is_guest: false };
    if (Number.isFinite(envPubUser) && envPubUser > 0) {
      byline.publicationUserId = envPubUser;
    }
    return [byline];
  }

  const subdomain = publicationSubdomain(base);
  const profileUrls = [
    `${base}/api/v1/user/profile/self`,
    "https://substack.com/api/v1/user/profile/self",
  ];

  let lastError = "profile/self failed";
  for (const url of profileUrls) {
    const res = await fetch(url, { headers: headers() });
    const text = await res.text();
    if (!res.ok) {
      lastError = `profile/self ${res.status}: ${text.slice(0, 200)}`;
      continue;
    }
    let profile: {
      id?: number;
      publicationUsers?: Array<{
        id?: number;
        user_id?: number;
        publication?: { subdomain?: string };
      }>;
    };
    try {
      profile = JSON.parse(text);
    } catch {
      lastError = `profile/self non-JSON: ${text.slice(0, 200)}`;
      continue;
    }

    const userId = profile.id;
    if (!userId) {
      lastError = "profile/self missing user id";
      continue;
    }

    const pubs = profile.publicationUsers ?? [];
    const match =
      pubs.find(
        (p) => p.publication?.subdomain?.toLowerCase() === subdomain
      ) ?? pubs[0];

    const byline: DraftByline = { id: userId, is_guest: false };
    if (match?.id) byline.publicationUserId = match.id;
    return [byline];
  }

  throw new Error(
    `Could not resolve Substack draft_bylines (${lastError}). Set SUBSTACK_USER_ID (and optionally SUBSTACK_PUBLICATION_USER_ID).`
  );
}

export async function createSubstackDraft(input: {
  title: string;
  subtitle?: string;
  /** Stringified ProseMirror doc (preferred) or legacy HTML. */
  body: string;
}): Promise<SubstackDraftResult> {
  const base = publicationBase();

  try {
    const draft_bylines = await resolveDraftBylines(base);

    const createRes = await fetch(`${base}/api/v1/drafts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        draft_title: input.title,
        draft_subtitle: input.subtitle || "",
        type: "newsletter",
        draft_bylines,
      }),
    });

    const createdText = await createRes.text();
    let created: { id?: string | number; draft_id?: string | number };
    try {
      created = JSON.parse(createdText);
    } catch {
      return {
        ok: false,
        error: `Substack create non-JSON (${createRes.status}): ${createdText.slice(0, 200)}`,
      };
    }

    const draftId = created.id ?? created.draft_id;
    if (!createRes.ok || draftId == null) {
      return {
        ok: false,
        error: `Substack create failed (${createRes.status}): ${createdText.slice(0, 400)}`,
      };
    }

    const updateRes = await fetch(`${base}/api/v1/drafts/${draftId}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        draft_title: input.title,
        draft_subtitle: input.subtitle || "",
        draft_body: input.body,
        draft_bylines,
      }),
    });

    if (!updateRes.ok) {
      const updateText = await updateRes.text();
      return {
        ok: false,
        draftId,
        error: `Substack draft created but body update failed (${updateRes.status}): ${updateText.slice(0, 400)}`,
      };
    }

    return {
      ok: true,
      draftId,
      draftUrl: `${base}/publish/post/${draftId}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
