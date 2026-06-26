# Locked On + Chat Sports coverage (from your YouTube CSV)

## Jaguars & Chargers (clarification)

Your **saved CSV counts are correct**:

| Team | Channels in `youtube_sources.csv` |
|------|-----------------------------------|
| **Jaguars** | **3** — `@LockedOnJaguars`, `@UCF_Jaguar`, `@jaguars` |
| **Chargers** | **7** — `@Chargers`, `@LockedOnChargers`, `@ChargerChatPodcast`, `@BoltBrosPodcast`, `@ChargersUnleashed`, `@TheDirectorChargers`, `@guiltyascharged7752` |

Earlier notes about “empty cells” referred to **blank cells in row 5–6 of the spreadsheet grid** (some teams had gaps on those rows only), **not** your total per-team count. Sorry for the confusion.

---

## Locked On — missing from your YouTube list (15 teams)

These teams have **no** `LockedOn` / `lockedon` channel in `youtube_sources.csv` yet (podcast list below often *does* include Locked On):

| Team | Add (typical handle) |
|------|----------------------|
| Miami Dolphins | `@LockedOnDolphins` |
| New England Patriots | `@LockedOnPatriots` |
| New York Jets | `@LockedOnJets` (you have podcast row; YouTube may be separate) |
| Baltimore Ravens | `@LockedOnRavens` |
| Cleveland Browns | `@LockedOnBrowns` |
| Tennessee Titans | `@LockedOnTitans` |
| Denver Broncos | `@LockedOnBroncos` |
| Kansas City Chiefs | `@LockedOnChiefs` |
| Dallas Cowboys | `@LockedOnCowboys` |
| New York Giants | `@LockedOnGiants` |
| Philadelphia Eagles | `@LockedOnEagles` |
| Washington Commanders | `@LockedOnCommanders` |
| Chicago Bears | `@LockedOnBears` |
| Green Bay Packers | `@LockedOnPackers` |
| Tampa Bay Buccaneers | `@LockedOnBucs` |

**Have Locked On on YouTube (17):** Bills, Bengals, Steelers, Texans, Colts, Jaguars, Raiders, Chargers, Lions, Vikings, Falcons, Panthers, Saints, Cardinals, Rams, 49ers, Seahawks.

---

## Chat Sports — not labeled in CSV; partial capture

**Zero** rows say “Chat Sports” in the URL. Several handles **are** Chat Sports shows (different branding):

| Team | Likely Chat Sports in your sheet | Chat Sports show name (official) |
|------|----------------------------------|----------------------------------|
| Raiders | `@RaidersReport` | Raiders Report |
| Cowboys | `@VochLombardi` (verify) | Cowboys Report |
| 49ers | `@DavidLombardi` (verify) | 49ers Report |
| Chargers | `@ChargerChatPodcast` (verify) | Chargers Now |
| Bucs | `@MrBucsNation` (verify) | Bucs Breakdown |

Full **Chat Sports NFL show list** (add any you don’t have):

| Team | YouTube search / show name |
|------|----------------------------|
| Bills | Bills Breakdown |
| Dolphins | Dolphins Today |
| Patriots | Patriots Today |
| Jets | Jets Report |
| Ravens | Ravens Rundown |
| Bengals | Bengals Breakdown |
| Browns | Browns Report |
| Steelers | Steelers Talk / Steelers Now |
| Texans | Texans Today |
| Colts | Colts Talk |
| Jaguars | Jags Now |
| Titans | Titans Today |
| Broncos | Broncos Breakdown |
| Chiefs | Chiefs Report |
| Raiders | Raiders Report |
| Chargers | Chargers Now |
| Cowboys | Cowboys Report |
| Giants | Giants Now |
| Eagles | Eagles Now |
| Commanders | Commanders Report |
| Bears | Bears Now |
| Lions | Lions Talk |
| Packers | Packers Report |
| Vikings | Vikings Now |
| Falcons | Falcons Today |
| Panthers | Panthers Today |
| Saints | Saints Now |
| Bucs | Bucs Breakdown |
| Cardinals | Cardinals Today |
| Rams | Rams Report |
| 49ers | 49ers Report |
| Seahawks | Seahawks Today |

Search: `"<Show Name> Chat Sports" site:youtube.com` or browse [chatsports.com](https://www.chatsports.com/) team hubs.

---

## Podcasts vs YouTube overlap

Expected duplicates:

- **Locked On** — often both a YouTube channel and a podcast feed.
- **Official team pods** — may mirror YouTube (`Chargers Podcast Network`, etc.).

Pipeline dedupes by **URL** on ingest. Same story on two platforms = two `raw_items` rows (compose clusters by title). That is OK.

Podcast rows belong in `data/podcasts_registry.csv` with **RSS feed URLs** when you have them (Apple/Spotify → “copy RSS”).
