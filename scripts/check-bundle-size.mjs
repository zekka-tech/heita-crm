#!/usr/bin/env node
/* eslint-disable no-console */
// Dependency-free bundle-size budget gate (replaces the unmaintained
// `bundlesize` package, which dragged in vulnerable axios/github-build/tmp).
//
// For each budget below, every matching chunk under .next/static/chunks is
// gzipped and compared against maxSize. The check fails if any file exceeds
// its budget. Globs are matched non-recursively within the chunks directory,
// matching the previous `bundlesize` config semantics (and `bytes`-style
// 1024-based kB units).

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CHUNKS_DIR = ".next/static/chunks";

/** @type {{ comment: string, pattern: RegExp, maxBytes: number, label: string }[]} */
const BUDGETS = [
  {
    // React + Next.js runtime — fixed upstream cost, not actionable
    label: "framework-*.js",
    pattern: /^framework-.*\.js$/,
    maxBytes: 500 * 1024
  },
  {
    // Next.js main runtime chunk
    label: "main-*.js",
    pattern: /^main-.*\.js$/,
    maxBytes: 130 * 1024
  },
  {
    // Per-route JS chunks — Recharts is lazy-loaded so it never lands here;
    // 200 kB gzip is the ceiling for any single route bundle
    label: "*.js",
    pattern: /^.*\.js$/,
    maxBytes: 200 * 1024
  }
];

function gzipBytes(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

if (!existsSync(CHUNKS_DIR)) {
  console.error(`✘ ${CHUNKS_DIR} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const files = readdirSync(CHUNKS_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".js"))
  .map((d) => d.name);

let failed = 0;
let checked = 0;

for (const budget of BUDGETS) {
  const matches = files.filter((name) => budget.pattern.test(name));
  for (const name of matches) {
    const size = gzipBytes(join(CHUNKS_DIR, name));
    checked++;
    const over = size > budget.maxBytes;
    if (over) failed++;
    const mark = over ? "✘" : "✓";
    const detail = `${fmt(size)} / ${fmt(budget.maxBytes)} gzip`;
    console.log(`${mark} [${budget.label}] ${name} — ${detail}${over ? "  OVER BUDGET" : ""}`);
  }
}

console.log("");
if (failed > 0) {
  console.error(`✘ Bundle size budget: ${failed} file(s) over budget.`);
  process.exit(1);
}
console.log(`✓ Bundle size budget: ${checked} file(s) within budget.`);
