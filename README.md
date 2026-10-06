# AppRankHero MCP server

Bring your [AppRankHero](https://apprankhero.com) App Store Optimization data
for the App Store (iOS) and Google Play (Android) into any MCP-compatible AI
client (Claude Desktop, Claude Code, Cursor and others).

Ask things like *"How is my app ranking for 'habit tracker'?"*, *"Find me
high-popularity low-difficulty keywords for habit apps"*, or *"Who are my
competitors for 'focus timer'?"*, or *"Add com.dedaldev.bounded from Google
Play and track 'app blocker' in the US"*. Answers come live from your
AppRankHero data.

## Requirements

- An **AppRankHero Pro** plan. Your **license key** (starts with `ARH-`) is the
  credential. Get it in the app under **Account → Upgrade to Pro** after
  purchase. (The free tier does not include MCP access.)
- Node.js 18+.

## Tools

| Tool | What it does |
|------|--------------|
| `arh_whoami` | Verify the key; show the active team, your role, plan, limits and all your teams |
| `arh_list_apps` | List your tracked apps from both stores, with `platform` and `store_url` (use the `id` as `app_id` below) |
| `arh_search_keywords` | Keyword research: popularity and difficulty by country, `platform` `ios` or `android` |
| `arh_app_rankings` | Current ranks of your team's tracked keywords for one app (24h/7d/28d change included) |
| `arh_report` | Weekly, daily or monthly ranking report (gainers, losers, top 10 changes) for App Store and Google Play apps |
| `arh_rank_history` | Ranking trend over time for an app and keyword (`days`, default 90, max 730) |
| `arh_competitors` | Apps competing for a keyword, `platform` `ios` or `android` |
| `arh_list_tracked_keywords` | Tracked keywords for an app with status (`ranked`, `unranked`, `pending`), rank, changes, popularity, difficulty |
| `arh_track_keywords` | Track up to 200 keywords for an app in a country; they are ranked on the server (right away for 5 or fewer, otherwise within about a minute) |
| `arh_untrack_keywords` | Stop tracking keywords for an app in a country |
| `arh_search_store_apps` | Search the live App Store or Google Play (`platform`) to find an app's `store_id` |
| `arh_add_app` | Add an App Store or Google Play app (by `store_id`) or a research project to your team |

Write tools (`arh_track_keywords`, `arh_untrack_keywords`, `arh_add_app`) need the
**owner** or **member** role in the team; viewers are read only. Plan limits on
apps and keywords apply exactly as in the desktop app.

## iOS and Android

AppRankHero tracks both stores. `platform` is `ios` (App Store, the default) or
`android` (Google Play).

- `arh_search_store_apps`, `arh_add_app`, `arh_search_keywords` and
  `arh_competitors` take an optional `platform`.
- Tracked apps carry their platform, so `arh_app_rankings`, `arh_rank_history`,
  `arh_report`, `arh_list_tracked_keywords`, `arh_track_keywords` and
  `arh_untrack_keywords` just take the app `id` and use the right store.
- `store_id` is a numeric App Store id (for example `6772967892`) on iOS and a
  package name (for example `com.dedaldev.bounded`) on Android. The older
  `app_store_id` input on `arh_add_app` still works, is iOS only and is
  deprecated.
- Country codes are App Store storefronts or Google Play countries.
- Ranks are tracked within the top 200 on the App Store and within the top 30
  on Google Play. A rank of 0 means not ranked in that range.

Example, adding an Android app:

```text
> Add com.dedaldev.bounded from Google Play to my apps and track "app blocker" in the US

arh_search_store_apps  { "term": "com.dedaldev.bounded", "platform": "android" }
arh_add_app            { "platform": "android", "store_id": "com.dedaldev.bounded", "countries": ["us"] }
arh_track_keywords     { "app_id": "<id returned by arh_add_app>", "keywords": ["app blocker"], "country": "us" }
```

## Setup for Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) and add:

```json
{
  "mcpServers": {
    "apprankhero": {
      "command": "npx",
      "args": ["-y", "apprankhero-mcp"],
      "env": {
        "ARH_LICENSE_KEY": "ARH-XXXXXXXX-XXXXXXXX"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see the AppRankHero tools available.

## Setup for Claude Code

```bash
claude mcp add apprankhero --env ARH_LICENSE_KEY=ARH-XXXXXXXX-XXXXXXXX -- npx -y apprankhero-mcp
```

## Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `ARH_LICENSE_KEY` | yes | none | Your AppRankHero Pro license key |
| `ARH_API_BASE` | no | `https://apprankhero.com/api/v1` | Override for self-hosted / local dev |
| `ARH_TEAM_ID` | no | your own team | Team to act on when you belong to several (ids are listed by `arh_whoami`) |

## Run locally (development)

```bash
npm install
ARH_LICENSE_KEY=ARH-... ARH_API_BASE=http://localhost:8000/api/v1 npm start
```

## Privacy

The server talks only to the AppRankHero API over HTTPS using your license key.
It exposes ASO data for App Store and Google Play apps scoped to your own team,
and can only change what your team tracks (apps and keywords) when your role
allows it. Your key never leaves
your machine except as an auth header to apprankhero.com.

---

Made by [DedalDev](https://apprankhero.com).
