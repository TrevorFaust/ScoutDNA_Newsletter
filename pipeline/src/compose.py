import json
import os
import re
from datetime import date

import anthropic

from .compose_context import load_compose_context
from .compose_json import parse_compose_json
from .season_context import load_season_context
from .teams import Team, division_groups

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
TEAM_MAX_TOKENS = int(os.getenv("COMPOSE_TEAM_MAX_TOKENS", "4096"))

QUIET_ACTIVITY = "### Activity\n\n- Quiet period; no verified camp or roster developments beyond the notes above."
QUIET_FANTASY = "### Fantasy lens\n\n- No fantasy-relevant developments beyond the notes above."

_DASH_RANGE_RE = re.compile(r"(?<=[\w])[—–](?=[\w])")
_DASH_ASIDE_RE = re.compile(r"\s+[—–]\s+")
# Stars already get UI badges. Keep (CB)/(RG) for lesser-known/non-skill names.
_SKILL_POS_PAREN_RE = re.compile(
    r"(\*\*[^*]+?\*\*)\s*\((?:QB|RB|WR|TE)(?:\d)?\)",
    re.I,
)
_PROSE_FIELDS = (
    "intro_paragraphs",
    "rookie_paragraph",
    "activity_markdown",
    "talk_markdown",
    "fantasy_markdown",
    "empty_reason",
    "body",
)


def strip_prose_dashes(text: str) -> str:
    """Em/en dashes never ship. Ranges become hyphens; asides become commas."""
    if not text:
        return text
    text = _DASH_RANGE_RE.sub("-", text)
    text = _DASH_ASIDE_RE.sub(", ", text)
    text = text.replace("—", ", ").replace("–", "-")
    return re.sub(r",\s*,+", ",", text)


def strip_star_position_parens(text: str) -> str:
    """Drop **Jordan Love** (QB) tags. Leave **Keisean Nixon** (CB) alone."""
    if not text:
        return text
    return _SKILL_POS_PAREN_RE.sub(r"\1", text)


_INTERNAL_FLAG_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\brb_rush_share\b", re.I), "RB rush share"),
    (re.compile(r"\brush_share\b", re.I), "rush share"),
    (re.compile(r"\btarget_share\b", re.I), "target share"),
    (re.compile(r"\bair_yards_share\b", re.I), "air yards share"),
    (re.compile(r"\btouch_share\b", re.I), "touch share"),
    (re.compile(r"\bsnap_pct\b", re.I), "snap share"),
    (re.compile(r"\bwr_target_split\b", re.I), "receiver target split"),
    (re.compile(r"\bsplit_backfield\b", re.I), "split backfield"),
    (re.compile(r"\bte_featured\b", re.I), "featured tight end usage"),
    (re.compile(r"\bfantasy_skill_depth\b", re.I), "fantasy depth chart"),
    (re.compile(r"\bskill_position_battles\b", re.I), "position battles"),
    (re.compile(r"\btarget_leader\b", re.I), "target leader"),
]

_SNAKE_LEAK_RE = re.compile(r"\b[a-z]+(?:_[a-z0-9]+)+\b")


def scrub_internal_flag_names(text: str) -> str:
    """Translate leaked snake_case field/flag names into plain English."""
    if not text:
        return text
    out = text
    for pat, repl in _INTERNAL_FLAG_REPLACEMENTS:
        out = pat.sub(repl, out)
    return out


_MD_TABLE_RE = re.compile(r"(?:\n|^)\|[^\n]*(?:\n\|[^\n]*)+", re.M)


def strip_markdown_tables(text: str) -> str:
    """Drop leaked markdown pipe tables; the site renders usage panels instead."""
    if not text or "|" not in text:
        return text
    cleaned = _MD_TABLE_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def find_internal_flag_leaks(text: str) -> list[str]:
    """Return leftover snake_case tokens that should never ship to readers."""
    if not text:
        return []
    return sorted({m.group(0) for m in _SNAKE_LEAK_RE.finditer(text)})


def _clean_prose(text: str) -> str:
    return scrub_internal_flag_names(
        strip_markdown_tables(strip_star_position_parens(strip_prose_dashes(text)))
    )


def _sanitize_footnotes(footnotes: object) -> object:
    if not isinstance(footnotes, list):
        return footnotes
    out: list = []
    for fn in footnotes:
        if isinstance(fn, dict) and isinstance(fn.get("label"), str):
            fn = {**fn, "label": _clean_prose(fn["label"])}
        out.append(fn)
    return out


def _sanitize_compose_text(data: dict) -> dict:
    for key in _PROSE_FIELDS:
        val = data.get(key)
        if isinstance(val, str):
            data[key] = _clean_prose(val)
    data["footnotes"] = _sanitize_footnotes(data.get("footnotes"))
    return data


