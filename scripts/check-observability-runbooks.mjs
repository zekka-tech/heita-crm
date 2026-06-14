#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const rules = readFileSync("prometheus-rules.yml", "utf8");
const alertMatches = [...rules.matchAll(/^\s*- alert:\s*([A-Za-z0-9_]+)/gm)];
const alertBlocks = alertMatches
  .map((match, index) => ({
    name: match[1],
    block: rules.slice(match.index, alertMatches[index + 1]?.index ?? rules.length)
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const alerts = alertBlocks.map((alert) => alert.name);

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
}

const expected = alerts.map((alert) => "docs/runbooks/" + kebab(alert) + ".md");
const missing = expected.filter((file) => {
  try {
    const content = readFileSync(file, "utf8");
    return !content.includes("# ") || !content.includes("## First checks") || !content.includes("## Mitigation");
  } catch {
    return true;
  }
});

const annotationErrors = [];
for (const alert of alertBlocks) {
  const expectedRunbook = "docs/runbooks/" + kebab(alert.name) + ".md";
  if (!alert.block.includes('runbook_url: "' + expectedRunbook + '"')) {
    annotationErrors.push(alert.name + ": missing runbook_url " + expectedRunbook);
  }
}

const expectedSet = new Set(expected);
const stale = readdirSync("docs/runbooks")
  .filter((file) => file.endsWith(".md"))
  .map((file) => join("docs/runbooks", file))
  .filter((file) => !expectedSet.has(file));

const requiredDashboardPanels = new Set([
  "HTTP error rate",
  "Availability burn rate",
  "Availability budget remaining (30d)",
  "HTTP P99 latency by route",
  "Webhook ingestion error rate by provider",
  "Webhook burn rate by provider",
  "OTP request and auth failure rates",
  "Queue completion and failure rates",
  "DLQ pending jobs",
  "AI chat error rate",
  "AI chat burn rate",
  "Redis errors"
]);

const dashboardErrors = [];
for (const file of readdirSync("dashboards").filter((entry) => entry.endsWith(".json"))) {
  const fullPath = join("dashboards", file);
  try {
    const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    if (!parsed.title || !Array.isArray(parsed.panels)) {
      dashboardErrors.push(fullPath + ": missing title or panels[]");
      continue;
    }
    if (parsed.title === "Heita CRM SLO Overview") {
      const titles = new Set(parsed.panels.map((panel) => panel?.title).filter(Boolean));
      for (const title of requiredDashboardPanels) {
        if (!titles.has(title)) dashboardErrors.push(fullPath + ": missing panel " + title);
      }
    }
  } catch (error) {
    dashboardErrors.push(fullPath + ": " + (error instanceof Error ? error.message : "invalid JSON"));
  }
}

if (!alertBlocks.length) {
  console.error("No alerts found in prometheus-rules.yml");
  process.exit(1);
}

if (missing.length || stale.length || annotationErrors.length || dashboardErrors.length) {
  for (const file of missing) console.error("Missing or incomplete runbook: " + file);
  for (const file of stale) console.error("Stale runbook without matching alert: " + file);
  for (const error of annotationErrors) console.error("Invalid alert annotation: " + error);
  for (const error of dashboardErrors) console.error("Invalid dashboard: " + error);
  process.exit(1);
}

process.stdout.write("observability runbooks OK: " + alerts.length + " alerts covered\n");
