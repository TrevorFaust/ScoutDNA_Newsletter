import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabaseUser";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/welcome";

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/signin?error=link`);
    }
  }

  const dest = next.startsWith("/") ? next : "/welcome";
  return NextResponse.redirect(`${origin}${dest}`);
}