STYLE_RULES = """
Writing style:
- Use normal sentences. NEVER use em dashes (—) or en dashes (–) anywhere in prose. Use commas, periods, colons, or parentheses instead. This is a hard ban.
- Never use square brackets for asides like [Inference: ...].
- Intro stays factual but not flat: lead with the game, name PPR when it matters, and let stakes land. Put fantasy points in the sentence itself (Allen dropped 40.8 fantasy points), never as a bare parenthetical dump like (Allen at 40.8 PPR). Put ALL dynasty/redraft angles in fantasy_markdown only (no "Fantasy take:" prefix).
- Pronouns (hard): NFL players, coaches, coordinators, and GMs are almost always men. Default to he/him/his. Never write she/her for a player or coach unless the source is clearly about a woman (usually a reporter). Tee Higgins, DeVonta Smith, Ja'Marr Chase, etc. are he.
- You may infer role/usage from coach quotes, injury exits, or camp buzz without saying "depth chart" every time. Do NOT invent play-by-play. If reporting names an early fumble, in-game exit, or inactive that explains a snap swing, use that; otherwise stick to box + injury/news. In a team section, do not name opposing defenders for a strip/fumble/tackle unless that opponent is the story; "lost a first-quarter fumble" is enough.
- Injury context (hard): when a quiet line or snap collapse is injury-driven, say so. Cover (a) pregame injury report / inactive / DNP, (b) in-game exit that changed usage, (c) postgame day-to-day / IR / miss-time follow-up. Prefer injury_status (ESPN board in compose context) and reporting; do not invent play-by-play. Missing from the box is not "unclear usage"; if inactive lists or reports say Out, write Out. Write timelines as full sentences (He is out indefinitely, and Marcus Mariota will start Week 3 against Seattle), not jammed parentheticals.
- Names: bold every player (including free agents / waiver claims), every coach/coordinator/GM, and named reporters when they are the source: **Aaron Rodgers**, **Germie Bernard**, **Mike McCarthy**, **Omar Khan**, **Adam Schefter**. Free agents stay players by position (e.g. free agent WR **Stefon Diggs**). Reporters are not players or coaches. The UI chips players by position, coaches in staff color, and media as Other. NEVER bold non-person phrases (no **QB battle**, **WR room**, **Fantasy lens**, **depth chart**). Position cues: skip them for obvious skill-position stars the registry will badge (no **Jordan Love** (QB), no QB **Josh Allen**). For lesser-known players, OL/DEF/specialists, and new adds, put a short cue: CB **Keisean Nixon**, RG **Anthony Belton**, or **Keisean Nixon** (CB). Never write (QB1), (RB2), (WR3).
- Experience/years: player_experience in context is for accuracy only ,  do NOT label every player. Default: name + position only. Say rookie only for true rookies (years_exp=0) when it matters to the story. Say second-year only when the piece is about year-two breakout/development. Say veteran or career length only for outliers (e.g. 15+ year QB on a short deal) and at most once per player per section. Never repeat "22-year veteran" for the same QB daily. Wrong labels forbidden: years_exp=1 is second year, not first year.
- Venues: never invent or mash stadium names (no "Paul Chase Brown Stadium"). Prefer "training camp" / "padded practices" unless the input states the current official venue.
- Franchise names: never mash a player into a team name. If a player's last name matches a city (Washington, Houston, Dallas), write the franchise in full (Washington Commanders) and keep the player separate. Never write "Malik Washington Commanders" when you mean the Commanders.
- Last-name collisions: if a source says only "Higgins" (or any shared last name), resolve it against THIS team's skill_roster / fantasy_skill_depth / name_collisions. Houston Higgins is Jayden Higgins (HOU WR), never Tee Higgins (CIN WR). Never assign a namesake from another club.
- Unnamed players: if a report does not name the player ("a veteran Super Bowl-winning safety"), omit the story. Do not invent a name and do not keep the anonymous blurb.
- Titles in bold: write DC **Al Golden**, OC **Matt Nagy**, RB **LeQuint Allen Jr.** (title outside the stars). Never **DC Al Golden's** or **OC Matt Nagy** as a single bold span.
- Depth labels MUST match fantasy_skill_depth before you write WR2/WR3/RB1 etc. If Pittman is WR2 and Wilson is WR4 in fantasy_skill_depth, do not say Wilson is ahead of Pittman "at WR3." When a team's published camp depth chart differs from fantasy_skill_depth, say that explicitly ("camp depth chart listed X ahead of Y") and keep the curated ranks straight.
- rookie_paragraph: REG/POST weekly editions return empty string "". Fold any rookie game impact into intro or fantasy. Preseason/camp daily editions may still cover skill/OL rookies and repeating camp darlings (R6-7/UDFA buzz). Never invent draft capital; use draft_capital_2026 (never round 0). Never dump the full draft class.
- skill_position_battles + fantasy_skill_depth: skill_position_battles is background for which slots are up for grabs (QB/RB/WR/TE). Mention a battle only when today's inputs discuss that player, role, or competition ,  or one brief orienting clause where it helps (not a full depth-chart recap). status=contested → name relevant candidates when news touches that battle; status=open → frame as unclear alpha/slot; status=settled → do not invent competition. Named settled complements still belong in the starter's fantasy so-what when the note says they were signed/kept as a complement (e.g. Gainwell behind Irving). Season-ending / IR: drop that player from live contested mix. Do not write them as WR1 "also in the mix." Mention once as who inherits snaps (Ricky Pearsall is out for 2026; SF WR1 is Evans vs Stribling). Slot labels cascade: losers from a contested/open battle fill the next depth slot implicitly (note often says "losers slot WR3") ,  gaps in numbering are intentional (e.g. NYG WR2 battle then WR4 bubble means WR3 is cascade fallout, not a separate camp fight). Only treat a lower slot as its own battle when candidates[] adds players not already fighting above. Examples: PIT WR3 contested (Bernard vs Wilson); MIA WR1 open; DEN WR1 contested Sutton vs Waddle with WR3 fight below. fantasy_skill_depth shows depth-chart order only ,  it does not define which slot is contested. When camp news hits a position, use battles + depth together; never crown a winner without source support.
- Never tell readers to draft or stash individual OL, DL, LB, CB, S, nickel, or any IDP role. Never write "IDP-relevant," "IDP leagues," or individual defensive draft stock. Nickel is a coverage/sub-package DB ,  same as CB/S for fantasy (not draftable). Team DEF is the only defensive fantasy asset. When you mention it, give it a tier vs the rest of the league (elite / high / mid / streamer / avoid) from team_stats_2025 ranks plus sos_2026. Elite 2025 units (roughly top 8 in yards or points allowed) are worth an earlier pick even if they still go late in many drafts; say that. Do not flatten every good defense into "late-round asset worth consideration" with no urgency. Occasional note that a starter injury softens team DEF early is OK; do not treat defenders as draftable players.
- OL news belongs in the section when inputs mention it: first-round picks, starting-guard/tackle competition, notable camp reps, or coordinator/HC comments on the front. Keep it brief in intro/rookie_paragraph/activity; put fantasy impact in fantasy_markdown (RB rushing environment, QB time-to-throw, fewer sacks ,  tie to named skill players when possible). depth_chart_ol_def and draft_capital_2026 help fact-check OL names and round.
- DL/LB/DB news: frame impact on team run/pass game or team DEF quality, not individual IDP value. DEF camp darlings only when inputs repeat the same name or describe a unit trend.
- Use team_stats_2025 ranks when relevant (e.g. "2025 run-block rank 3", "def yards allowed rank 1") to add context for OL/DEF unit stories.
- coaching_2026: use HC/OC/DC/GM names and titles from the block. Jesse Minter is HC in Baltimore, not DC. GM (e.g. Omar Khan, Howie Roseman) owns trades, contracts, and draft capital moves. HC is usually offense- or defense-minded: an offensive HC (e.g. Mike McCarthy) works closely with the OC (Brian Angelichio) on scheme and usage; the DC (Patrick Graham) runs the defense with less HC sway. A defensive-minded HC mirrors that on the other side. Reference this hierarchy when news involves scheme, trades, or coordinator quotes ,  not every paragraph.
- Uniform section shape: Daily/camp: intro_paragraphs + activity_markdown + fantasy_markdown. REG/POST weekly: intro_paragraphs + fantasy_markdown only; activity_markdown and rookie_paragraph are empty strings "". No separate Talk section. Never omit Fantasy for one team and keep it for another.
- intro_paragraphs: narrative arc for the day's/week's biggest beats. Depth and reasoning live here. In REG, open with fantasy impact (PPR, who won/lost matchups when a star went off on TNF/MNF) when the number earns it.
- activity_markdown: Daily/camp only. ### Activity bullets with NEW facts, quotes, injury timelines. REG/POST weekly: always "". Fold earned quotes into intro; do not parrot.
- talk_markdown: ALWAYS return an empty string "". Do not write a ### Talk section.
- fantasy_markdown: ### Fantasy lens ALWAYS present. Implication bullets with zest: name PPR, matchup stakes (TNF crushing Sunday lineups; MNF saving or ruining nights), and next-week outlook. Do not restatedry box scores. Skip settled-starter/no-news filler. If battles name a settled complement (Gainwell behind Irving), keep that name in the RB1 so-what. When OL or trench news is in inputs, at most one bullet on how the line affects fantasy ,  never recommend drafting an individual lineman. Never label depth in parentheses like (QB1), (RB2), (WR3). Do not tag household skill names with (QB)/(RB)/(WR)/(TE). Cues like (CB) or (RG) are fine for lesser-known or non-skill names. Use natural prose when role matters. RB1 is the starter; RB2/RB3 are backups/handcuffs. Quiet day/week = one honest bullet that there were no fantasy-relevant updates.
- Committee / usage table: NEVER paste markdown pipe tables into fantasy_markdown. The site renders a Week usage panel (RB/WR/TE toggle) from player_week_usage under each team. In prose, just describe the split; do not build a table.
- Dual-threat fill-in QBs (e.g. Malik Willis): do NOT call them low-ceiling. Sparse full-game samples with rushing spike weeks are boom-or-bust (high ceiling, low floor, unproven week to week). If you lack those game logs in context, say unproven and volatile rather than assigning a low ceiling.
- Beat budget: a story appears in at most TWO of {intro, activity, fantasy} on daily/camp; REG weekly prefers intro+fantasy only (no Activity). Bubble WR5/retirement/depth noise gets ONE mention max.
- Preseason games: account for who started, who sat, injuries, and first-team notes from reporting. Do NOT treat the PRE box as a workload study or a new depth chart. Starters often play a series or do not play at all; a handful of carries or targets for a locked-in starter is warmup, not a split. Backups and camp bodies pad snaps; their leftover target/rush shares are not "winning the job" without coach naming, first-team reps, or depth-chart movement. Skip unnamed 4th-string splash stats.
- skill_usage (when present): cite only those numbers. Never invent shares, yards, or snaps. Skip 80/20 RB rooms. Regular-season flags (split_backfield, target_leader) do not apply to PRE. Never paste internal flag or snake_case names into prose (no rb_rush_share, wr_target_split, split_backfield, te_featured, fantasy_skill_depth, skill_position_battles, snap_pct); translate into plain English ("67 percent of RB rush share").
- PRE skill_usage: prefer one proof line over a recap.
- REG/POST skill_usage + latest_game / game_box: the week's game is the lead. Named players do not need a stat line on every mention. Put the number in only when it earns its place in the sentence (volume, a quiet night, a spike, a committee split). Never invent. When a line helps: WR/TE catches and yards, plus snap_pct as the usage proxy (routes-run is not in this dataset). RB carries/yards plus snap_pct and rb_rush_share when the backfield is split (4 carries vs 12 is 25% of the work). QB passing yards (attempts/TDs/INTs as needed) plus rushing yards when it matters. PPR in game_box.skill is the fantasy score. After a line, one short insight: why it was good, quiet, or disappointing. Team DEF is at most one short beat from latest_game (points allowed, yards allowed, turnovers). Parenthetical counting stats stay Arabic numerals (targets (6), yards (83)); never footnote-superscript those counts.
- PRE storyline cites (do this): when news already names a player's preseason game, add 1-2 counting stats from skill_usage on that same player (4 catches for 51 yards, 153 yards and 2 TDs on 13 attempts). Target share is optional color on that named player ("16% of Pittsburgh's targets while the WR1s sat"), not a job verdict. Pass_attempts / snaps remain the closer on will-he-play previews.
- PRE storyline cites (do not): invent rec/yds/TD lines; crown WR3/RB2 from a camp-body share lead; treat Chase Brown / Breece Hall warmup carries as a committee.
- Play/sit follow-up (hard, every named player on every team): if a coach or report said someone will play / may start / is confirmed for this week's preseason game, and skill_usage or play_sit_payoffs has that player's box, you MUST close with how they actually did. Cite 1-2 counting stats. Never leave the week-in-review in future tense ("will play," "confirmed to play," "wants to play") after the game. This includes backups and rookies (Ty Simpson), not just stars. A warmup series is still the closer; do not skip it because the job is settled.
- Same-week follow-up (hard): if a story earlier in the week implied a later event in the same week (will play Saturday, expected back Thursday, start the opener, injury to be evaluated), close the loop when later inputs or skill_usage show what happened. Fold setup + payoff into ONE beat. Example: he wanted to play the opener for timing; then he played N snaps / N pass attempts (or sat / left after the drives a source names). Do not leave the setup hanging as if the later event has not occurred. Do not invent snaps, attempts, or drive counts.
- In fantasy_markdown only: do not use parenthetical depth slots or years_exp; avoid veteran/year labels unless the bullet is about experience/development.
- Do not write podcast meta (host departures, episode titles, Ring of Honor ballots) unless tied to named NFL/fantasy news.
- In prose, cite with superscripts only; footnote label can name outlet. Do not write "per Locked On X" in the body.
- Citations in prose: end the sentence with Unicode superscript only (¹ ² ³) matching footnotes[].n. Example: "Yes. This is it," Rodgers said Wednesday, per ESPN and r/steelers.¹ Never use [1], [2], or bracketed reference numbers. Never put footnote superscripts on counting stats (targets (6) stays Arabic).
- footnotes[].label must be a readable citation line (quote or paraphrase + outlet), NOT just "ESPN". Example label: "\\"Yes. This is it.\\" ,  Rodgers, Wednesday media availability, ESPN / r/steelers"
- Do not tuck long asides in parentheses; use a new sentence instead.
- Past-season games/playoffs: only use Season context or input JSON; label the year (e.g. 2025 Wild Card vs Texans).
- Released players: do NOT mention departed players unless discussing their replacement or fantasy impact on incumbents (no fan nostalgia, no "fans sad" bullets). Example: skip last year's departed back unless tying to the current room (PIT: the live fight behind Warren is Dowdle vs Johnson). Kenneth Gainwell is Tampa's RB2, signed as Bucky Irving's complement; mention him there, never as a Pittsburgh leftover.
- Veteran QB on short deal (e.g. Rodgers): dynasty angle is which backup/young QB inherits the room after he leaves and mentorship path, NOT "avoid investing in the veteran past 2026."
- Roster moves: note replacement/competition when fantasy-relevant and news-backed.
- Team DEF fantasy: rank the unit when you mention it. Elite 2025 defenses with intact cores are earlier-round DEF targets, not vague late-round fliers. Good defense + easier SOS is the preferred anchor case; note the combo when you draft a DEF take. Easy SOS alone does not save a bad defense.
"""


