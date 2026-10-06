import Link from "next/link";
import type { WeeklyReelItem } from "@/lib/weeklyReel";

type Props = {
  item: WeeklyReelItem;
  isAdmin?: boolean;
  focusable?: boolean;
};

function reelStatus(status: string) {
  if (status === "published") return "Published";
  if (status === "in_review") return "In review";
  if (status === "collected") return "Awaiting compose";
  if (status === "collecting") return "Collecting";
  return status;
}

function StubWeek({ tabLabel }: { tabLabel: string }) {
  const week = /^(?:(Preseason|Camp) )?Week (\d+)$/.exec(tabLabel);
  if (week) {
    return (
      <span className="ticket-stub-week">
        <small>{week[1] ?? "Week"}</small>
        <strong>{week[2]}</strong>
      </span>
    );
  }
  return (
    <span className="ticket-stub-week">
      <small>Camp</small>
      <strong className="is-range">{tabLabel}</strong>
    </span>
  );
}

export function EditionTicket({ item, isAdmin = false, focusable = true }: Props) {
  const tabIndex = focusable ? 0 : -1;
  const showStatus = isAdmin && item.status !== "published";

  return (
    <div className="ticket">
      <div className="ticket-main">
        <div className="ticket-meta">
          <span className="ticket-kicker">ScoutDNA · All 32</span>
          <time dateTime={item.issueDate}>{item.dateLabel}</time>
        </div>
        <h3 className="ticket-title">{item.label}</h3>
        {item.hook ? <p className="ticket-hook">{item.hook}</p> : null}
        {item.deck ? <p className="ticket-deck">{item.deck}</p> : null}
        {showStatus ? (
          <p className="weekly-reel-status">{reelStatus(item.status)}</p>
        ) : null}
        <div className="ticket-actions">
          <Link
            href={item.href}
            className="btn btn-primary ticket-read"
            tabIndex={tabIndex}
            draggable={false}
          >
            Read {item.label}
          </Link>
          {showStatus ? (
            <Link
              href={`/admin/review/${item.slug}`}
              className="btn btn-paper ticket-aside"
              tabIndex={tabIndex}
            >
              Review
            </Link>
          ) : null}
        </div>
      </div>
      <div className="ticket-stub" aria-hidden="true">
        <span className="ticket-stub-admit">Admit one</span>
        <StubWeek tabLabel={item.tabLabel} />
        <span className="ticket-barcode" />
      </div>
    </div>
  );
}
