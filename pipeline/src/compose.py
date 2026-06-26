import json
import os
from datetime import date

import anthropic

from .compose_context import load_compose_context
from .compose_json import parse_compose_json
from .season_context import load_season_context
from .teams import Team, division_groups

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
TEAM_MAX_TOKENS = int(os.getenv("COMPOSE_TEAM_MAX_TOKENS", "4096"))

STYLE_RULES = """
Writing style:
- Use normal sentences. Avoid em-dashes (—). Use commas or periods instead.
- Never use square brackets for asides like [Inference: ...].
- News blocks (intro, rookies, activity, talk) stay factual. Put ALL dynasty/redraft angles in fantasy_markdown only (no "Fantasy take:" prefix).
- You may infer role/usage from coach quotes or camp buzz without saying "depth chart" every time.
- Names: bold every player and every coach/GM when named — **Aaron Rodgers**, **Germie Bernard**, **Mike McCarthy**, **Omar Khan**. The UI renders colored chips from bold names (players by position, coaches in staff color).
- Experience/years: player_experience in context is for accuracy only — do NOT label every player. Default: name + position only. Say rookie only for true rookies (years_exp=0) when it matters to the story. Say second-year only when the piece is about year-two breakout/development. Say veteran or career length only for outliers (e.g. 15+ year QB on a short deal) and at most once per player per section. Never repeat "22-year veteran" for the same QB daily. Wrong labels forbidden: years_exp=1 is second year, not first year.
- rookie_paragraph: news-driven only — do NOT list the full draft class. Lead with skill-position rookies (QB/RB/WR/TE) when inputs have updates. Also include when inputs mention: (a) OL rookies (including from draft_capital_2026 / depth_chart_ol_def), especially early-round picks or line shuffles — frame how the addition affects run/pass for skill players, not as a stash; (b) rounds 6–7 picks or UDFAs who keep popping up as camp standouts, mini-camp darlings, or fan-buzz names (they may never make the roster — frame as camp story, not stash advice). Prefer OL over IDP for these dartling mentions; note a DEF camp darling only when multiple inputs flag the same name or a clear trend. If no rookie/UDFA has news, set rookie_paragraph to empty string. Use draft_capital_2026 for round/pick when citing draft capital (never invent; never use round 0).
- skill_position_battles + fantasy_skill_depth: skill_position_battles is background for which slots are up for grabs (QB/RB/WR/TE). Mention a battle only when today's inputs discuss that player, role, or competition — or one brief orienting clause where it helps (not a full depth-chart recap). status=contested → name relevant candidates when news touches that battle; status=open → frame as unclear alpha/slot; status=settled → do not invent competition. Slot labels cascade: losers from a contested/open battle fill the next depth slot implicitly (note often says "losers slot WR3") — gaps in numbering are intentional (e.g. NYG WR2 battle then WR4 bubble means WR3 is cascade fallout, not a separate camp fight). Only treat a lower slot as its own battle when candidates[] adds players not already fighting above. Examples: PIT WR3 contested (Bernard vs Wilson); MIA WR1 open; DEN WR1 contested Sutton vs Waddle with WR3 fight below. fantasy_skill_depth shows depth-chart order only — it does not define which slot is contested. When camp news hits a position, use battles + depth together; never crown a winner without source support.
- Never tell readers to draft or stash individual OL, DL, LB, CB, S, nickel, or any IDP role. Nickel is a coverage/sub-package DB — same as CB/S for fantasy (not draftable). Team DEF is the only defensive fantasy asset; mention it as a unit, usually late in drafts.
- OL news belongs in the section when inputs mention it: first-round picks, starting-guard/tackle competition, notable camp reps, or coordinator/HC comments on the front. Keep it brief in intro/rookie_paragraph/activity; put fantasy impact in fantasy_markdown (RB rushing environment, QB time-to-throw, fewer sacks — tie to named skill players when possible). depth_chart_ol_def and draft_capital_2026 help fact-check OL names and round.
- DL/LB/DB news: frame impact on team run/pass game or team DEF quality, not individual IDP value. DEF camp darlings only when inputs repeat the same name or describe a unit trend.
- Use team_stats_2025 ranks when relevant (e.g. "2025 run-block rank 3", "def yards allowed rank 1") to add context for OL/DEF unit stories.
- coaching_2026: use HC/OC/DC/GM names and titles from the block. Jesse Minter is HC in Baltimore, not DC. GM (e.g. Omar Khan, Howie Roseman) owns trades, contracts, and draft capital moves. HC is usually offense- or defense-minded: an offensive HC (e.g. Mike McCarthy) works closely with the OC (Brian Angelichio) on scheme and usage; the DC (Patrick Graham) runs the defense with less HC sway. A defensive-minded HC mirrors that on the other side. Reference this hierarchy when news involves scheme, trades, or coordinator quotes — not every paragraph.
- intro_paragraphs: narrative context with names, positions, depth roles, and quotes. This is where depth and reasoning live.
- activity_markdown: ### Activity — bullets that add value beyond intro: new facts from inputs not fully covered above, plus grounded inferences (usage, competition, timeline) when they follow logically from cited news. Do not copy intro sentences verbatim. Do not invent facts; inferences must be clearly tied to something in inputs.
- talk_markdown: ### Talk — quotes, coach sound bites, and rumor context with a different angle than intro (reaction, implication, or attribution detail). Rumors: write as readable story beats (who, what outlet said, why it matters to the roster or front office), not dry meta lines like "Community discussion remains unsettled" or "no single source has definitively assigned outcomes." Attribute uncertainty clearly but with narrative prose. Rumors use review:rumor flag, not inline [RUMOR] brackets.
- fantasy_markdown: ### Fantasy lens — news-driven bullets ONLY (QB/RB/WR/TE/DEF when today's inputs warrant it). Skip any player with no update. When OL or trench news is in inputs, add at most one bullet on how the line affects fantasy (e.g. run game for Jaylen Warren, protection for the starter QB) — never recommend drafting an individual lineman. Never label depth in parentheses like (QB1), (RB2), (WR3), or (8 years exp); use natural prose ("starter Jaylen Warren", "backup Rico Dowdle") when role matters. RB1 is the starter; RB2/RB3 are backups/handcuffs — never call RB1 a handcuff. Replacement/competition and dynasty angles apply beyond QB: when inputs cite legal trouble, injury, attitude, or trade rumors involving a starter, note how high-capital backups (e.g. Jaylen Wright, Ollie Gordon behind De'Von Achane) could gain value or become trade chips — only when the news supports it, never as generic backup hype. Do not paste generic dynasty boilerplate unless tied to today's story. Team DEF: bullets only for major stories (starters, trades, coordinator change). Avoid scripted template phrasing; tie each bullet to something that happened in the last 24h. Quiet day = one bullet acknowledging no fantasy-relevant updates.
- In fantasy_markdown only: do not use parenthetical depth slots or years_exp; avoid veteran/year labels unless the bullet is about experience/development.
- Do not write podcast meta (host departures, episode titles, Ring of Honor ballots) unless tied to named NFL/fantasy news.
- In prose, cite with superscripts only; footnote label can name outlet. Do not write "per Locked On X" in the body.
- Citations in prose: end the sentence with Unicode superscript only (¹ ² ³) matching footnotes[].n. Example: "Yes. This is it," Rodgers said Wednesday, per ESPN and r/steelers.¹ Never use [1], [2], or bracketed reference numbers.
- footnotes[].label must be a readable citation line (quote or paraphrase + outlet), NOT just "ESPN". Example label: "\\"Yes. This is it.\\" — Rodgers, Wednesday media availability, ESPN / r/steelers"
- Do not tuck long asides in parentheses; use a new sentence instead.
- Past-season games/playoffs: only use Season context or input JSON; label the year (e.g. 2025 Wild Card vs Texans).
- Released players: do NOT mention departed players unless discussing their replacement or fantasy impact on incumbents (no fan nostalgia, no "fans sad" bullets). Example: skip Gainwell unless tying to Dowdle/Johnson RB battle.
- Veteran QB on short deal (e.g. Rodgers): dynasty angle is which backup/young QB inherits the room after he leaves and mentorship path, NOT "avoid investing in the veteran past 2026."
- Roster moves: note replacement/competition when fantasy-relevant and news-backed.
"""


