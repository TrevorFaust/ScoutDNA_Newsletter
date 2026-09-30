import { nflWeekNumber, recapLabel } from "@/lib/dates";

const BRAND_PREFIX = /^ScoutDNA:\s*All 32,?\s*/i;

const WEEK_STORIES: Record<string, { hook: string; deck: string }> = {
  "2026-09-14": {
    hook: "Last dress rehearsal. A few jobs are still open.",
    deck: "The 53 is close. Who played, who sat, and who is running out of August. Read it before Week 1 redraws the board.",
  },
  "2026-09-15": {
    hook: "Saleh at MetLife. Seattle comes back. Kansas City has to answer.",
    deck: "New staff in New York, a Seahawks rally that did not look like one at halftime, and a Chiefs result people will still be arguing at kickoff. Week 1 never stays in Week 1.",
  },
  "2026-09-22": {
    hook: "Allen opens the new house. Detroit leaves with coverage questions.",
    deck: "Buffalo's building got a statement night. Detroit walked out with more film on the back end than they wanted to study. Two clubs, two problems that last past Monday.",
  },
  "2026-09-29": {
    hook: "Chargers 0-3, Raiders 3-0. Conventional logic is out the window.",
    deck: "Herbert is still looking for win one. Las Vegas has three in a West that was supposed to run through someone else. If last year's standings are still in your head, the tape already moved.",
  },
};

export function stripBrandTitle(title: string): string {
  return (title || "").replace(BRAND_PREFIX, "").trim();
}

type IssueTitleInput = {
  title: string;
  issue_date: string;
  issue_type?: string | null;
};

function dateIso(issue: IssueTitleInput): string {
  return String(issue.issue_date).slice(0, 10);
}

export function displayIssueTitle(issue: IssueTitleInput): string {
  const iso = dateIso(issue);
  const weekly =
    issue.issue_type === "weekly" || /week/i.test(issue.title || "");
  if (weekly && iso) {
    const n = nflWeekNumber(iso);
    if (n) return `Week ${n} Recap`;
    return recapLabel(iso);
  }
  return stripBrandTitle(issue.title) || issue.title;
}

export function issueHook(issue: IssueTitleInput): string | null {
  const iso = dateIso(issue);
  if (WEEK_STORIES[iso]) return WEEK_STORIES[iso].hook;
  if (issue.issue_type === "weekly") {
    return nflWeekNumber(iso)
      ? "What you missed after Monday night."
      : "Camp tape, depth charts, and who is moving up.";
  }
  return null;
}

export function issueDeck(issue: IssueTitleInput): string | null {
  const iso = dateIso(issue);
  if (WEEK_STORIES[iso]) return WEEK_STORIES[iso].deck;
  if (issue.issue_type === "weekly") {
    return nflWeekNumber(iso)
      ? "The boxes, the reporting, and what it does to the week ahead. Open the book."
      : "Who got first-team reps, who got hurt, and whose job is in play. Read it before the depth chart catches up.";
  }
  return null;
}
