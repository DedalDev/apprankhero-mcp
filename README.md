# AppRankHero MCP server

Your [AppRankHero](https://apprankhero.com) keyword rankings for the App Store
(iOS) and Google Play (Android), inside ChatGPT, Claude, Claude Code, Codex,
Cursor, VS Code, Windsurf, Gemini CLI and any other MCP client.

Ask in plain language:

- *"Which of my keywords dropped out of the top 10 this week?"*
- *"Find popular, low difficulty keywords for a habit tracker in Germany."*
- *"Who outranks me for 'focus timer' and what do they have in their title?"*
- *"Track 'app blocker' and 'screen time' for my app in the US and UK."*

Answers come live from your AppRankHero data, refreshed every morning.

## Requirements

An AppRankHero **Pro** or **Studio** plan. Your license key starts with `ARH-`
and is in the Mac app under **Account**. See
[plans](https://apprankhero.com/pricing) and
[how to activate a key](https://apprankhero.com/help/activate-your-license-key).

## Hosted server (recommended)

Nothing to install. One URL for every client:

```text
https://apprankhero.com/mcp
```

Streamable HTTP, two ways to sign in:

- **OAuth.** ChatGPT, Claude and Perplexity open an AppRankHero page where you
  paste your license key once.
- **Bearer header.** Developer tools send `Authorization: Bearer ARH-XXXX`.

### Claude (claude.ai and Claude Desktop)

Settings, **Connectors**, **Add custom connector**, paste the URL, **Connect**.

### ChatGPT

Settings, **Apps**, turn on **Developer mode**, **Create**, paste the URL,
Authentication **OAuth**, **Connect**.

### Claude Code

```bash
claude mcp add --transport http apprankhero https://apprankhero.com/mcp \
  --scope user --header "Authorization: Bearer ARH-XXXX"
```

### Codex

```bash
export ARH_TOKEN=ARH-XXXX
codex mcp add apprankhero --url https://apprankhero.com/mcp --bearer-token-env-var ARH_TOKEN
```

### Cursor, Windsurf, VS Code and other JSON configs

```json
{
  "mcpServers": {
    "apprankhero": {
      "url": "https://apprankhero.com/mcp",
      "headers": { "Authorization": "Bearer ARH-XXXX" }
    }
  }
}
```

VS Code uses `"servers"` instead of `"mcpServers"` and `"type": "http"`.
Step by step guides for every client:
[apprankhero.com/help/connect-ai-tools-mcp](https://apprankhero.com/help/connect-ai-tools-mcp).

## Local stdio server

For clients that only run local servers. Needs Node.js 18 or later.

```json
{
  "mcpServers": {
    "apprankhero": {
      "command": "npx",
      "args": ["-y", "github:DedalDev/apprankhero-mcp"],
      "env": { "ARH_LICENSE_KEY": "ARH-XXXX" }
    }
  }
}
```

| Variable | Required | Meaning |
|---|---|---|
| `ARH_LICENSE_KEY` | yes | Your Pro or Studio license key |
| `ARH_TEAM_ID` | no | Team to act on when you belong to several (see `arh_whoami`) |
| `ARH_API_BASE` | no | API base URL, default `https://apprankhero.com/api/v1` |

The hosted and the local server offer the same tools.

## Tools

| Tool | What it does | Changes data |
|---|---|---|
| `arh_whoami` | Active team, role, plan, limits and all your teams | no |
| `arh_list_apps` | Tracked apps from both stores; the `id` is the `app_id` for other tools | no |
| `arh_app_rankings` | Current ranks for one app with 24h, 7d and 28d changes, popularity and difficulty | no |
| `arh_rank_history` | Rank trend for an app and keyword (default 90 days, up to 730) | no |
| `arh_report` | Daily, weekly or monthly report: gainers, losers, top 10 changes | no |
| `arh_search_keywords` | Keyword research: popularity and difficulty (0 to 100) by country | no |
| `arh_competitors` | Apps competing for a keyword in a country | no |
| `arh_list_tracked_keywords` | Tracked keywords for an app with status (ranked, unranked, pending) | no |
| `arh_search_store_apps` | Search the live App Store or Google Play to find an app's store id | no |
| `arh_track_keywords` | Track up to 200 keywords for an app in a country | yes |
| `arh_untrack_keywords` | Stop tracking keywords for an app in a country | yes |
| `arh_add_app` | Add an App Store or Google Play app, or a research project | yes |

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`) so clients can ask before write calls.
Write tools need the **owner** or **member** role; viewers are read only.
Plan limits apply exactly as in the Mac app.

### App Store and Google Play

- `platform` is `ios` (App Store, default) or `android` (Google Play) on
  `arh_search_store_apps`, `arh_add_app`, `arh_search_keywords` and
  `arh_competitors`. Tracked apps already know their store.
- `store_id` is the numeric App Store id (`6772967892`) or the package name
  (`com.example.app`).
- Ranks are tracked within the top 200 on the App Store and the top 30 on
  Google Play. Rank `0` means not ranked in that range.

## Privacy and security

- The server only sees data of the teams your license key belongs to.
- [Privacy Policy](https://apprankhero.com/privacy) and
  [Terms of Service](https://apprankhero.com/terms).

## Support

[hello@apprankhero.com](mailto:hello@apprankhero.com) and the
[Help Center](https://apprankhero.com/help).

Made by [DedalDev](https://dedaldev.com). MIT licensed.
