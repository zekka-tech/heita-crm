// Sentry initialisation per Next.js 15 instrumentation conventions.
// The runtime-specific Sentry SDK is loaded only for the matching runtime
// so node-only modules do not get bundled into the edge worker.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { registerNodeTelemetry } = await import("./instrumentation.node");
    await registerNodeTelemetry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Next.js 15 calls `onRequestError` for every uncaught server-component or
// route-handler exception. Sentry's Next SDK exports `captureRequestError`
// for this purpose — re-export under the Next-conventional name.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