def normalize_composed_section(data: dict) -> dict:
    """Enforce uniform Intro/Activity/Fantasy; fold leftover Talk into Activity."""
    talk = (data.get("talk_markdown") or "").strip()
    activity = (data.get("activity_markdown") or "").strip()
    fantasy = (data.get("fantasy_markdown") or "").strip()

    if talk:
        talk_body = re.sub(
            r"^#{1,6}\s*Talk\s*\n?", "", talk, flags=re.IGNORECASE
        ).strip()
        if talk_body:
            if not activity:
                activity = f"### Activity\n\n{talk_body}"
            else:
                activity = f"{activity.rstrip()}\n{talk_body}"

    if activity and not re.match(r"^#{1,6}\s*Activity\b", activity, re.I):
        activity = f"### Activity\n\n{activity}"
    if fantasy and not re.match(r"^#{1,6}\s*Fantasy lens\b", fantasy, re.I):
        fantasy = f"### Fantasy lens\n\n{fantasy}"

    if not data.get("is_empty"):
        if not activity:
            activity = QUIET_ACTIVITY
        if not fantasy:
            fantasy = QUIET_FANTASY
    else:
        if not activity:
            activity = "_No verified updates in the last 24 hours._"
        if not fantasy:
            fantasy = QUIET_FANTASY

    data["talk_markdown"] = ""
    data["activity_markdown"] = activity
    data["fantasy_markdown"] = fantasy
    return _sanitize_compose_text(data)


