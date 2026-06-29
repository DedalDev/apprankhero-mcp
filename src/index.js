#!/usr/bin/env node
/**
 * AppRankHero MCP server.
 *
 * Exposes App Store Optimization data (tracked apps, keyword ranks, keyword
 * research, competitors) to MCP-compatible AI clients such as Claude.
 *
 * Auth: your AppRankHero Pro license key. Configure via env:
 *   ARH_LICENSE_KEY  (required)  e.g. ARH-XXXXXXXX-...
 *   ARH_API_BASE     (optional)  defaults to https://apprankhero.com/api/v1
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env.ARH_API_BASE || "https://apprankhero.com/api/v1").replace(/\/$/, "");
const LICENSE_KEY = process.env.ARH_LICENSE_KEY;

if (!LICENSE_KEY) {
  console.error(
    "[apprankhero-mcp] Missing ARH_LICENSE_KEY. Set it to your AppRankHero Pro license key."
  );
  process.exit(1);
}

async function api(path, params = {}) {
  const url = new URL(`${API_BASE}/mcp${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { "X-License-Key": LICENSE_KEY, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try { msg = JSON.parse(body).message || body; } catch {}
    throw new Error(`AppRankHero API ${res.status}: ${msg}`);
  }
  return body; // already JSON text — pass straight through to the model
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}
function fail(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

const server = new McpServer({ name: "apprankhero", version: "1.0.0" });

server.tool(
  "arh_whoami",
  "Verify the AppRankHero license key and show the team name, plan, and number of tracked apps.",
  {},
  async () => {
    try { return ok(await api("/me")); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_list_apps",
  "List the apps tracked by your AppRankHero team (id, store id, name, icon, countries). Use the returned `id` as app_id in other tools.",
  {},
  async () => {
    try { return ok(await api("/apps")); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_search_keywords",
  "Search App Store keyword research data (popularity 0-100, difficulty 0-100) for a country. Optionally filter by a term substring. Higher popularity = more searched; higher difficulty = harder to rank.",
  {
    term: z.string().optional().describe("Substring to filter keywords by (optional)."),
    country: z.string().optional().describe("Two-letter country code, default 'us'."),
    limit: z.number().int().min(1).max(200).optional().describe("Max results, default 50."),
  },
  async ({ term, country, limit }) => {
    try { return ok(await api("/keywords", { term, country, limit })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_app_rankings",
  "Get current App Store keyword rankings for one of your tracked apps, including rank, recent changes (24h/7d/28d), popularity and difficulty.",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    country: z.string().optional().describe("Two-letter country code (optional; all if omitted)."),
    limit: z.number().int().min(1).max(5000).optional().describe("Max rows, default 500."),
  },
  async ({ app_id, country, limit }) => {
    try { return ok(await api("/rankings", { app_id, country, limit })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_rank_history",
  "Get the historical ranking trend for a specific app + keyword over time (list of {checked_at, rank}).",
  {
    app_id: z.string().describe("The app's id from arh_list_apps."),
    keyword: z.string().describe("The keyword to get history for."),
    country: z.string().optional().describe("Two-letter country code (optional)."),
  },
  async ({ app_id, keyword, country }) => {
    try { return ok(await api("/history", { app_id, keyword, country })); } catch (e) { return fail(e); }
  }
);

server.tool(
  "arh_competitors",
  "List the apps competing for a given keyword in a country (the apps currently ranking for it).",
  {
    keyword: z.string().describe("The keyword to find competitors for."),
    country: z.string().optional().describe("Two-letter country code, default 'us'."),
  },
  async ({ keyword, country }) => {
    try { return ok(await api("/competitors", { keyword, country })); } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[apprankhero-mcp] running (stdio) against " + API_BASE);
