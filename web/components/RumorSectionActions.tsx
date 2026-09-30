"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  collectRumorExcerpt,
  usableRumorMarkdown,
  type RumorFootnote,
} from "@/lib/rumorTalk";

type Props = {
  sectionId: string;
  flags: string[];
  talkMarkdown: string | null;
  activityMarkdown?: string | null;
  introMarkdown?: string | null;
  fantasyMarkdown?: string | null;
  footnotes?: RumorFootnote[] | null;
  editable: boolean;
  onResolved?: () => void;
};

export function RumorSectionActions({
  sectionId,
  flags,
  talkMarkdown,
  activityMarkdown,
  introMarkdown,
  fantasyMarkdown,
  footnotes,
  editable,
  onResolved,
}: Props) {
  const router = useRouter();
  const feedbackId = useId();
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [resolution, setResolution] = useState<"remove" | "rewrite" | "manual">("rewrite");
  const rumorText = collectRumorExcerpt({
    activity: activityMarkdown,
    talk: talkMarkdown,
    intro: introMarkdown,
    fantasy: fantasyMarkdown,
    footnotes,
  });
  const bodySource = usableRumorMarkdown(activityMarkdown, talkMarkdown);
  const sourceKind = bodySource ? "body" : rumorText ? "notes" : "none";
  const [manualTalk, setManualTalk] = useState(
    sourceKind === "notes" ? rumorText : (bodySource || talkMarkdown || "")
  );
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const hasRumor = (flags ?? []).includes("review:rumor");

  useEffect(() => {
    if (!showReject) return;
    const t = window.setTimeout(() => feedbackRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [showReject]);

  if (!editable || !hasRumor) {
    return null;
  }

  async function approve() {
    setBusy("approve");
    setFeedbackError(null);
    try {
      const res = await fetch("/api/sections/approve-rumor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, action: "approve" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Could not approve rumor");
        return;
      }
      setShowReject(false);
      onResolved?.();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setFeedbackError(null);

    if (resolution === "rewrite" && !feedback.trim()) {
      setFeedbackError(
        "Add a note — e.g. which bullet to drop, or what to keep."
      );
      feedbackRef.current?.focus();
      return;
    }
    if (resolution === "manual" && !manualTalk.trim()) {
      setFeedbackError("Rumor text cannot be empty.");
      return;
    }

    setBusy("reject");
    try {
      const res = await fetch("/api/sections/approve-rumor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          action: "reject",
          resolution,
          feedback: feedback.trim() || undefined,
          talkOverride: resolution === "manual" ? manualTalk : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.needsManual) {
        setResolution("manual");
        setManualTalk(data.talk_markdown ?? manualTalk);
        setFeedbackError(
          "AI rewrite needs your API key or a manual edit. Edit the rumor text below and submit again."
        );
        return;
      }
      if (!res.ok) {
        setFeedbackError(data.error ?? "Could not reject rumor");
        return;
      }
      setShowReject(false);
      setFeedback("");
      setFeedbackError(null);
      onResolved?.();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rumor-actions">
      <div className="rumor-actions-label">Rumor excerpt</div>
      {rumorText ? (
        <blockquote className="rumor-actions-excerpt">{rumorText}</blockquote>
      ) : (
        <p className="rumor-actions-empty">
          Flagged for review, but this draft has no rumor sentence in the
          section or its references. Confirm clears the badge.
        </p>
      )}
      <div className="rumor-actions-buttons">
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={approve}
        >
          {busy === "approve" ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null}
          aria-expanded={showReject}
          onClick={() => {
            setShowReject((v) => !v);
            setFeedbackError(null);
          }}
        >
          Reject
        </button>
      </div>

      {showReject && (
        <div className="rumor-reject-panel">
          <label htmlFor={feedbackId} className="rumor-reject-label">
            Comment
          </label>
          <p className="rumor-reject-hint">
            Say what to keep and what to cut. Example: keep the first three
            bullets; drop the free-agent CB rumor — no sourcing.
          </p>
          <textarea
            id={feedbackId}
            ref={feedbackRef}
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              if (feedbackError) setFeedbackError(null);
            }}
            rows={4}
            required={resolution === "rewrite"}
            placeholder="e.g. Points 1–3 are fine. Ignore the 4th about the trade — podcast noise only."
            className="rumor-reject-comment"
          />
          {feedbackError && (
            <p className="rumor-reject-error" role="alert">
              {feedbackError}
            </p>
          )}

          <fieldset className="rumor-reject-options">
            <legend>How to apply</legend>
            <label>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "rewrite"}
                onChange={() => setResolution("rewrite")}
              />
              <span>
                Rewrite from this comment (AI). Best when you want to keep
                part of it.
              </span>
            </label>
            <label>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "remove"}
                onChange={() => setResolution("remove")}
              />
              <span>Strip the rumor</span>
            </label>
            <label>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "manual"}
                onChange={() => {
                  setResolution("manual");
                  setManualTalk(
                    sourceKind === "notes" ? rumorText : bodySource || talkMarkdown || ""
                  );
                }}
              />
              <span>Edit the rumor text manually</span>
            </label>
          </fieldset>

          {resolution === "manual" && (
            <textarea
              value={manualTalk}
              onChange={(e) => setManualTalk(e.target.value)}
              rows={8}
              aria-label="Edit rumor text"
              className="rumor-reject-manual"
            />
          )}

          <div className="rumor-reject-submit">
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={reject}
            >
              {busy === "reject" ? "Saving…" : "Submit rejection"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={() => {
                setShowReject(false);
                setFeedbackError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