def normalize_composed_section_weekly(data: dict) -> dict:
    """REG/POST weekly: intro + Fantasy only. Drop Activity and Rookie notes."""
    fantasy = (data.get("fantasy_markdown") or "").strip()
    if fantasy and not re.match(r"^#{1,6}\s*Fantasy lens\b", fantasy, re.I):
        fantasy = f"### Fantasy lens\n\n{fantasy}"
    if not fantasy:
        fantasy = QUIET_FANTASY

    data["talk_markdown"] = ""
    data["activity_markdown"] = ""
    data["rookie_paragraph"] = ""
    data["fantasy_markdown"] = fantasy
    return _sanitize_compose_text(data)


def _build_team_prompt(
    team: Team, clusters: list[dict], issue_date: date, prior_context: str = ""
) -> str:
    stories = clusters[:12]
    context = json.dumps(stories, indent=2) if stories else "[]"
    season = load_season_context(team.slug)
    season_block = (
        json.dumps(season, indent=2)
        if season
        else "None ,  only cite past games if in input stories; do not guess opponents."
    )
    db_context = load_compose_context(team)
    db_block = db_context if db_context else "None ,  use input stories only for player positions."
    return f"""Write the {team.name} section for ScoutDNA: All 32 ,  a fantasy-focused NFL daily newsletter.
Issue date: {issue_date} (today's edition; prioritize news from the last 24h in inputs).

Team tier: {team.narrative_tier}. Audience: dynasty and redraft fantasy players. Concise, grounded, light personality OK.

{db_block}

Season context (authoritative for past seasons and playoff results):
{season_block}

Input stories (JSON) ,  each cluster may include source_urls and raw_titles from multiple collected items (Reddit, podcasts, YouTube). Facts and citations must come from here plus season/team context; not from general memory.
{context}

{prior_context}

{STYLE_RULES}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "intro_paragraphs": "1-2 short paragraphs (markdown; bold all player and coach names; superscript citations ¹ ²; news only)",
  "rookie_paragraph": "skill rookies with news first; OL rookies when inputs mention line impact; camp darlings (R6-7/UDFA) when buzz repeats; else empty string",
  "activity_markdown": "markdown under ### Activity: new facts, quotes, and rumor beats not already in intro; do not parrot intro",
  "talk_markdown": "",
  "fantasy_markdown": "markdown starting with ### Fantasy lens: implication bullets only; always present",
  "footnotes": [{{"n": 1, "label": "\\"Quote or summary.\\" ,  Outlet / subreddit", "url": "https://..."}}],
  "tags": ["Fantasy", "Camp"],
  "flags": ["review:rumor"]
}}

Rules:
- Organic bullet count; never invent filler. talk_markdown must be "".
- Every team returns intro + activity + fantasy (uniform). Quiet stubs OK.
- Fantasy lens: only implication/so-what for today's stories; no (QB1)/(RB2) labels; RB1 = starter, not handcuff.
- Do not add years_exp/veteran/rookie labels unless the story requires it (see Experience/years rule).
- Footnotes for factual claims from input stories only; use up to 6 distinct outlets when inputs provide them (each cluster has source_urls ,  spread citations across Reddit, podcasts, YouTube, beat reports). Do not invent facts from general football knowledge. Fewer footnotes is OK if only a few sources exist; never imply only three outlets exist if more source_urls are in the JSON.
- If no stories, set is_empty true and empty_reason.
- Skip stories already covered yesterday unless inputs show a material update or a same-week payoff (the game happened, the player returned, the decision landed). Then write the follow-up, not a rehash of the original quote.
"""


