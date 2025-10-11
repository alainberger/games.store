# Changelog

## face-auth advanced pack (privacy-first)

### Added
- Face authentication REST API with cancellable biohash transformation, passive/active liveness scoring, secure device binding, and vector search partitioned by tenant/region.
- Client SDK stubs (`sdk/face/`) including web WASM adapter plus iOS/Android interfaces for Core ML / TF-Lite.
- Risk engine with policy-based liveness escalation, moderation queue, and webhook fan-out (mTLS + HMAC).
- Adaptive re-verification hooks for protected actions with randomized challenges and UI modal.
- Consent banner + DSAR endpoints (status, export, erase) with signed receipts and retention-aware purge job.
- OpenTelemetry instrumentation bootstrap, bias dashboard monitoring job, and Netlify security headers.
- Admin back-office for moderation actions with immutable audit chaining.
- Public dashboard interface showcasing SDK usage and DSAR controls.

### Changed
- Server now exports the Express app, enforces strict security headers, and stores only biohashed embeddings (raw vectors never persist).
- Updated package scripts, dependencies, and added comprehensive E2E regression tests.

### Environment
- `FACE_SIM_THRESHOLD` (default `0.78`)
- `FACE_IDENTIFICATION_LIMIT` (default `5`)
- `FACE_ALPHA` (default `0.7`)
- `FACE_BETA` (default `0.3`)
- `FACE_LIVENESS_THRESHOLD` (default `0.72`)
- `FACE_CHALLENGE_COOLDOWN_MS` (default `180000`)
- `FACE_CHALLENGE_MAX_ATTEMPTS` (default `3`)
- `FACE_CONSENT_VERSION` (default `2024-07`)
- `FACE_RETENTION_DAYS` (default `365`)
- `VECTOR_INDEX_MODE` (default `hnsw`)
- `VECTOR_KMS_KEY`
- `FACE_WEBHOOK_URL`
- `FACE_WEBHOOK_SECRET` (defaults to development secret)
- `FACE_WEBHOOK_MTLS_KEY`
- `FACE_WEBHOOK_MTLS_CERT`
- `DSAR_RECEIPT_SECRET`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_TRACES_SAMPLER_ARG`
