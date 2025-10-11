export const FACE_CONFIG = {
  similarityThreshold: parseFloat(process.env.FACE_SIM_THRESHOLD || '0.78'),
  identificationLimit: parseInt(process.env.FACE_IDENTIFICATION_LIMIT || '5', 10),
  alpha: parseFloat(process.env.FACE_ALPHA || '0.7'),
  beta: parseFloat(process.env.FACE_BETA || '0.3'),
  livenessThreshold: parseFloat(process.env.FACE_LIVENESS_THRESHOLD || '0.72'),
  challengeCooldownMs: parseInt(process.env.FACE_CHALLENGE_COOLDOWN_MS || '180000', 10),
  challengeMaxAttempts: parseInt(process.env.FACE_CHALLENGE_MAX_ATTEMPTS || '3', 10),
  consentVersion: process.env.FACE_CONSENT_VERSION || '2024-07',
  tenantRetentionDays: parseInt(process.env.FACE_RETENTION_DAYS || '365', 10)
};

export const TELEMETRY_CONFIG = {
  serviceName: process.env.OTEL_SERVICE_NAME || 'face-auth',
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
  samplingRatio: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1')
};

export const WEBHOOK_CONFIG = {
  url: process.env.FACE_WEBHOOK_URL || '',
  hmacSecret: process.env.FACE_WEBHOOK_SECRET || 'webhook_dev_secret',
  mtlsKeyPath: process.env.FACE_WEBHOOK_MTLS_KEY || '',
  mtlsCertPath: process.env.FACE_WEBHOOK_MTLS_CERT || ''
};
