import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabaseUser";

export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
