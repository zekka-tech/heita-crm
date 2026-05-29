// OTel NodeSDK initialization for the Node.js runtime.
// Called from src/instrumentation.ts when NEXT_RUNTIME === "nodejs".
//
// When OTLP_ENDPOINT is set, all spans are forwarded to the specified OTLP HTTP
// collector (Tempo, Jaeger, Grafana, etc.) alongside Sentry's built-in tracing.
//
// Required packages:
//   npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http

interface NodeSdkModule {
  NodeSDK: new (opts: { resource: unknown; traceExporter: unknown }) => {
    start: () => void;
    shutdown: () => Promise<unknown>;
  };
}

interface OtlpExporterModule {
  OTLPTraceExporter: new (opts: { url: string }) => unknown;
}

interface ResourcesModule {
  Resource: new (attrs: Record<string, unknown>) => unknown;
}

interface SemconvModule {
  SEMRESATTRS_SERVICE_NAME?: string;
  ATTR_SERVICE_NAME?: string;
}

export async function registerNodeTelemetry() {
  const endpoint = process.env.OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  try {
    // Dynamic imports so the module resolves at runtime; TypeScript skips
    // type-checking for modules that aren't installed yet.
    const [sdkMod, exporterMod, resourcesMod, semconvMod] = (await Promise.all([
      import("@opentelemetry/sdk-node" as string),
      import("@opentelemetry/exporter-trace-otlp-http" as string),
      import("@opentelemetry/resources" as string),
      import("@opentelemetry/semantic-conventions" as string)
    ])) as [NodeSdkModule, OtlpExporterModule, ResourcesModule, SemconvModule];

    const { NodeSDK } = sdkMod;
    const { OTLPTraceExporter } = exporterMod;
    const { Resource } = resourcesMod;
    const SEMRESATTRS_SERVICE_NAME =
      semconvMod.SEMRESATTRS_SERVICE_NAME ?? semconvMod.ATTR_SERVICE_NAME ?? "service.name";

    const sdk = new NodeSDK({
      resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: "heita-crm" }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
    });

    sdk.start();

    process.on("SIGTERM", () => {
      sdk.shutdown().catch(() => undefined);
    });
  } catch (err) {
    // Non-fatal: Sentry's built-in OTel instrumentation still captures traces.
    console.warn(
      "[heita] OTLP_ENDPOINT is set but OTel SDK packages are missing.",
      "Run: npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http",
      err instanceof Error ? err.message : err
    );
  }
}
