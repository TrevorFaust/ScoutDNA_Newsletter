# NFL Fantasy Newsletter — Product Spec (v1)

## Brand

Parent site: **DraftDNA**. Newsletter product name TBD (see README naming options). URL slugs follow chosen name (e.g. `/gridiron-helix/2026-05-19`).

## Delivery

- **Web**: Standalone Next.js app (v1); embed into DraftDNA later.
- **Email**: Resend + subscriber rows in Supabase (Phase 2 send).
- **Publish**: Collect ~8:00 AM PT → review → approve → publish/send by **10:00 AM PT** (hold if not approved).
- **Window**: Prior calendar day (~24h) in `America/Los_Angeles`.

## Cadence

| Day | Issue |
|-----|--------|
| Tue–Sun | Daily |
| Mon | Weekly rollup only (replaces daily) |

## Audience & voice

- Fantasy-first; depth charts, injuries, camp battles, rookie impact.
- Tags: `[Fantasy]`, `[Rumor]`, `[NFL]`, `[Injury]`, `[Camp]`, etc.
- 1–2 paragraphs per team + subheaders + organic bullets (target 5–10, no fluff).
- Rookies: dedicated paragraph (drafted + UDFA).
- Footnotes for sources; cohesive prose (not choppy "via X").
- Never publish unverified injuries; rumors flagged for review.
- Corrections in next issue only.

## Structure

1. **League-wide** — short, high-signal block.
2. **TOC** — teams grouped by division (AFC/NFC → East/North/South/West).
3. **32 team sections** — Activity (trades, injuries, camp) + Talk (rumors, quotes).
4. Trades appear on **both** teams.

## Personalization

- Subscriber `favorite_team_slug` → web/email link includes `#buffalo-bills`.
- No favorite team → top of issue.

## Sources (v1)

- Reddit (team subs + r/nfl), RSS, mod-pinned / quality flairs boosted.
- Twitter/X deferred (budget TBD).
- Podcast/YouTube Phase 3.

## Data (Supabase)

- `raw_items` → dedupe → `story_clusters` → compose → `newsletter_issues` + `newsletter_sections`.
- Unpublished/raw archive retained for rumor tracking.
- New issue per day; no overwrite of published issues.

## Review

- Auto-draft → admin review UI → flag low-confidence → approve → publish.
- Pipeline run log + alert on failures or zero items.

## Tech

- Python pipeline (`pipeline/`)
- Supabase (`supabase/migrations/`)
- Next.js web (`web/`)
- GitHub Actions for scheduled collect (PC cron OK for local dev)
