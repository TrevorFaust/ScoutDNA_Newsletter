import { nflWeekNumber, recapLabel } from "@/lib/dates";

const BRAND_PREFIX = /^ScoutDNA:\s*All 32,?\s*/i;

const WEEK_STORIES: Record<string, { hook: string; deck: string }> = {
  "2026-06-08": {
    hook: "A.J. Brown goes to New England. Cleveland still has no quarterback.",
    deck: "Eliot Wolf paid draft capital to hand Drake Maye a true WR1, and the Eagles now have a hole atop Jalen Hurts' target tree. In Berea, Watson versus Sanders is wide open.",
  },
  "2026-06-15": {
    hook: "The league clears Stefon Diggs. Now somebody has to sign him.",
    deck: "Friday's ruling closed his legal case, so Diggs reaches camp with no discipline pending. Past that, the league office went quiet and OTA reports carried the week.",
  },
  "2026-06-22": {
    hook: "The Rams' left tackle faces the league. Minnesota's QB room stays open.",
    deck: "Alaric Jackson anchored a top-two pass-blocking line in 2025 and now faces a possible suspension. Kyler Murray leads in Minnesota, with J.J. McCarthy still in the fight.",
  },
  "2026-06-29": {
    hook: "Sorsby denied, Arnold arrested, Gonzalez waiting on a deal.",
    deck: "The league turned away Brendan Sorsby's supplemental bid over gambling allegations. Detroit lost Terrion Arnold to an armed robbery case, and Christian Gonzalez hits July unsigned.",
  },
  "2026-07-07": {
    hook: "Cleveland's Newsome trade splits the room.",
    deck: "Andrew Berry moved Greg Newsome II and paid Jaylon Campbell $15.2 million a year. Then Newsome signed with the Giants for up to $10 million, and fans picked sides.",
  },
  "2026-07-20": {
    hook: "The Jets' front-office fight goes national. Diggs is still unsigned.",
    deck: "Radio voices argued Darren Mougey has outranked Aaron Glenn for a while. Washington checked on Keenan Allen and Diggs inside 48 hours, hunting help for Jayden Daniels.",
  },
  "2026-07-27": {
    hook: "Pittsburgh picks a fight with ESPN. Zac Taylor needs January.",
    deck: "Ryan Clark's reported exit set off two days of Steelers backlash at the network. Rookies reported, and in Cincinnati the consensus hardened: playoffs or Taylor is gone.",
  },
  "2026-08-03": {
    hook: "Vegas calls it the best offseason ever. New Orleans loses Bresee.",
    deck: "The Raiders' own content crowned their summer one of the best in league history. The Saints lost Bryan Bresee to knee surgery, and Ja'Lynn Polk retired midweek.",
  },
  "2026-08-10": {
    hook: "Pads come on, and Jeff Hafley sets the tone in Miami.",
    deck: "Hafley's physical first camp drew good reviews, and Miami added Clelin Ferrell. Mike Florio went after the Mendoza plan in Vegas, and Cam Ward gave Tennessee real buzz.",
  },
  "2026-08-17": {
    hook: "Preseason games start. Dallas lands Quinnen Williams.",
    deck: "Mendoza and Cousins got their first live snaps against Arizona. Dallas still has $18 million-plus in cap space after the Williams deal, with George Pickens on its radar.",
  },
  "2026-08-24": {
    hook: "Monken picks Watson. An undrafted Ram forces his way in.",
    deck: "Todd Monken named Deshaun Watson the starter early Monday. Wesley Bailey posted a sack, a forced fumble and four QB hits in one preseason game.",
  },
  "2026-08-31": {
    hook: "Cutdown weekend, with Jed York and Josh Jacobs in the headlines.",
    deck: "Every club got to 53 by Sunday. The 49ers' owner pleaded no contest after an Ohio sting, Jacobs hit the exempt list, and J.J. McCarthy is fighting to stay QB2.",
  },
  "2026-09-07": {
    hook: "Pittsburgh ships out Broderick Jones and Caleb Johnson.",
    deck: "The Steelers sent Jones to Dallas and Johnson to Green Bay right after cutdowns. Waiver claims kept rolling, and analysts called Herbert and McDaniel the Chargers' best setup in years.",
  },
  "2026-09-14": {
    hook: "Saleh circles the Jets game. Rodgers starts over in Pittsburgh.",
    deck: "Robert Saleh spent the week getting the Titans ready for the team that fired him. Mike McCarthy's new staff surrounds Aaron Rodgers, and Patrick Paul and Maxx Crosby traded shots.",
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
  hook?: string | null;
  deck?: string | null;
  storylines?: unknown;
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

export function issueStorylines(issue: IssueTitleInput): string[] {
  if (!Array.isArray(issue.storylines)) return [];
  return issue.storylines
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
}

export function issueHook(issue: IssueTitleInput): string | null {
  if (issue.hook?.trim()) return issue.hook.trim();
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
  if (issue.deck?.trim()) return issue.deck.trim();
  const iso = dateIso(issue);
  if (WEEK_STORIES[iso]) return WEEK_STORIES[iso].deck;
  if (issue.issue_type === "weekly") {
    return nflWeekNumber(iso)
      ? "The boxes, the reporting, and what it does to the week ahead. Open the book."
      : "Who got first-team reps, who got hurt, and whose job is in play. Read it before the depth chart catches up.";
  }
  return null;
}
