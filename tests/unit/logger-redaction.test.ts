import { describe, it, expect } from "vitest";
import pino from "pino";

// Build a minimal pino instance using the same redact config as the real logger
// so we test runtime behavior, not source text.
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.passwordHash",
  "*.code",
  "*.codeHash",
  "*.token",
  "*.access_token",
  "*.refresh_token",
  "*.phone",
  "*.email",
  "*.to",
  "*.contactPhone",
  "*.phoneNumber"
];

function makeTestLogger() {
  const lines: string[] = [];
  const dest = { write: (line: string) => { lines.push(line); } };
  const log = pino(
    { level: "debug", redact: { paths: REDACTED_PATHS, censor: "[redacted]" } },
    dest as unknown as Parameters<typeof pino>[1]
  );
  return { log, lines };
}

describe("logger PII redaction — runtime", () => {
  it("redacts *.phone fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ user: { phone: "+27821234567" } }, "user event");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.user.phone).toBe("[redacted]");
  });

  it("redacts *.email fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ user: { email: "user@example.com" } }, "user event");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.user.email).toBe("[redacted]");
  });

  it("redacts *.code fields (OTP)", () => {
    const { log, lines } = makeTestLogger();
    log.info({ otp: { code: "123456" } }, "otp issued");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.otp.code).toBe("[redacted]");
  });

  it("redacts *.token fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ session: { token: "super-secret-token" } }, "session created");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.session.token).toBe("[redacted]");
  });

  it("redacts *.password fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ user: { password: "hunter2" } }, "login attempt");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.user.password).toBe("[redacted]");
  });

  it("redacts *.contactPhone fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ msg_record: { contactPhone: "+27821234567" } }, "message");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.msg_record.contactPhone).toBe("[redacted]");
  });

  it("redacts req.headers.authorization", () => {
    const { log, lines } = makeTestLogger();
    log.info({ req: { headers: { authorization: "Bearer tok" } } }, "request");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.req.headers.authorization).toBe("[redacted]");
  });

  it("redacts req.headers.cookie", () => {
    const { log, lines } = makeTestLogger();
    log.info({ req: { headers: { cookie: "session=abc" } } }, "request");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.req.headers.cookie).toBe("[redacted]");
  });

  it("does not redact unrelated fields", () => {
    const { log, lines } = makeTestLogger();
    log.info({ user: { name: "Alice", id: "usr_1" } }, "user event");
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.user.name).toBe("Alice");
    expect(parsed.user.id).toBe("usr_1");
  });
});
