#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = "src/app";
const AUDIT_DOC = "docs/FORCE_DYNAMIC_AUDIT.md";

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const forceDynamicFiles = walk(APP_DIR)
  .filter((file) => readFileSync(file, "utf8").includes('dynamic = "force-dynamic"'))
  .map((file) => relative(process.cwd(), file))
  .sort();

const audit = readFileSync(AUDIT_DOC, "utf8");
const documented = new Set(
  [...audit.matchAll(/`(src\/app\/[^`]+)`/g)].map((match) => match[1])
);
const missing = forceDynamicFiles.filter((file) => !documented.has(file));
const stale = [...documented].filter((file) => !forceDynamicFiles.includes(file));

if (missing.length || stale.length) {
  if (missing.length) {
    console.error("Missing force-dynamic audit entries:");
    for (const file of missing) console.error(` - ${file}`);
  }
  if (stale.length) {
    console.error("Stale force-dynamic audit entries:");
    for (const file of stale) console.error(` - ${file}`);
  }
  process.exit(1);
}

process.stdout.write(`force-dynamic audit OK: ${forceDynamicFiles.length} entries documented\n`);
