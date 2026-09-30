"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Viewer } from "@/lib/auth";
import { getDivisionGroups } from "@/lib/teams";

const SIMPLE_LINKS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  {
    href: "/weekly",
    label: "Weekly",
    match: (p: string) =>
      p.startsWith("/weekly") || p.startsWith("/issue") || p.startsWith("/admin/review"),
  },
  {
    href: "/admin/usage",
    label: "Usage",
    match: (p: string) => p.startsWith("/admin/usage"),
  },
] as const;

function isTeamsActive(pathname: string) {
  return pathname.startsWith("/team");
}

type Props = {
  viewer?: Viewer | null;
};

export function SiteNav({ viewer = null }: Props) {
  const pathname = usePathname();
  const divisions = getDivisionGroups();

  return (
    <nav className="site-nav" aria-label="Main">
      {SIMPLE_LINKS.map(({ href, label, match }) => (
        <Link
          key={href}
          href={href}
          className={match(pathname) ? "site-nav-link active" : "site-nav-link"}
          aria-current={match(pathname) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}

      <div className="site-nav-dropdown">
        <Link
          href="/teams"
          className={isTeamsActive(pathname) ? "site-nav-link active" : "site-nav-link"}
          aria-current={isTeamsActive(pathname) ? "page" : undefined}
        >
          Teams
        </Link>

        <div className="teams-dropdown-panel" role="menu" aria-label="Browse by team">
          <div className="teams-dropdown-grid">
            {Object.entries(divisions).map(([division, teams]) => (
              <section key={division} className="teams-dropdown-division">
                <h3 className="division-heading">{division}</h3>
                <ul className="team-list">
                  {teams.map((team) => (
                    <li key={team.slug}>
                      <Link href={`/team/${team.slug}`} className="team-link" role="menuitem">
                        <span className="team-abbrev">{team.abbrev.toUpperCase()}</span>
                        <span className="team-name">{team.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="teams-dropdown-footer">
            <Link href="/teams" className="teams-dropdown-all">
              View full team directory
            </Link>
          </div>
        </div>
      </div>

      {viewer?.isAdmin ? (
        <Link
          href="/admin"
          className={
            pathname === "/admin" || pathname.startsWith("/admin/review") || pathname.startsWith("/admin/camp")
              ? "site-nav-link active"
              : "site-nav-link"
          }
        >
          Desk
        </Link>
      ) : null}

      {viewer ? (
        <>
          <Link
            href="/preferences"
            className={pathname.startsWith("/preferences") ? "site-nav-link active" : "site-nav-link"}
          >
            Account
          </Link>
          <form action="/auth/signout" method="post" className="site-nav-signout">
            <button type="submit" className="site-nav-link site-nav-signout-btn">
              Sign out
            </button>
          </form>
        </>
      ) : (
        <Link href="/signin" className="site-nav-cta">
          Sign in
        </Link>
      )}
    </nav>
  );
}
