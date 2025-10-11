if (process.env.DISABLE_TELEMETRY !== '1' && process.env.NODE_ENV !== 'test') {
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { diag, DiagConsoleLogger, DiagLogLevel } = await import('@opentelemetry/api');
    const { TELEMETRY_CONFIG } = await import('./config.js');

    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

    const exporterOptions = {};
    if (TELEMETRY_CONFIG.endpoint) {
      exporterOptions.url = TELEMETRY_CONFIG.endpoint;
    }

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(exporterOptions),
      serviceName: TELEMETRY_CONFIG.serviceName,
      instrumentations: [getNodeAutoInstrumentations()]
    });

    sdk.start().catch((err) => {
      console.error('Telemetry start failed', err);
    });

    process.on('SIGTERM', () => {
      sdk.shutdown().catch((err) => console.error('Telemetry shutdown error', err));
    });
  } catch (err) {
    console.warn('Telemetry disabled (missing OpenTelemetry packages)', err?.message || err);
  }
}
