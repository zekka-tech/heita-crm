/* eslint-disable no-console */

// Ad-hoc responsive-overflow audit. Loads public routes at mobile/tablet/desktop
// widths and reports (a) page-level horizontal overflow and (b) any element
// whose content overflows its own box (a common cause of text overlap).
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const ROUTES = ["/", "/discover", "/pricing", "/sign-in", "/onboard", "/terms", "/privacy"];
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

const findings = [];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
    } catch (e) {
      findings.push({ vp: vp.name, route, type: "load-error", detail: String(e).slice(0, 120) });
      continue;
    }
    await page.waitForTimeout(400);

    // (a) page-level horizontal overflow
    const pageOverflow = await page.evaluate((w) => {
      const doc = document.documentElement;
      return doc.scrollWidth > w + 1 ? doc.scrollWidth : 0;
    }, vp.width);
    if (pageOverflow) findings.push({ vp: vp.name, route, type: "page-x-overflow", detail: `scrollWidth=${pageOverflow} > ${vp.width}` });

    // (b) elements whose own content overflows their box (text overlap risk)
    const boxes = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll("h1,h2,h3,h4,p,span,a,button,li,div");
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.overflow !== "visible" && cs.overflowX !== "visible") continue; // clipped/scroll boxes are intentional
        const overX = el.scrollWidth - el.clientWidth;
        if (overX > 2 && el.clientWidth > 0 && (el.textContent || "").trim().length) {
          const r = el.getBoundingClientRect();
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 60),
            text: (el.textContent || "").trim().slice(0, 40),
            overX, w: Math.round(r.width),
          });
        }
      }
      // de-dup by text+tag, keep worst
      const seen = new Map();
      for (const o of out) {
        const k = o.tag + "|" + o.text;
        if (!seen.has(k) || seen.get(k).overX < o.overX) seen.set(k, o);
      }
      return [...seen.values()].sort((a, b) => b.overX - a.overX).slice(0, 8);
    });
    for (const b of boxes) findings.push({ vp: vp.name, route, type: "content-overflow", detail: `<${b.tag}> "${b.text}" overflows ${b.overX}px (box ${b.w}px) cls="${b.cls}"` });
  }
  await ctx.close();
}
await browser.close();

if (!findings.length) {
  console.log("✓ No page-level or content overflow detected on public routes at mobile/tablet/desktop.");
} else {
  console.log(`Found ${findings.length} potential issue(s):\n`);
  for (const f of findings) console.log(`  [${f.vp}] ${f.route} — ${f.type}: ${f.detail}`);
}