def _build_team_prompt(
    team: Team, clusters: list[dict], issue_date: date, prior_context: str = ""
) -> str:
    stories = clusters[:12]
    context = json.dumps(stories, indent=2) if stories else "[]"
    season = load_season_context(team.slug)
    season_block = (
        json.dumps(season, indent=2)
        if season
        else "None — only cite past games if in input stories; do not guess opponents."
    )
    db_context = load_compose_context(team)
    db_block = db_context if db_context else "None — use input stories only for player positions."
    return f"""Write the {team.name} section for ScoutDNA: All 32 — a fantasy-focused NFL daily newsletter.
Issue date: {issue_date} (today's edition; prioritize news from the last 24h in inputs).

Team tier: {team.narrative_tier}. Audience: dynasty and redraft fantasy players. Concise, grounded, light personality OK.

{db_block}

Season context (authoritative for past seasons and playoff results):
{season_block}

Input stories (JSON) — each cluster may include source_urls and raw_titles from multiple collected items (Reddit, podcasts, YouTube). Facts and citations must come from here plus season/team context; not from general memory.
{context}

{prior_context}

{STYLE_RULES}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "intro_paragraphs": "1-2 short paragraphs (markdown; bold all player and coach names; superscript citations ¹ ²; news only)",
  "rookie_paragraph": "skill rookies with news first; OL rookies when inputs mention line impact; camp darlings (R6–7/UDFA) when buzz repeats; else empty string",
  "activity_markdown": "markdown under ### Activity — new facts plus grounded inferences not fully covered in intro; do not parrot intro",
  "talk_markdown": "markdown under ### Talk — quotes and rumors with substance; label rumors in flags",
  "fantasy_markdown": "markdown starting with ### Fantasy lens — bullets only for players with today's news; no roster-wide filler",
  "footnotes": [{{"n": 1, "label": "\\"Quote or summary.\\" — Outlet / subreddit", "url": "https://..."}}],
  "tags": ["Fantasy", "Camp"],
  "flags": ["review:rumor"]
}}

Rules:
- Organic bullet count; never invent filler.
- Fantasy lens: only players tied to today's stories; no (QB1)/(RB2) labels; RB1 = starter, not handcuff.
- Do not add years_exp/veteran/rookie labels unless the story requires it (see Experience/years rule).
- Footnotes for factual claims from input stories only; use up to 6 distinct outlets when inputs provide them (each cluster has source_urls — spread citations across Reddit, podcasts, YouTube, beat reports). Do not invent facts from general football knowledge. Fewer footnotes is OK if only a few sources exist; never imply only three outlets exist if more source_urls are in the JSON.
- If no stories, set is_empty true and empty_reason.
- Skip stories already covered yesterday unless inputs show a material update.
"""


