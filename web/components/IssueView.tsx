"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IssueAdjacentNav } from "@/components/IssueAdjacentNav";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { PublishIssueForm } from "@/components/PublishIssueForm";
import { ReferencesDropdown } from "@/components/ReferencesDropdown";
import { TeamSectionBody } from "@/components/TeamSectionBody";
import { cleanCopy } from "@/lib/cleanCopy";
import { type AdjacentIssue } from "@/lib/issues";
import { getDivisionGroups } from "@/lib/teams";
import { hasPendingRumorFlag } from "@/lib/rumorTalk";

type Section = {
  id?: string;
  sort_order: number;
  intro_paragraphs: string | null;
  rookie_paragraph: string | null;
  activity_markdown: string | null;
  talk_markdown: string | null;
  fantasy_markdown: string | null;
  footnotes: { n: number; label: string; url: string }[];
  tags: string[];
  flags: string[];
  is_empty: boolean;
  empty_reason: string | null;
  teams: { slug: string; name: string; abbrev: string };
};

type Footnote = { n: number; label: string; url: string };

type Props = {
  title: string;
  status?: string;
  issueId?: string;
  issueType?: "daily" | "weekly";
  issueDate?: string;
  leagueSection: string | null;
  leagueFootnotes?: Footnote[];
  sections: Section[];
  favoriteTeamSlug?: string | null;
  playerEntries?: import("@/lib/playerRegistry").PlayerLookupEntry[];
  adjacentPrev?: AdjacentIssue | null;
  adjacentNext?: AdjacentIssue | null;
};

export function IssueView({
  title,
  status,
  issueId,
  issueType = "daily",
  issueDate,
  leagueSection,
  leagueFootnotes = [],
  sections,
  favoriteTeamSlug,
  playerEntries = [],
  adjacentPrev = null,
  adjacentNext = null,
}: Props) {
  const hasContent = sections.some(
    (s) => s.intro_paragraphs || s.activity_markdown || s.fantasy_markdown
  );
  const divisions = getDivisionGroups();
  const bySlug = Object.fromEntries(
    sections.map((s) => [s.teams.slug, s])
  );

  useEffect(() => {
    if (!favoriteTeamSlug) return;
    const el = document.getElementById(favoriteTeamSlug);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [favoriteTeamSlug]);

  const editionHref = issueType === "weekly" ? "/weekly" : "/daily";
  const editionLabel = issueType === "weekly" ? "Weekly" : "Daily";
  const canPublish =
    Boolean(issueId && issueDate) &&
    (status === "in_review" || status === "approved" || status === "draft");

  return (
    <main>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href={editionHref}>{editionLabel}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Issue</span>
      </nav>

      <div className="issue-header">
        <div className="issue-header-text">
          <span className={`edition-badge edition-${issueType}`}>{editionLabel} Edition</span>
          <h1>{cleanCopy(title)}</h1>
        </div>
        {issueId && issueDate && (canPublish || status === "published") ? (
          <div className="issue-header-actions">
            {canPublish ? (
              <PublishIssueForm issueId={issueId} slug={issueDate} />
            ) : null}
            <Link href={`/admin/drafts/${issueDate}`} className="btn btn-secondary">
              External drafts
            </Link>
          </div>
        ) : null}
      </div>

      <IssueAdjacentNav
        prev={adjacentPrev}
        next={adjacentNext}
        teamSlug={favoriteTeamSlug}
      />

      {status && status !== "published" && (
        <p className="issue-status">
          Status: <strong>{status}</strong>
        </p>
      )}
      {status === "in_review" &&
        issueDate &&
        sections.some((s) => hasPendingRumorFlag(s.flags)) && (
          <p className="issue-rumor-review-link">
            <Link href={`/admin/review/${issueDate}`}>
              Review rumors in Rumors tab (
              {sections.filter((s) => hasPendingRumorFlag(s.flags)).length}{" "}
              pending) — confirm/reject there, not in this writeup
            </Link>
          </p>
        )}
      {(status === "collecting" || status === "collected") && !hasContent && (
        <div className="league-block" style={{ borderColor: "#f5a623" }}>
          <strong>Not written yet</strong>
          <p style={{ margin: "0.5rem 0 0" }}>
            Collect finished but compose has not run (or failed). From the{" "}
            <code>pipeline</code> folder:{" "}
            <code>python -m src.run_compose --date YYYY-MM-DD --team pittsburgh-steelers</code>
          </p>
        </div>
      )}
      {leagueSection && (
        <div className="league-block">
          <strong>League-wide</strong>
          <MarkdownBlock content={cleanCopy(leagueSection)} playerEntries={playerEntries} />
          <ReferencesDropdown footnotes={leagueFootnotes} />
        </div>
      )}

      <nav className="toc" aria-label="Teams by division">
        <h2>Jump to team</h2>
        {Object.entries(divisions).map(([divName, teams]) => (
          <div key={divName} style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>
              {divName}
            </div>
            <ul>
              {teams.map((t) => (
                <li key={t.slug}>
                  <a href={`#${t.slug}`}>{t.name}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {Object.entries(divisions).map(([divName, teams]) => (
        <div key={divName}>
          <h2 style={{ color: "var(--muted)", fontSize: "1.1rem", marginTop: "2rem" }}>
            {divName}
          </h2>
          {teams.map((t) => {
            const sec = bySlug[t.slug];
            if (!sec) return null;
            return (
              <article key={t.slug} id={t.slug} className="team-section">
                <h2>{t.name}</h2>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>#{t.abbrev}</div>
                {sec.flags
                  ?.filter(
                    (f) =>
                      f.startsWith("empty:") ||
                      f === "parse:error"
                  )
                  .map((f) => (
                    <span key={f} className="flag">
                      {" "}
                      ⚠ {f.replace("review:", "")}
                    </span>
                  ))}
                {sec.is_empty && !sec.intro_paragraphs && !sec.fantasy_markdown ? (
                  <p style={{ color: "var(--muted)" }}>
                    {sec.empty_reason ?? "No verified updates in the last 24 hours."}
                  </p>
                ) : (
                  <TeamSectionBody
                    section={sec}
                    playerEntries={playerEntries}
                    teamAbbr={sec.teams.abbrev}
                  />
                )}
              </article>
            );
          })}
        </div>
      ))}
      <IssueAdjacentNav
        prev={adjacentPrev}
        next={adjacentNext}
        teamSlug={favoriteTeamSlug}
      />
    </main>
  );
}
