#!/usr/bin/env node
/**
 * AppRankHero MCP server.
 *
 * Exposes App Store Optimization data (tracked apps, keyword ranks, keyword
 * research, competitors) to MCP-compatible AI clients such as Claude, and lets
 * them manage what the team tracks (add apps, track or untrack keywords).
 *
 * Auth: your AppRankHero Pro license key. Configure via env:
 *   ARH_LICENSE_KEY  (required)  e.g. ARH-XXXXXXXX-...
 *   ARH_API_BASE     (optional)  defaults to https://apprankhero.com/api/v1
 *   ARH_TEAM_ID      (optional)  team to act on when you belong to several
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "1.1.0";
const API_BASE = (process.env.ARH_API_BASE || "https://apprankhero.com/api/v1").replace(/\/$/, "");
const LICENSE_KEY = process.env.ARH_LICENSE_KEY;
const TEAM_ID = process.env.ARH_TEAM_ID || "";

if (!LICENSE_KEY) {
  console.error(
    "[apprankhero-mcp] Missing ARH_LICENSE_KEY. Set it to your AppRankHero Pro license key."
  );
  process.exit(1);
}

function headers(extra = {}) {
  const h = { "X-License-Key": LICENSE_KEY, Accept: "application/json", ...extra };
  if (TEAM_ID) h["X-Team-Id"] = TEAM_ID;
  return h;
}

async function send(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try { msg = JSON.parse(body).message || body; } catch {}
    throw new Error(`AppRankHero API ${res.status}: ${msg}`);
  }
  return body; // already JSON text, pass straight through to the model
}

async function api(path, params = {}) {
  const url = new URL(`${API_BASE}/mcp${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return send(url, { headers: headers() });
}

async function apiPost(path, body = {}) {
  const clean = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  return send(`${API_BASE}/mcp${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(clean),
  });
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}
function fail(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

const country = (fallback) =>
  z.string().length(2).optional().describe(`Two-letter App Store country code${fallback ? `, default '${fallback}'` : ""}.`);

const server = new McpServer({ name: "apprankhero", version: VERSION });

server.tool(
  "arh_whoami",
  "Verify the AppRankHero license key and show the active team (id, name, your role), plan, tracked app and keyword counts, limits, and every team you belong to. Set ARH_TEAM_ID to one of those team ids to act on a different team. Your role must be owner or member to add apps or change tracked keywords; viewers are read only.",
  {},
  async () => {
    try { return ok(await api("/me")); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_list_apps",
  "List the apps tracked by your AppRankHero team (id, App Store id, name, icon, countries). Use the returned `id` (a UUID, not the App Store id) as app_id in the other tools.",
  {},
  async () => {
    try { return ok(await api("/apps")); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_search_keywords",
  "Search App Store keyword research data (popularity 0-100, difficulty 0-100) for a country. Optionally filter by a term substring. Higher popularity = more searched; higher difficulty = harder to rank. Only covers keywords someone has scanned before; to measure a brand new keyword, track it with arh_track_keywords.",
  {
    term: z.string().optional().describe("Substring to filter keywords by (optional)."),
    country: country("us"),
    limit: z.number().int().min(1).max(200).optional().describe("Max results, default 50."),
  },
  async ({ term, country, limit }) => {
    try { return ok(await api("/keywords", { term, country, limit })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_app_rankings",
  "Get current App Store keyword rankings for one of your tracked apps: rank (0 = not in the top 200), recent changes (24h/7d/28d, positive = moved up), popularity and difficulty. Only keywords your team tracks that have been scanned at least once; use arh_list_tracked_keywords to also see keywords still waiting for their first scan.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    country: z.string().length(2).optional().describe("Two-letter country code (optional; all if omitted)."),
    limit: z.number().int().min(1).max(5000).optional().describe("Max rows, default 500."),
  },
  async ({ app_id, country, limit }) => {
    try { return ok(await api("/rankings", { app_id, country, limit })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_rank_history",
  "Get the historical ranking trend for a specific app + keyword over time (list of {country, rank, checked_at}, oldest first; rank 0 = not in the top 200).",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keyword: z.string().describe("The keyword to get history for."),
    country: z.string().length(2).optional().describe("Two-letter country code (optional)."),
    days: z.number().int().min(1).max(730).optional().describe("How many days back, default 90, max 730."),
  },
  async ({ app_id, keyword, country, days }) => {
    try { return ok(await api("/history", { app_id, keyword, country, days })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_competitors",
  "List the apps competing for a given keyword in a country (the apps currently ranking for it).",
  {
    keyword: z.string().describe("The keyword to find competitors for."),
    country: country("us"),
  },
  async ({ keyword, country }) => {
    try { return ok(await api("/competitors", { keyword, country })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_list_tracked_keywords",
  "List the keywords your team tracks for one app, each with status ('ranked' = in the top 200, 'unranked' = scanned but not in the top 200, 'pending' = just added and waiting for its first server scan), rank, change_24h/7d/28d (positive = moved up), popularity, difficulty and checked_at. Pending keywords are normally ranked within about a minute (large batches take several minutes), so call this again later to see them.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    country: z.string().length(2).optional().describe("Two-letter country code (optional; all countries if omitted)."),
  },
  async ({ app_id, country }) => {
    try { return ok(await api("/tracked-keywords", { app_id, country })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_track_keywords",
  "Start tracking App Store keywords for one of your apps in a country (1 to 200 per call; keywords are lowercased and de-duplicated). The server scans them against the App Store: when 5 or fewer new keywords are added they are usually ranked immediately and returned with rank, popularity and difficulty; otherwise, or if the App Store is slow, they come back as 'pending' and are ranked server side within about a minute (large batches take several minutes). Check them with arh_list_tracked_keywords. Keywords already tracked are reported as existing. The team plan caps the total number of tracked keywords; keywords over the cap come back as 'limit_reached'. Needs the owner or member role.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keywords: z.array(z.string().min(1).max(100)).min(1).max(200).describe("Keywords to track, e.g. ['focus timer', 'app blocker']."),
    country: country("us"),
  },
  async ({ app_id, keywords, country }) => {
    try { return ok(await apiPost("/tracked-keywords", { app_id, keywords, country })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_untrack_keywords",
  "Stop tracking keywords for one of your apps in a country. Only removes them from your team's list; shared rank history is kept, so tracking them again later restores their history. Returns how many were removed. Needs the owner or member role.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keywords: z.array(z.string().min(1).max(100)).min(1).max(500).describe("Keywords to stop tracking."),
    country: country("us"),
  },
  async ({ app_id, keywords, country }) => {
    try { return ok(await apiPost("/tracked-keywords/remove", { app_id, keywords, country })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_search_store_apps",
  "Search the live App Store for apps by name or keyword (or pass a numeric App Store id to look one up). Returns app_store_id, name, bundle_id, developer, icon_url, rating_count and whether your team already tracks it. Use it to find the app_store_id for arh_add_app.",
  {
    term: z.string().min(1).max(200).describe("Search text, e.g. 'opal screen time', or a numeric App Store id."),
    country: country("us"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10."),
  },
  async ({ term, country, limit }) => {
    try { return ok(await api("/store-search", { term, country, limit })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_add_app",
  "Add an app to your team so you can track its keywords: your own app (category myApps), a client's (clients) or a competitor (competitors). Pass the app_store_id (find it with arh_search_store_apps); name, bundle id and icon are fetched from the App Store. For a keyword research project that is not a real app, use category 'research' with just a name. If the team already tracks the app it is returned with created=false. Returns the app with its `id` for the other tools. The team plan caps the number of apps. Needs the owner or member role.",
  {
    app_store_id: z.string().regex(/^\d+$/).optional().describe("Numeric App Store id, e.g. '6772967892'. Required unless category is 'research'."),
    name: z.string().max(255).optional().describe("Only for research projects: the project name."),
    category: z.enum(["myApps", "clients", "competitors", "research"]).optional().describe("Default 'myApps'."),
    countries: z.array(z.string().length(2)).min(1).max(50).optional().describe("Countries to track, default ['us']."),
  },
  async ({ app_store_id, name, category, countries }) => {
    try { return ok(await apiPost("/apps", { app_store_id, name, category, countries })); } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[apprankhero-mcp] v${VERSION} running (stdio) against ${API_BASE}`);