def _build_league_prompt(
    league_clusters: list[dict], issue_date: date, prior_context: str = ""
) -> str:
    context = json.dumps(league_clusters, indent=2) if league_clusters else "[]"
    return f"""Write the league-wide opening section for ScoutDNA: All 32 ({issue_date}).

Purpose: league-wide lens — stories that matter to the whole NFL or dominate the news cycle even if centered on one franchise.
GOOD topics: schedule release, rule changes, combine/draft calendar, league-wide OTA period, uniform rebrand, major policy, widespread transaction roundups, and BIG single-team stories with national traction (coaching scandals, league investigations, cheating allegations, commissioner involvement, franchise-altering front-office drama). Example: HC/reporter scandal coverage belongs here when inputs show league-wide buzz, not only in that team's section.
BAD topics (team sections only): routine camp reps, one player's workout clip, ordinary depth-chart chatter, fantasy stash hype for a single backup, highlight reels for one franchise.

Input (JSON) — only use these; may be empty:
{context}

{prior_context}

{STYLE_RULES}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "body": "2-4 sentences markdown; superscript citations ¹ ² in prose only",
  "footnotes": [{{"n": 1, "label": "\\"Summary.\\" — Outlet / r/nfl", "url": "https://..."}}]
}}

Rules:
- If inputs are empty or only routine team-camp noise, body is one sentence that OTAs/offseason continue league-wide; footnotes [].
- If inputs include a major scandal or league-office story tied to one team, lead with that — do not bury it because only one team is named.
- Do not list multiple teams' routine fantasy stories in this block.
- Do not repeat yesterday's league topics unless inputs show a new development.
- Max 4 footnotes.
"""


