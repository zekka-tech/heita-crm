// Copies the Tesseract.js worker + WASM core assets out of node_modules into
// public/tesseract/ so they are served same-origin. This is required because
// the app enforces a strict CSP (script-src 'strict-dynamic', connect-src
// allowlist, worker-src 'self'); loading Tesseract's worker/core from the
// jsDelivr CDN would be blocked. See src/middleware.ts buildCsp().
//
// The language traineddata (public/tesseract/lang/eng.traineddata.gz) is
// committed directly to the repo (Tesseract.js does not bundle it in
// node_modules), so it is intentionally NOT copied here.
//
// Wired into npm "prebuild" + "postinstall". Idempotent.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const outDir = join(process.cwd(), "public", "tesseract");
mkdirSync(outDir, { recursive: true });

// Resolve package locations without hard-coding node_modules layout.
const tesseractDist = dirname(require.resolve("tesseract.js/package.json")) + "/dist";
const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));

// The browser worker entry point (loaded via workerPath).
const workerFiles = ["worker.min.js"];

// Core WASM glue files. The .wasm binary is base64-embedded inside each .wasm.js,
// so no separate .wasm fetch happens at runtime. We ship the LSTM variants
// (we run in LSTM_ONLY mode) for every SIMD capability tier; Tesseract's
// feature detection picks the best one the browser supports.
const coreFiles = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js"
];

let copied = 0;
for (const f of workerFiles) {
  const src = join(tesseractDist, f);
  if (!existsSync(src)) throw new Error(`Missing Tesseract worker asset: ${src}`);
  copyFileSync(src, join(outDir, f));
  copied += 1;
}
for (const f of coreFiles) {
  const src = join(coreDir, f);
  if (!existsSync(src)) throw new Error(`Missing Tesseract core asset: ${src}`);
  copyFileSync(src, join(outDir, f));
  copied += 1;
}

// eslint-disable-next-line no-console -- build-time progress output
console.log(`[copy-tesseract-assets] copied ${copied} files to ${outDir}`);
