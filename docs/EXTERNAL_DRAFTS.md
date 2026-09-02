# External drafts (Reddit + Substack)

After rumor review, **`/admin/drafts`** (nav: **Drafts**) creates **drafts only** — nothing posts live on Reddit or Substack.

## Safety

- Requires `EXTERNAL_DRAFTS_ENABLED=true`
- Blocks if any `review:rumor` flags remain
- Reddit calls `/api/v1/draft` only (never `/api/submit`)
- Substack creates/updates a draft only (never publish/send)
- Empty team sections are skipped
- Body matches the weekly issue layout: League-wide, division groups, bold team headers, Activity / Fantasy lens, numbered reference links
- Team tags / Fantasy·Camp badges are not included
- Body is Substack’s editor format (not raw HTML)
- Reddit posts end with a footer linking to your Substack

Put these variables in **`web/.env.local`** (Next.js API routes). Restart `npm run dev` after edits.

---

## 1. Reddit — personal account drafts

Use the same Reddit account you will submit from. Drafts appear under your profile; you choose when to post into each subreddit.

You need `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`. Username/password alone is not enough.

### A. Create an OAuth app (current Reddit UI)

Reddit moved this off the old “script app” form. Use **one** of these:

**Option 1 — classic page** (if it still opens a create form):

1. Sign in → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Click **create an app** / **create another app**
3. Type: **script** (or **web app** if script is gone)
4. Redirect URI: `http://localhost:8080`
5. Copy **client id** (short string under the app name) and **secret**

**Option 2 — Developer Platform** (what you are seeing: “OAuth app settings” / “Developer Platform app settings”):

1. Open [developers.reddit.com](https://developers.reddit.com) while signed in
2. Create / open an app named something like `DraftDNA-drafts`
3. Open **OAuth app settings**
4. Copy:
   - **Client ID** → `REDDIT_CLIENT_ID`
   - **Client secret** → `REDDIT_CLIENT_SECRET`
5. Redirect URI: `http://localhost:8080`
6. Scopes if asked: `identity`, `read`, `submit`, `mysubreddits`

If the platform says you must apply / accept the [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) first, do that. New personal apps are often gated in 2026 — if Reddit will not issue a client id, Substack drafts can still run; Reddit will skip until those two fields are filled.

### B. Add credentials

```env
EXTERNAL_DRAFTS_ENABLED=true
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_secret
REDDIT_USER_AGENT=DraftDNA-Newsletter/1.0 (by /u/YOUR_USERNAME; contact: you@email.com)
REDDIT_USERNAME=YOUR_USERNAME
REDDIT_PASSWORD=YOUR_PASSWORD
```

Use your Reddit password (or an [app password](https://www.reddit.com/prefs/update/) if you use 2FA — Reddit script apps often need the account password / app-specific auth; if password grant fails with 2FA, use a refresh token below).

### C. Optional: refresh token instead of password

If password grant is blocked:

1. Visit (replace `CLIENT_ID`):

```
https://www.reddit.com/api/v1/authorize?client_id=CLIENT_ID&response_type=code&state=drafts&redirect_uri=http://localhost:8080&duration=permanent&scope=submit,identity,read,mysubreddits
```

2. Approve → browser lands on `http://localhost:8080/?code=...` (page may fail to load; copy `code` from the address bar).
3. Exchange the code (PowerShell):

```powershell
$clientId = "YOUR_CLIENT_ID"
$secret = "YOUR_CLIENT_SECRET"
$code = "CODE_FROM_URL"
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${clientId}:${secret}"))
Invoke-RestMethod -Method Post -Uri "https://www.reddit.com/api/v1/access_token" `
  -Headers @{ Authorization = "Basic $pair"; "User-Agent" = "DraftDNA-Newsletter/1.0" } `
  -ContentType "application/x-www-form-urlencoded" `
  -Body "grant_type=authorization_code&code=$code&redirect_uri=http://localhost:8080"
```

4. Put the returned `refresh_token` in env and you can omit username/password:

```env
REDDIT_REFRESH_TOKEN=your_refresh_token
```

### D. Where to find drafts

After a successful run: [reddit.com/user/drafts](https://www.reddit.com/user/drafts) (or Profile → Drafts). Each draft is aimed at that team’s subreddit (`newsletter_teams.reddit_subreddit`).

---

## 2. Substack — session cookie (draft only)

Two different URLs, same person:

| URL | What it is |
|-----|------------|
| [substack.com/@trevorfaust](https://substack.com/@trevorfaust) | Your **profile** (`@trevorfaust`). Not for the draft API. |
| [trevorfaust.substack.com](https://trevorfaust.substack.com) | Your **publication**. Use this. |

Keep `SUBSTACK_PUBLICATION_URL=https://trevorfaust.substack.com` (no `/publish/home`, no `@`).

### A. Copy `substack.sid` (Windows / Chrome or Edge)

Substack’s session cookie is usually named **`substack.sid`** (older docs said `connect.sid` — either works; our app sends both).

There is no “DevTools” button on the Substack page. It is a browser tool.

1. Sign in at [trevorfaust.substack.com/publish/home](https://trevorfaust.substack.com/publish/home)
2. Press **F12**, or **Ctrl+Shift+I**, or click the three-dot menu → **More tools → Developer tools**
3. **Application** method (clearest):
   - DevTools → **Application** (Chrome/Edge; if missing, click `>>`)
   - Left sidebar: **Cookies** → `https://substack.com` (also try `https://trevorfaust.substack.com`)
   - Click the **`substack.sid`** row → copy **Value** only (starts with `s%3A` or `s:`)
4. Or **Network**: refresh → click `home` → **Request Headers → Cookie** → find `substack.sid=` and copy the value after `=` up to the next `;`

Ignore Google cookies (`SID`, `__Secure-3PSID`, etc.) and analytics cookies. Only `substack.sid` matters.

Do not commit this value. Treat it like a password. Signing out of Substack invalidates it.

### B. Add credentials

```env
SUBSTACK_PUBLICATION_URL=https://trevorfaust.substack.com
SUBSTACK_CONNECT_SID=paste_substack.sid_cookie_value_here
# Optional overrides if profile/self fails:
# SUBSTACK_USER_ID=
# SUBSTACK_PUBLICATION_USER_ID=
```

### C. Open the draft

The review UI links to the new draft under `/publish/post/{id}`. You still hit **Continue** / **Send** yourself in Substack.

---

## 3. Workflow

1. Clear rumors on `/admin/review/{slug}`
2. Optionally **Approve & publish** (site only)
3. Open **Drafts** in the nav (`/admin/drafts`), pick the edition, then **Create Substack + Reddit drafts** (or Substack/Reddit only)
4. Review Substack draft + Reddit drafts; post when ready

Published editions stay on `/admin/drafts` (they drop off the Rumors queue). You can also reach drafts from an issue page via **External drafts**, or from rumor review.

If credentials are missing, the API returns warnings and skips that target instead of publishing anything.
