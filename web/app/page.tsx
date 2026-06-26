import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

export default async function HomePage() {
  const supabase = createServerClient();
  const { data: issues, error } = await supabase
    .from("newsletter_issues")
    .select("issue_date, slug, title, status, issue_type")
    .order("issue_date", { ascending: false })
    .limit(14);

  return (
    <main>
      <h1>ScoutDNA: All 32</h1>
      <p style={{ color: "var(--muted)" }}>
        All 32 teams — camp, injuries, depth charts, and rumors with a fantasy lens.
      </p>
      <p>
        <Link href="/signup">Subscribe</Link> · <Link href="/preferences">Preferences</Link>
      </p>
      <h2>Recent issues</h2>
      <ul>
        {error && (
          <li style={{ color: "#f5a623" }}>
            Database error: {error.message}. Add SUPABASE_SERVICE_ROLE_KEY to web/.env.local
            and restart npm run dev.
          </li>
        )}
        {!error && (issues ?? []).length === 0 && (
          <li style={{ color: "var(--muted)" }}>
            No issues yet. Run collect, then compose (see README). Drafts appear here before
            publish.
          </li>
        )}
        {(issues ?? []).map((issue) => (
          <li key={issue.slug}>
            <Link href={`/issue/${issue.slug}`}>
              {issue.title} ({issue.status})
            </Link>
            {issue.status === "collected" && (
              <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                {" "}
                — run compose to generate text
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