def compose_team_section(
    client: anthropic.Anthropic,
    team: Team,
    clusters: list[dict],
    issue_date: date,
    *,
    prior_context: str = "",
) -> dict:
    if not clusters:
        return {
            "intro_paragraphs": None,
            "rookie_paragraph": "No rookie-specific updates in the last 24 hours.",
            "activity_markdown": "_No verified updates in the last 24 hours._",
            "talk_markdown": "",
            "fantasy_markdown": "",
            "footnotes": [],
            "tags": [],
            "flags": ["empty:collector"],
            "is_empty": True,
            "empty_reason": "No items collected for this team in the window.",
        }

    msg = client.messages.create(
        model=MODEL,
        max_tokens=TEAM_MAX_TOKENS,
        messages=[
            {"role": "user", "content": _build_team_prompt(team, clusters, issue_date, prior_context)}
        ],
    )
    text = msg.content[0].text
    try:
        data = parse_compose_json(text)
    except json.JSONDecodeError:
        data = {
            "intro_paragraphs": None,
            "rookie_paragraph": "",
            "activity_markdown": "",
            "talk_markdown": "",
            "fantasy_markdown": "",
            "footnotes": [],
            "tags": ["needs-review"],
            "flags": ["parse:error"],
            "is_empty": False,
            "empty_reason": "Compose response was not valid JSON — re-run compose for this team.",
        }
    data.setdefault("is_empty", False)
    data.setdefault("flags", [])
    if (data.get("metadata") or {}).get("needs_review"):
        data["flags"].append("review:suggested")
    return data


def compose_league_section(
    client: anthropic.Anthropic,
    league_clusters: list[dict],
    issue_date: date,
    *,
    prior_context: str = "",
) -> dict:
    empty_body = (
        "No league-wide headlines in today's feed. Team sections below cover "
        "OTAs, depth charts, injuries, and roster moves for all 32 clubs."
    )
    if not league_clusters:
        return {"body": empty_body, "footnotes": []}
    msg = client.messages.create(
        model=MODEL,
        max_tokens=600,
        messages=[
            {"role": "user", "content": _build_league_prompt(league_clusters, issue_date, prior_context)}
        ],
    )
    text = msg.content[0].text
    try:
        data = parse_compose_json(text)
        return {
            "body": (data.get("body") or empty_body).strip(),
            "footnotes": data.get("footnotes") or [],
        }
    except json.JSONDecodeError:
        return {"body": text.strip(), "footnotes": []}


def compose_issue(
    teams: list[Team],
    clusters_by_slug: dict[str, list[dict]],
    league_clusters: list[dict],
    issue_date: date,
    *,
    prior_context: str = "",
) -> tuple[dict, list[dict]]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY required for compose")
    client = anthropic.Anthropic(api_key=api_key)

    league = compose_league_section(
        client, league_clusters, issue_date, prior_context=prior_context
    )

    sections: list[dict] = []
    sort = 0
    for _div, div_teams in division_groups(teams).items():
        for team in div_teams:
            sort += 1
            section = compose_team_section(
                client,
                team,
                clusters_by_slug.get(team.slug, []),
                issue_date,
                prior_context=prior_context,
            )
            section["sort_order"] = sort
            section["team_slug"] = team.slug
            sections.append(section)
    return league, sections
