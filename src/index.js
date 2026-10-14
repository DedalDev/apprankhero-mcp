#!/usr/bin/env node
/**
 * AppRankHero MCP server.
 *
 * Exposes App Store Optimization data for the App Store (iOS) and Google Play
 * (Android): tracked apps, keyword ranks, keyword research and competitors, to
 * MCP-compatible AI clients such as Claude. It also lets them manage what the
 * team tracks (add apps, track or untrack keywords).
 *
 * Auth: your AppRankHero Pro license key. Configure via env:
 *   ARH_LICENSE_KEY  (required)  e.g. ARH-XXXXXXXX-...
 *   ARH_API_BASE     (optional)  defaults to https://apprankhero.com/api/v1
 *   ARH_TEAM_ID      (optional)  team to act on when you belong to several
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";

const VERSION = "1.3.0";
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
  z.string().length(2).optional().describe(`Two letter country code (App Store storefront or Google Play country)${fallback ? `, default '${fallback}'` : ""}.`);

const platform = (what) =>
  z.enum(["ios", "android"]).optional().describe(`${what} 'ios' = App Store, 'android' = Google Play. Default 'ios'.`);

const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

/** Titles and annotations shared with the hosted server (resources/mcp/tools.json). */
const TOOL_META = JSON.parse(readFileSync(new URL("./tool-meta.json", import.meta.url), "utf8"));

/** Same text as the hosted server sends on initialize. */
const INSTRUCTIONS = `AppRankHero tracks App Store (iOS) and Google Play (Android) keyword rankings for the user's team, refreshed every morning.

How to use the tools:
1. Start with arh_list_apps to get each app's id (a UUID), platform and countries. Every app scoped tool needs that app_id, never the store id or the app name.
2. Countries are two letter storefront codes in lower case (us, gb, de). Use a country the app tracks unless the user asks for another.
3. Current ranks: arh_app_rankings. Trend for one keyword: arh_rank_history. Week or month summary with winners and losers: arh_report.
4. New keyword ideas: arh_search_keywords (popularity and difficulty, 0 to 100) and arh_competitors (who ranks for a keyword). Then arh_track_keywords to start tracking the good ones.
5. Rank 0 means not ranked (outside the top 200 on the App Store, outside the top 30 on Google Play). Lower is better; a positive change means the app moved up.
6. Write tools (arh_track_keywords, arh_untrack_keywords, arh_add_app) change the team's data. Confirm with the user before calling them unless they asked for exactly that change.
7. arh_whoami shows the plan and limits. If a write fails on a plan limit, tell the user and point to https://apprankhero.com/pricing.`;

const server = new McpServer(
  {
    name: "apprankhero",
    title: "AppRankHero",
    version: VERSION,
    websiteUrl: "https://apprankhero.com",
    icons: [{ src: "https://apprankhero.com/apprankhero-icon.png", mimeType: "image/png", sizes: ["512x512"] }],
  },
  { instructions: INSTRUCTIONS }
);

/** Registers a tool with the shared title and annotations. */
function tool(name, description, inputSchema, handler) {
  const meta = TOOL_META[name] ?? {};
  server.registerTool(name, { title: meta.title, description, inputSchema, annotations: meta.annotations }, handler);
}

