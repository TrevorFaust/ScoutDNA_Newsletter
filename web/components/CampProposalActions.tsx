"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CampBattleProposal } from "@/lib/campSignals";

const TYPE_LABEL: Record<string, string> = {
  settle_slot: "Settle slot",
  strengthen_lean: "Strengthen lean",
  widen_battle: "Widen battle",
  narrow_battle: "Narrow battle",
  reopen_slot: "Reopen slot",
};

function directionMark(direction: string) {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  return "·";
}

export function CampProposalCard({ proposal }: { proposal: CampBattleProposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/camp-signals/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? `Could not ${path} proposal`);
      return false;
    }
    return true;
  }

  async function approve() {
    setBusy("approve");
    try {
      if (await post("approve", {})) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("reject");
    try {
      if (await post("reject", { reason: reason.trim() || undefined })) {
        setShowReject(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function snooze() {
    setBusy("snooze");
    try {
      if (await post("snooze", {})) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const current = proposal.current_state;
  const proposed = proposal.proposed_state;

  return (
    <li className="camp-proposal-card">
      <div className="camp-proposal-head">
        <strong>
          {proposal.team_abbr} · {proposal.slot} · {TYPE_LABEL[proposal.proposal_type] ?? proposal.proposal_type}
        </strong>
        <span className={`camp-proposal-confidence camp-proposal-confidence-${proposal.confidence}`}>
          {proposal.confidence} confidence
        </span>
      </div>

      <div className="camp-proposal-states">
        <div>
          <span className="camp-admin-muted">Current — {current.status}</span>
          <p>{current.candidates?.join(" | ")}</p>
          {current.note && <p className="camp-admin-muted">{current.note}</p>}
        </div>
        <div className="camp-proposal-arrow">→</div>
        <div>
          <span className="camp-admin-muted">Proposed — {proposed.status}</span>
          <p>
            <strong>{proposed.candidates?.join(" | ")}</strong>
          </p>
          {proposed.note && <p className="camp-admin-muted">{proposed.note}</p>}
        </div>
      </div>

      <p className="camp-proposal-rationale">{proposal.rationale}</p>

      {proposal.evidence?.length > 0 && (
        <ul className="camp-proposal-evidence">
          {proposal.evidence.map((e, i) => (
            <li key={i}>
              <span className="camp-admin-muted">{e.date}</span>{" "}
              <span>
                {directionMark(e.direction)} {e.player}
              </span>{" "}
              <span className="camp-admin-muted">t{e.source_tier}</span> — {e.summary}
              {e.repeat_count > 1 && (
                <span className="camp-proposal-repeat"> ({e.repeat_count}× reported)</span>
              )}
              {e.url && (
                <>
                  {" "}
                  <a href={e.url} target="_blank" rel="noreferrer">
                    source
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="camp-proposal-buttons">
        <button type="button" className="btn" disabled={busy !== null} onClick={approve}>
          {busy === "approve" ? "Saving…" : "✓ Approve"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null}
          onClick={() => setShowReject((v) => !v)}
        >
          ✗ Reject
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={snooze}>
          {busy === "snooze" ? "Saving…" : "Snooze 3d"}
        </button>
      </div>

      {showReject && (
        <div className="camp-proposal-reject">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Optional: why reject? (e.g. not enough camp reps yet)"
          />
          <button type="button" className="btn" disabled={busy !== null} onClick={reject}>
            {busy === "reject" ? "Saving…" : "Submit rejection"}
          </button>
        </div>
      )}
    </li>
  );
}
