import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  rumorSourceMarkdown,
  stripReviewMetaFromTalk,
  stripRumorFromTalk,
} from "@/lib/rumorTalk";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to update rumor reviews");
  }
  return createClient(url, key);
}

function clearRumorFlag(flags: string[]) {
  return (flags ?? []).filter(
    (f) => f !== "review:rumor" && f !== "review:suggested"
  );
}

async function polishApprovedRumorBody(body: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Polish this NFL newsletter Activity section for publication. The editor CONFIRMED these rumors as publishable.

Rules:
- Keep the substance of confirmed rumors as clear story prose (who, what was said, why it matters).
- Remove all draft/review machinery: "review:rumor", "needs-review", "flag for review", "carries a review flag", etc.
- Do not tell the reader that something still needs approval.
- Keep ### Activity header, markdown, bold all player and coach names, superscript citations.
- Return ONLY the revised markdown string.

Activity section:
${body}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  return text || null;
}

async function rewriteBodyWithFeedback(
  body: string,
  feedback: string
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Edit this NFL newsletter Activity section per editor feedback. Keep ### Activity header, markdown, bold names, superscript citations. Partial rejects are common: keep bullets/points the editor says are fine, and remove or rewrite only what they flag. Remove all draft/review machinery ("review:rumor", needs-review language). Do not invent new rumors. Return ONLY the revised markdown string.\n\nEditor comment:\n${feedback}\n\nActivity section:\n${body}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  return text || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sectionId = body?.sectionId as string | undefined;
  const action = (body?.action as string | undefined) ?? "approve";

  if (!sectionId) {
    return NextResponse.json({ error: "sectionId required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = supabaseAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server misconfigured" },
      { status: 500 }
    );
  }

  const { data: section, error: fetchErr } = await supabase
    .from("newsletter_sections")
    .select("id, flags, activity_markdown, talk_markdown")
    .eq("id", sectionId)
    .maybeSingle();

  if (fetchErr || !section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  let flags = clearRumorFlag((section.flags as string[]) ?? []);
  let markdown = rumorSourceMarkdown(
    section.activity_markdown as string | null,
    section.talk_markdown as string | null
  );

  if (action === "approve") {
    flags.push("rumor:approved");
    const polished = await polishApprovedRumorBody(markdown);
    markdown = stripReviewMetaFromTalk(polished ?? markdown);
  } else {
    const feedback = (body?.feedback as string | undefined)?.trim();
    const resolution = body?.resolution as "remove" | "rewrite" | "manual" | undefined;
    const talkOverride = body?.talkOverride as string | undefined;

    if (resolution === "rewrite" && !feedback) {
      return NextResponse.json(
        { error: "Add a comment describing what to keep or cut." },
        { status: 400 }
      );
    }
    if (resolution === "manual" && (talkOverride == null || !String(talkOverride).trim())) {
      return NextResponse.json(
        { error: "Activity override required for manual reject." },
        { status: 400 }
      );
    }

    if (resolution === "remove") {
      markdown = stripRumorFromTalk(markdown);
    } else if (resolution === "manual") {
      markdown = talkOverride as string;
    } else if (resolution === "rewrite") {
      const rewritten = await rewriteBodyWithFeedback(markdown, feedback!);
      if (!rewritten) {
        return NextResponse.json(
          {
            error:
              "AI rewrite unavailable. Use manual edit: paste revised Activity markdown.",
            needsManual: true,
            talk_markdown: markdown,
            activity_markdown: markdown,
          },
          { status: 422 }
        );
      }
      markdown = rewritten;
    } else {
      return NextResponse.json(
        { error: "resolution must be remove, rewrite, or manual" },
        { status: 400 }
      );
    }

    markdown = stripReviewMetaFromTalk(markdown);
    flags.push("rumor:rejected");
  }

  flags = clearRumorFlag(flags);
  if (action === "approve" && !flags.includes("rumor:approved")) {
    flags.push("rumor:approved");
  }
  if (action === "reject" && !flags.includes("rumor:rejected")) {
    flags.push("rumor:rejected");
  }

  const { data: updated, error: updateErr } = await supabase
    .from("newsletter_sections")
    .update({
      flags,
      activity_markdown: markdown || null,
      talk_markdown: "",
    })
    .eq("id", sectionId)
    .select("id, flags, activity_markdown, talk_markdown")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Update did not persist. Check service-role access." },
      { status: 500 }
    );
  }

  const savedFlags = (updated.flags as string[]) ?? [];
  if (savedFlags.includes("review:rumor")) {
    return NextResponse.json(
      { error: "Rumor flag was not cleared after save." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    flags: savedFlags,
    activity_markdown: updated.activity_markdown,
    talk_markdown: updated.talk_markdown,
  });
}