def _build_league_prompt(
    league_clusters: list[dict], issue_date: date, prior_context: str = ""
) -> str:
    context = json.dumps(league_clusters, indent=2) if league_clusters else "[]"
    return f"""Write the league-wide opening section for ScoutDNA: All 32 ({issue_date}).

Purpose: league-wide lens ,  stories that matter to the whole NFL or dominate the news cycle even if centered on one franchise.
GOOD topics: schedule release, rule changes, combine/draft calendar, league-wide OTA period, uniform rebrand, major policy, widespread transaction roundups, and BIG single-team stories with national traction (coaching scandals, league investigations, cheating allegations, commissioner involvement, franchise-altering front-office drama). Example: HC/reporter scandal coverage belongs here when inputs show league-wide buzz, not only in that team's section.
BAD topics (team sections only): routine camp reps, one player's workout clip, ordinary depth-chart chatter, fantasy stash hype for a single backup, highlight reels for one franchise.

Input (JSON) ,  only use these; may be empty:
{context}

{prior_context}

{STYLE_RULES}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "body": "2-4 sentences markdown; superscript citations ¹ ² in prose only",
  "footnotes": [{{"n": 1, "label": "\\"Summary.\\" ,  Outlet / r/nfl", "url": "https://..."}}]
}}

Rules:
- If inputs are empty or only routine team-camp noise, body is one sentence that OTAs/offseason continue league-wide; footnotes [].
- If inputs include a major scandal or league-office story tied to one team, lead with that ,  do not bury it because only one team is named.
- Do not list multiple teams' routine fantasy stories in this block.
- Do not repeat yesterday's league topics unless inputs show a new development.
- Max 4 footnotes.
"""


