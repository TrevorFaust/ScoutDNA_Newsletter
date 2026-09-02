/**
 * Reddit draft-only publisher.
 * Never calls /api/submit — only /api/v1/draft.
 */

type RedditToken = { access_token: string; token_type: string };

export type RedditDraftResult = {
  teamSlug: string;
  teamName: string;
  subreddit: string;
  ok: boolean;
  draftId?: string;
  error?: string;
  skipped?: boolean;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function userAgent(): string {
  return (
    process.env.REDDIT_USER_AGENT?.trim() ||
    "DraftDNA-Newsletter/1.0 (draft export; contact: local)"
  );
}

async function getAccessToken(): Promise<RedditToken> {
  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const refresh = process.env.REDDIT_REFRESH_TOKEN?.trim();
  const body = refresh
    ? new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
      })
    : new URLSearchParams({
        grant_type: "password",
        username: requireEnv("REDDIT_USERNAME"),
        password: requireEnv("REDDIT_PASSWORD"),
      });

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(),
    },
    body,
  });

  const json = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Reddit auth failed (${res.status}): ${json.error || json.message || res.statusText}`
    );
  }

  return {
    access_token: json.access_token,
    token_type: json.token_type || "bearer",
  };
}

async function resolveSubredditFullname(
  token: RedditToken,
  subreddit: string
): Promise<string> {
  const name = subreddit.replace(/^r\//i, "").trim();
  const res = await fetch(
    `https://oauth.reddit.com/r/${encodeURIComponent(name)}/about`,
    {
      headers: {
        Authorization: `${token.token_type} ${token.access_token}`,
        "User-Agent": userAgent(),
      },
    }
  );
  const json = (await res.json()) as {
    data?: { name?: string; id?: string };
    error?: number;
    message?: string;
  };
  if (!res.ok || !json.data?.name) {
    throw new Error(
      `Could not resolve r/${name}: ${json.message || res.statusText}`
    );
  }
  // about returns id without t5_ prefix sometimes as "name" = display, and "id" = base36
  const id = json.data.id;
  if (id?.startsWith("t5_")) return id;
  if (id) return `t5_${id}`;
  throw new Error(`No subreddit id for r/${name}`);
}

async function createDraft(
  token: RedditToken,
  input: { subredditFullname: string; title: string; body: string }
): Promise<string> {
  const form = new URLSearchParams({
    kind: "markdown",
    subreddit: input.subredditFullname,
    title: input.title.slice(0, 300),
    body: input.body,
    send_replies: "true",
    nsfw: "false",
    spoiler: "false",
    original_content: "false",
    is_public_link: "false",
  });

  const res = await fetch("https://oauth.reddit.com/api/v1/draft", {
    method: "POST",
    headers: {
      Authorization: `${token.token_type} ${token.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(),
    },
    body: form,
  });

  const text = await res.text();
  let json: { id?: string; json?: { data?: { id?: string }; errors?: unknown[] } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Reddit draft non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  const id = json.id || json.json?.data?.id;
  if (!res.ok || !id) {
    throw new Error(
      `Reddit draft failed (${res.status}): ${text.slice(0, 400)}`
    );
  }
  return String(id);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function redditDraftsConfigured(): boolean {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
    return false;
  }
  if (process.env.REDDIT_REFRESH_TOKEN?.trim()) return true;
  return Boolean(
    process.env.REDDIT_USERNAME?.trim() && process.env.REDDIT_PASSWORD?.trim()
  );
}

export async function createRedditTeamDrafts(
  posts: Array<{
    teamSlug: string;
    teamName: string;
    subreddit: string | null | undefined;
    title: string;
    body: string;
  }>
): Promise<RedditDraftResult[]> {
  const token = await getAccessToken();
  const results: RedditDraftResult[] = [];

  for (const post of posts) {
    const sub = post.subreddit?.trim();
    if (!sub) {
      results.push({
        teamSlug: post.teamSlug,
        teamName: post.teamName,
        subreddit: "",
        ok: false,
        skipped: true,
        error: "No reddit_subreddit mapped for team",
      });
      continue;
    }

    try {
      const fullname = await resolveSubredditFullname(token, sub);
      const draftId = await createDraft(token, {
        subredditFullname: fullname,
        title: post.title,
        body: post.body,
      });
      results.push({
        teamSlug: post.teamSlug,
        teamName: post.teamName,
        subreddit: sub,
        ok: true,
        draftId,
      });
    } catch (err) {
      results.push({
        teamSlug: post.teamSlug,
        teamName: post.teamName,
        subreddit: sub,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Stay under Reddit rate limits when creating ~32 drafts
    await sleep(800);
  }

  return results;
}