tool(
  "arh_whoami",
  "Verify the AppRankHero license key and show the active team (id, name, your role), plan, tracked app and keyword counts, limits, and every team you belong to. Set ARH_TEAM_ID to one of those team ids to act on a different team. Your role must be owner or member to add apps or change tracked keywords; viewers are read only.",
  {},
  async () => {
    try { return ok(await api("/me")); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_list_apps",
  "List the apps tracked by your AppRankHero team, from the App Store (iOS) and Google Play (Android): id, platform, store id (numeric App Store id or Google Play package name), name, icon, store_url, countries. Use the returned `id` (a UUID, not the store id) as app_id in the other tools; the platform of each app is taken from the app itself.",
  {},
  async () => {
    try { return ok(await api("/apps")); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_search_keywords",
  "Search keyword research data for the App Store (iOS) or Google Play (Android), selected with platform (popularity 0-100, difficulty 0-100) for a country. Optionally filter by a term substring. Higher popularity = more searched; higher difficulty = harder to rank. Only covers keywords someone has scanned before on that platform; to measure a brand new keyword, track it with arh_track_keywords.",
  {
    term: z.string().optional().describe("Substring to filter keywords by (optional)."),
    country: country("us"),
    platform: platform("Which store's keyword data to search."),
    limit: z.number().int().min(1).max(200).optional().describe("Max results, default 50."),
  },
  async ({ term, country, platform, limit }) => {
    try { return ok(await api("/keywords", { term, country, platform, limit })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_app_rankings",
  "Get current keyword rankings for one of your tracked apps, on the App Store (iOS) or Google Play (Android) depending on the app: rank (0 = not ranked; the App Store is tracked within the top 200, Google Play within the top 30), recent changes (24h/7d/28d, positive = moved up), popularity and difficulty. Only keywords your team tracks that have been scanned at least once; use arh_list_tracked_keywords to also see keywords still waiting for their first scan.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    country: z.string().length(2).optional().describe("Two letter country code (App Store storefront or Google Play country), optional, all if omitted."),
    limit: z.number().int().min(1).max(5000).optional().describe("Max rows, default 500."),
  },
  async ({ app_id, country, limit }) => {
    try { return ok(await api("/rankings", { app_id, country, limit })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_rank_history",
  "Get the historical ranking trend for a specific app + keyword over time (list of {country, rank, checked_at}, oldest first; rank 0 = not ranked, meaning outside the top 200 on the App Store or outside the top 30 on Google Play). Works for apps on both stores.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keyword: z.string().describe("The keyword to get history for."),
    country: z.string().length(2).optional().describe("Two letter country code (App Store storefront or Google Play country), optional."),
    days: z.number().int().min(1).max(730).optional().describe("How many days back, default 90, max 730."),
  },
  async ({ app_id, keyword, country, days }) => {
    try { return ok(await api("/history", { app_id, keyword, country, days })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_report",
  "Ranking report for the team across App Store (iOS) and Google Play (Android) apps (the same data as the scheduled email and Slack reports): per app tracked and ranked keyword counts, top 10 count now vs period start, average rank, top gainers and losers, keywords that entered or left the top 10, and data freshness. Use it to answer 'how did my apps do this week'.",
  {
    period: z.enum(["daily", "weekly", "monthly"]).optional().describe("daily = last 24h, weekly = last 7 days (default), monthly = last 30 days."),
    app_id: z.string().optional().describe("Limit to one app (id from arh_list_apps). Omit for all of the team's own and client apps."),
  },
  async ({ period, app_id }) => {
    try { return ok(await api("/report", { period, app_id })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_competitors",
  "List the apps competing for a given keyword in a country on the App Store (iOS) or Google Play (Android), selected with platform (the apps currently ranking for it).",
  {
    keyword: z.string().describe("The keyword to find competitors for."),
    country: country("us"),
    platform: platform("Which store to look at."),
  },
  async ({ keyword, country, platform }) => {
    try { return ok(await api("/competitors", { keyword, country, platform })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_list_tracked_keywords",
  "List the keywords your team tracks for one app, each with status ('ranked' = in the top 200 on the App Store or the top 30 on Google Play, 'unranked' = scanned but outside that range, 'pending' = just added and waiting for its first server scan), rank, change_24h/7d/28d (positive = moved up), popularity, difficulty and checked_at. Pending keywords are normally ranked within about a minute (large batches take several minutes), so call this again later to see them.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    country: z.string().length(2).optional().describe("Two letter country code (App Store storefront or Google Play country), optional, all countries if omitted."),
  },
  async ({ app_id, country }) => {
    try { return ok(await api("/tracked-keywords", { app_id, country })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_track_keywords",
  "Start tracking keywords for one of your apps in a country (1 to 200 per call; keywords are lowercased and de-duplicated). The store is taken from the app: App Store (iOS) apps are scanned within the top 200, Google Play (Android) apps within the top 30. The server scans them against that store: when 5 or fewer new keywords are added they are usually ranked immediately and returned with rank, popularity and difficulty; otherwise, or if the store is slow, they come back as 'pending' and are ranked server side within about a minute (large batches take several minutes). Check them with arh_list_tracked_keywords. Keywords already tracked are reported as existing. The team plan caps the total number of tracked keywords; keywords over the cap come back as 'limit_reached'. Needs the owner or member role.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keywords: z.array(z.string().min(1).max(100)).min(1).max(200).describe("Keywords to track, e.g. ['focus timer', 'app blocker']."),
    country: country("us"),
  },
  async ({ app_id, keywords, country }) => {
    try { return ok(await apiPost("/tracked-keywords", { app_id, keywords, country })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_untrack_keywords",
  "Stop tracking keywords for one of your apps (App Store or Google Play) in a country. Only removes them from your team's list; shared rank history is kept, so tracking them again later restores their history. Returns how many were removed. Needs the owner or member role.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keywords: z.array(z.string().min(1).max(100)).min(1).max(500).describe("Keywords to stop tracking."),
    country: country("us"),
  },
  async ({ app_id, keywords, country }) => {
    try { return ok(await apiPost("/tracked-keywords/remove", { app_id, keywords, country })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_search_store_apps",
  "Search the live App Store (platform ios, default) or Google Play (platform android) for apps by name or keyword, or look one up by id: a numeric App Store id for ios, a package name such as com.example.app for android. Returns platform, store_id (numeric App Store id or Google Play package name), name, developer, icon_url, rating_count and whether your team already tracks it; iOS rows also carry app_store_id and bundle_id. Use it to find the store_id for arh_add_app.",
  {
    term: z.string().min(1).max(200).describe("Search text, e.g. 'opal screen time', a numeric App Store id, or a Google Play package name."),
    country: country("us"),
    platform: platform("Which store to search."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10."),
  },
  async ({ term, country, platform, limit }) => {
    try { return ok(await api("/store-search", { term, country, platform, limit })); } catch (e) { return fail(e); }
  }
);

tool(
  "arh_add_app",
  "Add an app to your team so you can track its keywords: your own app (category myApps), a client's (clients) or a competitor (competitors). Works for the App Store (platform ios, default) and Google Play (platform android). Pass the store_id (find it with arh_search_store_apps): a numeric App Store id for ios, a Google Play package name such as com.dedaldev.bounded for android; name, icon and developer are fetched from the store. For a keyword research project that is not a real app, use category 'research' with just a name. If the team already tracks the app it is returned with created=false. Returns the app with its `id` (use it as app_id in the other tools), platform and store_url. The team plan caps the number of apps. Needs the owner or member role.",
  {
    platform: platform("Store the app is published on."),
    store_id: z.string().min(1).max(255).optional().describe("Numeric App Store id (e.g. '6772967892') for ios, or Google Play package name (e.g. 'com.dedaldev.bounded') for android. Required unless category is 'research'."),
    app_store_id: z.string().regex(/^\d+$/).optional().describe("Deprecated alias for store_id, numeric App Store id only (implies platform ios). Use store_id instead."),
    name: z.string().max(255).optional().describe("Only for research projects: the project name."),
    category: z.enum(["myApps", "clients", "competitors", "research"]).optional().describe("Default 'myApps'."),
    countries: z.array(z.string().length(2)).min(1).max(50).optional().describe("Countries to track (App Store storefronts or Google Play countries), default ['us']."),
  },
  async ({ platform, store_id, app_store_id, name, category, countries }) => {
    try {
      if (app_store_id && platform === "android") {
        throw new Error("app_store_id is only for the App Store (ios). For Google Play pass store_id with the package name.");
      }
      if (app_store_id && store_id && app_store_id !== store_id) {
        throw new Error("Pass either store_id or the deprecated app_store_id, not two different values.");
      }
      const id = store_id || app_store_id;
      const effective = app_store_id ? "ios" : platform || "ios";
      if (id) {
        if (effective === "ios" && !/^\d+$/.test(id)) {
          throw new Error(`Invalid App Store id '${id}': expected a numeric id such as '6772967892'. For a Google Play app set platform to 'android' and pass the package name.`);
        }
        if (effective === "android" && !PACKAGE_NAME.test(id)) {
          throw new Error(`Invalid Google Play package name '${id}': expected something like 'com.example.app'.`);
        }
      }
      const body = { platform: id || platform ? effective : undefined, store_id: id, name, category, countries };
      if (id && effective === "ios") body.app_store_id = id; // older backends only know the legacy field
      return ok(await apiPost("/apps", body));
    } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[apprankhero-mcp] v${VERSION} running (stdio) against ${API_BASE}`);
