"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { ReferencesDropdown } from "@/components/ReferencesDropdown";
import { RumorSectionActions } from "@/components/RumorSectionActions";
import { getDivisionGroups } from "@/lib/teams";

type Section = {
  id?: string;
  sort_order: number;
  intro_paragraphs: string | null;
  rookie_paragraph: string | null;
  activity_markdown: string | null;
  talk_markdown: string | null;
  fantasy_markdown?: string | null;
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
  issueDate?: string;
  leagueSection: string | null;
  leagueFootnotes?: Footnote[];
  sections: Section[];
  favoriteTeamSlug?: string | null;
  playerEntries?: import("@/lib/playerRegistry").PlayerLookupEntry[];
};

export function IssueView({
  title,
  status,
  issueDate,
  leagueSection,
  leagueFootnotes = [],
  sections,
  favoriteTeamSlug,
  playerEntries = [],
}: Props) {
  const hasContent = sections.some(
    (s) => s.intro_paragraphs || s.activity_markdown || s.talk_markdown
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

  return (
    <main>
      <h1>{title}</h1>
      {status && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Status: <strong>{status}</strong>
        </p>
      )}
      {status === "in_review" && issueDate && (
        <p style={{ fontSize: "0.9rem" }}>
          <Link href={`/admin/review/${issueDate}`}>Open review panel</Link>
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
          <MarkdownBlock content={leagueSection} playerEntries={playerEntries} />
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
            const sectionContext = [
              sec.intro_paragraphs,
              sec.rookie_paragraph,
              sec.activity_markdown,
              sec.talk_markdown,
              sec.fantasy_markdown,
            ]
              .filter(Boolean)
              .join("\n\n");
            return (
              <article key={t.slug} id={t.slug} className="team-section">
                <h2>{t.name}</h2>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>#{t.abbrev}</div>
                {sec.tags?.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
                {sec.flags
                  ?.filter(
                    (f) =>
                      f.startsWith("review:") ||
                      f.startsWith("empty:") ||
                      f === "parse:error"
                  )
                  .map((f) => (
                    <span key={f} className="flag">
                      {" "}
                      ⚠ {f.replace("review:", "")}
                    </span>
                  ))}
                {sec.id && (
                  <RumorSectionActions
                    sectionId={sec.id}
                    flags={sec.flags ?? []}
                    talkMarkdown={sec.talk_markdown}
                    editable={status === "in_review"}
                  />
                )}
                {sec.intro_paragraphs && (
                  <MarkdownBlock
                    content={sec.intro_paragraphs}
                    playerEntries={playerEntries}
                    contextText={sectionContext}
                  />
                )}
                {sec.rookie_paragraph && (
                  <>
                    <h3>Rookies & camp additions</h3>
                    <MarkdownBlock
                      content={sec.rookie_paragraph}
                      playerEntries={playerEntries}
                      contextText={sectionContext}
                    />
                  </>
                )}
                {sec.is_empty && !sec.intro_paragraphs && !sec.fantasy_markdown ? (
                  <p style={{ color: "var(--muted)" }}>
                    {sec.empty_reason ?? "No verified updates in the last 24 hours."}
                  </p>
                ) : (
                  <>
                    {sec.activity_markdown && (
                      <MarkdownBlock
                        content={sec.activity_markdown}
                        playerEntries={playerEntries}
                        contextText={sectionContext}
                      />
                    )}
                    {sec.talk_markdown && (
                      <MarkdownBlock
                        content={sec.talk_markdown}
                        playerEntries={playerEntries}
                        contextText={sectionContext}
                      />
                    )}
                    {sec.fantasy_markdown && (
                      <MarkdownBlock
                        content={sec.fantasy_markdown}
                        playerEntries={playerEntries}
                        contextText={sectionContext}
                      />
                    )}
                  </>
                )}
                <ReferencesDropdown footnotes={sec.footnotes} />
              </article>
            );
          })}
        </div>
      ))}
    </main>
  );
}
