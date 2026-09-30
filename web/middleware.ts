import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isWriterPath(pathname: string) {
  if (pathname === "/admin") return true;
  return (
    pathname.startsWith("/admin/review") ||
    pathname.startsWith("/admin/camp-signals") ||
    pathname.startsWith("/admin/rumors") ||
    pathname.startsWith("/admin/drafts") ||
    pathname.startsWith("/api/publish") ||
    pathname.startsWith("/api/export-drafts") ||
    pathname.startsWith("/api/sections") ||
    pathname.startsWith("/api/camp-signals")
  );
}

function isAuthPath(pathname: string) {
  return (
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname === "/welcome" ||
    pathname.startsWith("/auth/")
  );
}

function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(email.toLowerCase());
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (isWriterPath(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    if (!isAdminEmail(user.email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "?denied=1";
      return NextResponse.redirect(url);
    }
  }

  if (user && !isAuthPath(pathname) && !pathname.startsWith("/api/")) {
    const { data: profile } = await supabase
      .from("newsletter_profiles")
      .select("favorite_team_slug")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.favorite_team_slug) {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