WEEKLY_STYLE_ADDENDUM = """
Weekly recap rules (override daily "last 24h" where they conflict):
- This is a WEEK N RECAP for the Tue-Mon Pacific window (Thursday-Monday games, plus Tue/Wed news). Synthesize the week's arc; do NOT write day-by-day chronology. Shorter and less speculative than camp/preseason copy.
- REG/POST story (hard): lead with who scored fantasy points, how many (PPR from game_box.skill), and the outlook. Write with zest, not a wire. A 40-PPR TNF night should feel like it decided matchups before Sunday; an MNF spike should feel like it saved or ruined Monday nights. The game is the story. Do not write camp position-battle copy as the lead once a regular-season box exists. 3rd/4th-string or bubble players are not the main story. If one played a meaningful snap share and got real work (catches, carries, a score), one short flyer to keep an eye on is enough.
- REG injuries (hard): inactive / DNP / in-game exit / day-to-day / IR belong in the same beat as the quiet line. Never describe an inactive as "unclear usage." Prefer injury_status notes (and topic_clusters) over inventing play-by-play.
- topic_clusters include day_count (how many distinct days the story appeared). Higher day_count = more prominent unless the week's game from game_box is the bigger story.
- game_box (when present): authoritative box for this club's latest completed game. REG/POST: lead the intro with that game. Named players do not need a counting line on every mention; use game_box.skill.line, snap_pct, rb_rush_share, and ppr when the number helps the beat. Never invent.
- game_box.game: opponent, score, home/away, yards allowed, turnovers. Team DEF gets at most one short beat from those numbers. Do not invent a score.
- Merge duplicate stories into ONE narrative beat. Never restate the same injury, quote, or rumor on separate days.
- Same-week follow-up (hard): when an earlier cluster previewed a later event (will play, expected back, start/sit, injury to be evaluated) and a later cluster or skill_usage shows the result, fold them into ONE beat. Setup then payoff. Do not leave midweek quotes hanging as if the game has not happened.
- play_sit_payoffs / story_arcs (when present): close the loop. In REG, the closer is how they actually scored or were used, not a camp verdict. Never stop at the preview. Never leave "will play" after the box exists.
- story_arcs (when present): each row is a player with an earlier setup and a later outcome. Write those as one sentence or bullet. Prefer the later fact as the closer.
- Tense: this week is over. Monday Night Football is in this window.
- Preseason games that happened this week are the payoff for "will starters play?" previews. Cover who started, who sat, who left, and injuries from those recaps. Do not skip the game because a midweek quote already mentioned it.
- Uniform shape for REG/POST weekly: intro + ### Fantasy lens only. activity_markdown "" and rookie_paragraph "". talk_markdown always "".
- Keep substantive coach/player quotes (starter naming, injury status, role clarity) by folding them into the intro. Do not create Activity or Talk blocks in weekly REG.
- Intro vs Fantasy: each major beat in at most both. Fantasy = implication, PPR stakes, and outlook (do not restate the box).
- Target length: 1-2 tight intro paragraphs + short Fantasy. Quiet week = shorter is OK; never pad.
- Every team returns intro + fantasy. If the week was quiet, still return an honest short Fantasy stub.
- If the week included preseason games, cover who started, who sat, injuries, and first-team depth notes. When the week's reporting already names a player's game, add 1-2 counting stats from skill_usage for that player. Do not recap leftover camp-body box-score leaders or invent committees.
- footnotes: reuse source_urls from topic_clusters when citing; up to 6 distinct sources.
- fantasy_markdown: week-level implication and next-week outlook only; always present; skip settled-TE/no-news filler.
"""


