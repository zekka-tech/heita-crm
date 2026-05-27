"use client";
import { useEffect } from "react";

// global-error.tsx catches errors thrown from the root layout itself.
// It must include its own <html>/<body> tags since the layout may have failed.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry is not available if the layout failed, so log for the console
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
          background: "#f8fafc",
          color: "#0f1f3d"
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
            The page could not be loaded. Our team has been notified.
            {error.digest && (
              <span style={{ display: "block", marginTop: "0.25rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                Error ID: {error.digest}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.75rem",
              background: "#0052E8",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.75rem",
              background: "transparent",
              color: "#0f1f3d",
              border: "1px solid #e2e8f0",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Go home
          </button>
        </div>
      </body>
    </html>
  );
}
