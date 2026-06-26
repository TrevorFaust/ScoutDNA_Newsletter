# Podcast RSS — what it is

**Not** the Apple Podcasts or Spotify **page link** you click to listen.

**RSS** is a machine-readable **feed URL** (XML) that lists every episode with title, date, description, and often an audio link. The pipeline polls it daily — same idea as ESPN RSS today.

## Example

| What you have | What ingest needs |
|---------------|-------------------|
| `https://podcasts.apple.com/us/podcast/locked-on-steelers/id123...` | Web page (not enough) |
| `https://feeds.simplecast.com/abc123...` | RSS feed (this is what we store) |

## How to find RSS

1. **Apple Podcasts** — open the show → copy link → paste into [getrssfeed.com](https://getrssfeed.com) or similar.
2. **Spotify** — check the pod’s website; many hosts publish the same RSS link.
3. **Show website** — Locked On, Megaphone, Simplecast pages often expose the feed URL.

## In this repo

`data/podcasts_registry.csv`:

- `podcast_name` — what you already provided
- `rss_url` — fill in when you have it (Steelers pilot first is fine)
- `notes` — your descriptions

When `rss_url` is set, collect can pull **new episodes** (title + show notes) without Whisper. Overlap with YouTube is OK — compose merges by topic.

You do **not** need RSS for every pod immediately. Priority: official team pods + top 1–2 beat pods per team.