def _build_team_weekly_prompt(
    team: Team,
    weekly_input: dict,
    issue_date: date,
    prior_context: str = "",
) -> str:
    context = json.dumps(weekly_input, indent=2)
    season = load_season_context(team.slug)
    season_block = (
        json.dumps(season, indent=2)
        if season
        else "None ,  only cite past games if in input stories; do not guess opponents."
    )
    db_context = load_compose_context(team)
    db_block = db_context if db_context else "None ,  use input stories only for player positions."
    from .weekly_window import week_label

    return f"""Write the {team.name} section for ScoutDNA: All 32, {week_label(issue_date)}.
Issue date: {issue_date} (Tuesday weekly cover). Week covered: {week_label(issue_date)} (Tue-Mon PT so Thursday-Monday games are in).

Team tier: {team.narrative_tier}. Audience: dynasty and redraft fantasy players. Concise, grounded, slightly shorter than camp recaps. Personality and zest OK: make big PPR nights and injury swings feel like they mattered to managers.

{db_block}

Season context (authoritative for past seasons and playoff results):
{season_block}

Weekly input (JSON):
- game_box: this club's latest completed game (score, opponent) plus named skill rows (line, ppr, snap_pct, rb_rush_share). REG/POST: source of truth for the game. Use those numbers when they help the story; never invent yards, catches, snaps, or shares.
- injury_status: ESPN injury board for this team's skill players (status, injury, return_date, note). Explain quiet lines, DNP/inactive, in-game exits, and next-week availability from these rows. Out/Doubtful is not unclear usage. Do not dump the full list.
- topic_clusters: this team's stories collected across the full Tue-Mon week, deduped by topic. day_count = number of distinct days that story was reported this week ,  higher day_count means a more prominent, recurring beat; lead with those unless the game is the bigger story.
- story_arcs: when present, earlier preview/injury clusters paired with later outcomes for the same player. Close those loops. Do not invent facts that are not in clusters, story_arcs, play_sit_payoffs, game_box, or skill_usage.
- play_sit_payoffs: when present, named players previewed to play/start who now have a skill_usage line. Close the loop. In REG, name how they scored or were used. Never leave "will play" / "confirmed to play" in a week that already has the game.

{context}

{prior_context}

{STYLE_RULES}

{WEEKLY_STYLE_ADDENDUM}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "intro_paragraphs": "1-2 paragraphs ,  week's biggest beats with PPR stakes; bold names; superscript citations",
  "rookie_paragraph": "",
  "activity_markdown": "",
  "talk_markdown": "",
  "fantasy_markdown": "markdown under ### Fantasy lens: week-level implication bullets; always present; never markdown tables",
  "footnotes": [{{"n": 1, "label": "\\"Quote or summary.\\" ,  Outlet", "url": "https://..."}}],
  "tags": ["Fantasy", "Weekly"],
  "flags": ["review:rumor"]
}}

Rules:
- Organic bullet count; never invent filler. talk_markdown, activity_markdown, and rookie_paragraph must be "".
- Every team returns intro + fantasy (uniform). Quiet Fantasy stub OK.
- Never paste snake_case field names (rb_rush_share etc.); write plain English.
- Default he/him for players and coaches.
- If topic_clusters is sparse, write the shortest honest section from whatever exists.
- is_empty true ONLY if absolutely no usable input exists (rare).
"""


def _build_league_weekly_prompt(
    league_input: dict, issue_date: date, prior_context: str = ""
) -> str:
    context = json.dumps(league_input, indent=2)
    from .weekly_window import week_label

    return f"""Write the league-wide opening for ScoutDNA: All 32, {week_label(issue_date)} ({issue_date}).
Week covered: {week_label(issue_date)} (Tue-Mon PT).

Purpose: national stories that dominated the NFL week ,  scandals, league office, schedule, major franchise arcs with national traction.
Use topic_clusters day_count to prioritize recurring league-wide themes. Merge duplicates; do not list daily repeats.

Input (JSON):
{context}

{prior_context}

{STYLE_RULES}

{WEEKLY_STYLE_ADDENDUM}

Return a single JSON object only (no markdown fences, no preamble, no duplicate JSON blocks):
{{
  "body": "2-5 sentences markdown ,  week's league headlines; superscript citations",
  "footnotes": [{{"n": 1, "label": "\\"Summary.\\" ,  Outlet", "url": "https://..."}}]
}}

Rules:
- If inputs sparse, one sentence on offseason league rhythm; footnotes [].
- Max 5 footnotes.
"""


