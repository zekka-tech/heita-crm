import { context, trace, type SpanStatusCode, type Tracer } from "@opentelemetry/api";

const tracer: Tracer = trace.getTracer("heita-crm");

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  execute: () => Promise<T>
) {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        span.setAttribute(key, value);
      }
    }

    try {
      const result = await execute();
      span.setStatus({ code: 1 as SpanStatusCode });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: 2 as SpanStatusCode, message: error instanceof Error ? error.message : "error" });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function currentTraceId() {
  return trace.getSpan(context.active())?.spanContext().traceId ?? null;
}
