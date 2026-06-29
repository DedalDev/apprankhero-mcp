# AppRankHero MCP server

Bring your [AppRankHero](https://apprankhero.com) App Store Optimization data
into any MCP-compatible AI client (Claude Desktop, Claude Code, Cursor, …).

Ask things like *"How is my app ranking for 'habit tracker'?"*, *"Find me
high-popularity low-difficulty keywords for habit apps"*, or *"Who are my
competitors for 'focus timer'?"* — answered live from your AppRankHero data.

## Requirements

- An **AppRankHero Pro** plan. Your **license key** (starts with `ARH-`) is the
  credential. Get it in the app under **Account → Upgrade to Pro** after
  purchase. (The free tier does not include MCP access.)
- Node.js 18+.

## Tools

| Tool | What it does |
|------|--------------|
| `arh_whoami` | Verify the key; show team, plan, tracked-app count |
| `arh_list_apps` | List your tracked apps (use the `id` as `app_id` below) |
| `arh_search_keywords` | Keyword research: popularity & difficulty by country |
| `arh_app_rankings` | Current keyword ranks for one of your apps (+ 24h/7d/28d change) |
| `arh_rank_history` | Ranking trend over time for an app + keyword |
| `arh_competitors` | Apps competing for a keyword |

## Setup — Claude Desktop

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

## Setup — Claude Code

```bash
claude mcp add apprankhero --env ARH_LICENSE_KEY=ARH-XXXXXXXX-XXXXXXXX -- npx -y apprankhero-mcp
```

## Configuration

| Env var | Required | Default | Notes |
|---------|----------|---------|-------|
| `ARH_LICENSE_KEY` | yes | — | Your AppRankHero Pro license key |
| `ARH_API_BASE` | no | `https://apprankhero.com/api/v1` | Override for self-hosted / local dev |

## Run locally (development)

```bash
npm install
ARH_LICENSE_KEY=ARH-... ARH_API_BASE=http://localhost:8000/api/v1 npm start
```

## Privacy

The server talks only to the AppRankHero API over HTTPS using your license key.
It exposes **read-only** ASO data scoped to your own team. Your key never leaves
your machine except as an auth header to apprankhero.com.

---

Made by [DedalDev](https://apprankhero.com).
