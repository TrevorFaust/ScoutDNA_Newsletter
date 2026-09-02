"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDivisionGroups } from "@/lib/teams";

const SIMPLE_LINKS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/daily", label: "Daily", match: (p: string) => p.startsWith("/daily") },
  { href: "/weekly", label: "Weekly", match: (p: string) => p.startsWith("/weekly") },
  {
    href: "/admin/rumors",
    label: "Rumors",
    match: (p: string) => p.startsWith("/admin/rumors") || p.startsWith("/admin/review"),
  },
  {
    href: "/admin/drafts",
    label: "Drafts",
    match: (p: string) => p.startsWith("/admin/drafts"),
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

export function SiteNav() {
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

      <Link href="/signup" className="site-nav-cta">
        Subscribe
      </Link>
    </nav>
  );
}