def compose_team_section_weekly(
    client: anthropic.Anthropic,
    team: Team,
    weekly_input: dict,
    issue_date: date,
    *,
    prior_context: str = "",
) -> dict:
    if not weekly_input.get("topic_clusters"):
        return normalize_composed_section_weekly(
            {
                "intro_paragraphs": None,
                "rookie_paragraph": "",
                "activity_markdown": "",
                "talk_markdown": "",
                "fantasy_markdown": QUIET_FANTASY,
                "footnotes": [],
                "tags": ["Weekly"],
                "flags": ["empty:weekly-input"],
                "is_empty": True,
                "empty_reason": "No raw items collected for this team in the week window.",
            }
        )

    prompt = _build_team_weekly_prompt(
        team, weekly_input, issue_date, prior_context
    )
    text = ""
    data: dict | None = None
    for attempt in range(2):
        msg = client.messages.create(
            model=MODEL,
            max_tokens=TEAM_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text
        try:
            data = parse_compose_json(text)
            break
        except json.JSONDecodeError:
            if attempt == 0:
                continue
            data = {
                "intro_paragraphs": None,
                "rookie_paragraph": "",
                "activity_markdown": "",
                "talk_markdown": "",
                "fantasy_markdown": "",
                "footnotes": [],
                "tags": ["needs-review", "Weekly"],
                "flags": ["parse:error"],
                "is_empty": False,
                "empty_reason": "Compose response was not valid JSON — re-run weekly compose.",
            }
    assert data is not None
    data.setdefault("is_empty", False)
    data.setdefault("flags", [])
    tags = list(data.get("tags") or [])
    if "Weekly" not in tags:
        tags.append("Weekly")
    data["tags"] = tags
    return normalize_composed_section_weekly(data)
    return {
        "body": _clean_prose(body),
        "footnotes": _sanitize_footnotes(footnotes),
    }


def compose_league_section_weekly(
    client: anthropic.Anthropic,
    league_input: dict,
    issue_date: date,
    *,
    prior_context: str = "",
) -> dict:
    empty_body = (
        "No league-wide headlines dominated the week. Team sections below recap "
        "the games, injuries, and roster moves for all 32 clubs."
    )
    if not league_input.get("topic_clusters"):
        return _sanitize_league(empty_body, [])
    msg = client.messages.create(
        model=MODEL,
        max_tokens=800,
        messages=[
            {
                "role": "user",
                "content": _build_league_weekly_prompt(
                    league_input, issue_date, prior_context
                ),
            }
        ],
    )
    text = msg.content[0].text
    try:
        data = parse_compose_json(text)
        return _sanitize_league(
            (data.get("body") or empty_body).strip(),
            data.get("footnotes") or [],
        )
    except json.JSONDecodeError:
        return _sanitize_league(text.strip(), [])


def compose_issue_weekly(
    teams: list[Team],
    weekly_issue_date: date,
    slug_to_id: dict[str, str],
    *,
    prior_context: str = "",
) -> tuple[dict, list[dict]]:
    from .weekly_input import build_league_weekly_input, build_team_weekly_input

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY required for compose")
    client = anthropic.Anthropic(api_key=api_key)

    league_input = build_league_weekly_input(weekly_issue_date, slug_to_id)
    league = compose_league_section_weekly(
        client, league_input, weekly_issue_date, prior_context=prior_context
    )

    sections: list[dict] = []
    sort = 0
    for _div, div_teams in division_groups(teams).items():
        for team in div_teams:
            sort += 1
            team_input = build_team_weekly_input(
                team, weekly_issue_date, teams, slug_to_id
            )
            section = compose_team_section_weekly(
                client,
                team,
                team_input,
                weekly_issue_date,
                prior_context=prior_context,
            )
            section["sort_order"] = sort
            section["team_slug"] = team.slug
            sections.append(section)
    return league, sections


def compose_team_section(
    client: anthropic.Anthropic,
    team: Team,
    clusters: list[dict],
    issue_date: date,
    *,
    prior_context: str = "",
) -> dict:
    if not clusters:
        return normalize_composed_section(
            {
                "intro_paragraphs": None,
                "rookie_paragraph": "No rookie-specific updates in the last 24 hours.",
                "activity_markdown": "_No verified updates in the last 24 hours._",
                "talk_markdown": "",
                "fantasy_markdown": QUIET_FANTASY,
                "footnotes": [],
                "tags": [],
                "flags": ["empty:collector"],
                "is_empty": True,
                "empty_reason": "No items collected for this team in the window.",
            }
        )

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
    return normalize_composed_section(data)


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
        return _sanitize_league(empty_body, [])
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
        return _sanitize_league(
            (data.get("body") or empty_body).strip(),
            data.get("footnotes") or [],
        )
    except json.JSONDecodeError:
        return _sanitize_league(text.strip(), [])


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
