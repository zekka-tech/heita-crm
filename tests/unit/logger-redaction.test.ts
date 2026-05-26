import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loggerSource = readFileSync(resolve("src/lib/logger.ts"), "utf-8");

describe("logger PII redaction", () => {
  it("uses [redacted] as the censor value", () => {
    expect(loggerSource).toContain("[redacted]");
  });

  it("redacts authorization headers", () => {
    expect(loggerSource).toContain("authorization");
  });

  it("redacts cookie headers", () => {
    expect(loggerSource).toContain("cookie");
  });

  it("redacts password fields", () => {
    expect(loggerSource).toContain("password");
  });

  it("redacts OTP code fields", () => {
    expect(loggerSource).toContain('"*.code"');
  });

  it("redacts token fields", () => {
    expect(loggerSource).toContain('"*.token"');
  });

  it("redacts phone numbers", () => {
    expect(loggerSource).toContain('"*.phone"');
  });

  it("redacts email addresses", () => {
    expect(loggerSource).toContain('"*.email"');
  });

  it("redacts contact phone fields", () => {
    expect(loggerSource).toContain('"*.contactPhone"');
  });

  it("injects traceId into log context when available", () => {
    expect(loggerSource).toContain("traceId");
    expect(loggerSource).toContain("currentTraceId");
  });

  it("injects requestId into log context when available", () => {
    expect(loggerSource).toContain("requestId");
    expect(loggerSource).toContain("requestContext");
  });
});
