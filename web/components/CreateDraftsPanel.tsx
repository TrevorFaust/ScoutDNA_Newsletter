"use client";

import { useState, useTransition } from "react";

type RedditResult = {
  teamSlug: string;
  teamName: string;
  subreddit: string;
  ok: boolean;
  draftId?: string;
  error?: string;
  skipped?: boolean;
};

type SubstackResult = {
  ok: boolean;
  draftId?: string | number;
  draftUrl?: string;
  error?: string;
};

type ExportResponse = {
  error?: string;
  pendingRumors?: number;
  teamPostsPrepared?: number;
  warnings?: string[];
  reddit?: RedditResult[];
  substack?: SubstackResult;
};

type Props = {
  issueId: string;
  pendingRumors: number;
};

export function CreateDraftsPanel({ issueId, pendingRumors }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocked = pendingRumors > 0;

  function run(targets: Array<"reddit" | "substack">) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/export-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId, targets }),
        });
        const data = (await res.json()) as ExportResponse;
        if (!res.ok) {
          setError(data.error || `Request failed (${res.status})`);
          return;
        }
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const redditOk = result?.reddit?.filter((r) => r.ok).length ?? 0;
  const redditFail =
    result?.reddit?.filter((r) => !r.ok && !r.skipped).length ?? 0;
  const redditSkip = result?.reddit?.filter((r) => r.skipped).length ?? 0;

  return (
    <section className="camp-admin-card">
      <h2>External drafts</h2>
      <p className="camp-admin-muted">
        After review, create drafts only — nothing posts live. Reddit drafts land
        in your account under each team subreddit. Substack opens a newsletter
        draft with references expanded as links.
      </p>

      {blocked ? (
        <p className="camp-admin-muted rumor-publish-hint">
          Clear all rumor flags before creating drafts.
        </p>
      ) : null}

      <div className="rumor-review-actions">
        <button
          type="button"
          className="btn"
          disabled={blocked || pending}
          onClick={() => run(["reddit", "substack"])}
        >
          {pending ? "Creating drafts…" : "Create Substack + Reddit drafts"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={blocked || pending}
          onClick={() => run(["substack"])}
        >
          Substack only
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={blocked || pending}
          onClick={() => run(["reddit"])}
        >
          Reddit only
        </button>
      </div>

      {error ? <p className="export-drafts-error">{error}</p> : null}

      {result ? (
        <div className="export-drafts-report">
          <p>
            Prepared {result.teamPostsPrepared ?? 0} team post
            {(result.teamPostsPrepared ?? 0) === 1 ? "" : "s"} (empty sections
            skipped).
          </p>
          {result.warnings?.length ? (
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {result.substack ? (
            <p>
              Substack:{" "}
              {result.substack.ok ? (
                result.substack.draftUrl ? (
                  <a
                    href={result.substack.draftUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open draft
                  </a>
                ) : (
                  "Draft created"
                )
              ) : (
                <span className="export-drafts-error">
                  {result.substack.error || "Failed"}
                </span>
              )}
            </p>
          ) : null}

          {result.reddit ? (
            <>
              <p>
                Reddit: {redditOk} ok
                {redditFail ? `, ${redditFail} failed` : ""}
                {redditSkip ? `, ${redditSkip} skipped` : ""}. Review in{" "}
                <a
                  href="https://www.reddit.com/user/drafts"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  your drafts
                </a>
                .
              </p>
              {redditFail > 0 || redditSkip > 0 ? (
                <ul className="export-drafts-failures">
                  {result.reddit
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li key={r.teamSlug}>
                        {r.teamName}
                        {r.subreddit ? ` (r/${r.subreddit})` : ""}:{" "}
                        {r.error || "failed"}
                      </li>
                    ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
