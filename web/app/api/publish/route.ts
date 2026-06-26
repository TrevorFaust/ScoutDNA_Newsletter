import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const issueId = form.get("issueId") as string;
  const slug = form.get("slug") as string;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, key);

  await supabase
    .from("newsletter_issues")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", issueId);

  return NextResponse.redirect(new URL(`/issue/${slug}`, req.url), 303);
}
