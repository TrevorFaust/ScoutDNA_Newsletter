import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripRumorFromTalk } from "@/lib/rumorTalk";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function clearRumorFlag(flags: string[]) {
  return (flags ?? []).filter(
    (f) => f !== "review:rumor" && f !== "review:suggested"
  );
}

async function polishApprovedRumorTalk(talk: string): Promise<string | null> {
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
          content: `Polish this NFL newsletter Talk section for publication. Rumors were editor-approved — keep them but rewrite dry/meta rumor lines into clear story prose (who, what was said, why it matters). Keep ### Talk header, markdown, bold all player and coach names, superscript citations. Do not remove substantive rumor content. Return ONLY the revised markdown string.\n\nTalk section:\n${talk}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  return text || null;
}

async function rewriteTalkWithFeedback(
  talk: string,
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
          content: `Edit this NFL newsletter Talk section per editor feedback. Keep ### Talk header, markdown, bold names, superscript citations. Remove or soften rumor content as directed. Return ONLY the revised markdown string.\n\nFeedback:\n${feedback}\n\nTalk section:\n${talk}`,
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

  const supabase = supabaseAdmin();
  const { data: section, error: fetchErr } = await supabase
    .from("newsletter_sections")
    .select("id, flags, talk_markdown")
    .eq("id", sectionId)
    .maybeSingle();

  if (fetchErr || !section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  let flags = clearRumorFlag((section.flags as string[]) ?? []);
  let talk = (section.talk_markdown as string | null) ?? "";

  if (action === "approve") {
    flags.push("rumor:approved");
    const polished = await polishApprovedRumorTalk(talk);
    if (polished) {
      talk = polished;
    }
  } else {
    const feedback = (body?.feedback as string | undefined)?.trim();
    const resolution = body?.resolution as "remove" | "rewrite" | "manual" | undefined;
    const talkOverride = body?.talkOverride as string | undefined;

    if (!feedback && resolution !== "remove") {
      return NextResponse.json(
        { error: "feedback required to reject (except remove without notes)" },
        { status: 400 }
      );
    }

    if (resolution === "remove") {
      talk = stripRumorFromTalk(talk);
    } else if (resolution === "manual" && talkOverride != null) {
      talk = talkOverride;
    } else if (resolution === "rewrite") {
      const rewritten = await rewriteTalkWithFeedback(talk, feedback ?? "");
      if (!rewritten) {
        return NextResponse.json(
          {
            error:
              "AI rewrite unavailable. Use manual edit: paste revised Talk markdown.",
            needsManual: true,
            talk_markdown: talk,
          },
          { status: 422 }
        );
      }
      talk = rewritten;
    } else {
      return NextResponse.json({ error: "resolution must be remove, rewrite, or manual" }, { status: 400 });
    }

    flags.push("rumor:rejected");
  }

  const { error: updateErr } = await supabase
    .from("newsletter_sections")
    .update({ flags, talk_markdown: talk || null })
    .eq("id", sectionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, flags, talk_markdown: talk });
}
