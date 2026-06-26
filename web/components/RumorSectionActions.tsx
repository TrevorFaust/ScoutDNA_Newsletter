"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  sectionId: string;
  flags: string[];
  talkMarkdown: string | null;
  editable: boolean;
};

export function RumorSectionActions({
  sectionId,
  flags,
  talkMarkdown,
  editable,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [resolution, setResolution] = useState<"remove" | "rewrite" | "manual">("rewrite");
  const [manualTalk, setManualTalk] = useState(talkMarkdown ?? "");

  const hasRumor = (flags ?? []).some(
    (f) => f === "review:rumor" || (f.includes("rumor") && f.startsWith("review:"))
  );

  if (!editable || !hasRumor) {
    return null;
  }

  async function approve() {
    setBusy("approve");
    try {
      const res = await fetch("/api/sections/approve-rumor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, action: "approve" }),
      });
      if (!res.ok) {
        alert("Could not approve rumor");
        return;
      }
      setShowReject(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (resolution !== "remove" && !feedback.trim() && resolution !== "manual") {
      alert("Add feedback so the Talk section can be updated.");
      return;
    }
    if (resolution === "manual" && !manualTalk.trim()) {
      alert("Talk section cannot be empty.");
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
        alert(
          "AI rewrite needs your API key or manual edit. Edit Talk below and submit again."
        );
        return;
      }
      if (!res.ok) {
        alert(data.error ?? "Could not reject rumor");
        return;
      }
      setShowReject(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        margin: "0.5rem 0 1rem",
        padding: "0.75rem",
        border: "1px solid #c9a227",
        borderRadius: 8,
        background: "rgba(201, 162, 39, 0.08)",
      }}
    >
      <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        Rumor flagged for review
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={approve}
        >
          {busy === "approve" ? "Saving…" : "✓ Approve rumor"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => setShowReject((v) => !v)}
          style={{ opacity: 0.9, background: "var(--surface)", color: "var(--text)" }}
        >
          ✗ Reject rumor
        </button>
      </div>

      {showReject && (
        <div style={{ marginTop: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.35rem" }}>
            What should change?
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="e.g. Remove the WR depth rumor — not confirmed. Or: Soften to say podcast speculation only."
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "0.9rem",
            }}
          />
          <div style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "rewrite"}
                onChange={() => setResolution("rewrite")}
              />{" "}
              Rewrite Talk using feedback (AI)
            </label>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "remove"}
                onChange={() => setResolution("remove")}
              />{" "}
              Remove rumor block from Talk
            </label>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              <input
                type="radio"
                name={`rumor-res-${sectionId}`}
                checked={resolution === "manual"}
                onChange={() => {
                  setResolution("manual");
                  setManualTalk(talkMarkdown ?? "");
                }}
              />{" "}
              Edit Talk manually
            </label>
          </div>
          {resolution === "manual" && (
            <textarea
              value={manualTalk}
              onChange={(e) => setManualTalk(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                marginTop: "0.5rem",
                padding: "0.5rem",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            />
          )}
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={reject}
            style={{ marginTop: "0.5rem" }}
          >
            {busy === "reject" ? "Saving…" : "Submit rejection"}
          </button>
        </div>
      )}
    </div>
  );
}
