import './telemetry.js';
import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import https from 'https';
import crypto from 'crypto';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { FACE_CONFIG, WEBHOOK_CONFIG } from './config.js';
import { applyBiohash } from './core/biohash.js';
import { evaluateRisk } from './core/risk.js';
import { evaluatePassiveSignals, evaluateActiveChallenge, combineScores } from './core/liveness.js';
import { setConsent, getConsent, shouldShowConsentBanner, deleteConsent } from './legal/consent-manager.js';
import { getDSAR, setDSAR, makeReceipt } from './legal/dsar.js';
import { upsertVector, queryVector, removeUserVectors, vectorIndexMode } from './infra/vector/index.js';
import { schedulePurgeJob } from './jobs/purge.js';
import { scheduleBiasDashboardJob, recordOutcome } from './jobs/bias-dashboard.js';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=(self)');
  next();
});

const __dirname_ = path.resolve();
const CLIENT_DIR = path.join(__dirname_, 'public');
const STORAGE = path.join(__dirname_, 'storage');
const TMP = path.join(STORAGE, 'tmp');
const DSAR_EXPORTS = path.join(STORAGE, 'dsar');
const PROFILES_JSON = path.join(STORAGE, 'profiles.json');
const FACE_DB = path.join(STORAGE, 'face-users.json');
const MOD_DB = path.join(STORAGE, 'moderation.json');
const AUDIT_DB = path.join(STORAGE, 'audit-log.json');
const WEBHOOK_LOG = path.join(STORAGE, 'webhooks.json');

for (const dir of [STORAGE, TMP, DSAR_EXPORTS, CLIENT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(PROFILES_JSON)) fs.writeFileSync(PROFILES_JSON, JSON.stringify({ profiles: [] }, null, 2));
if (!fs.existsSync(FACE_DB)) fs.writeFileSync(FACE_DB, JSON.stringify({ users: [] }, null, 2));
if (!fs.existsSync(MOD_DB)) fs.writeFileSync(MOD_DB, JSON.stringify({ alerts: [] }, null, 2));
if (!fs.existsSync(AUDIT_DB)) fs.writeFileSync(AUDIT_DB, JSON.stringify({ entries: [] }, null, 2));
if (!fs.existsSync(WEBHOOK_LOG)) fs.writeFileSync(WEBHOOK_LOG, JSON.stringify({ events: [] }, null, 2));

const upload = multer({ dest: TMP });

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error('Failed to read JSON', file, err);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readProfiles() {
  return readJson(PROFILES_JSON, { profiles: [] });
}

function writeProfiles(data) {
  writeJson(PROFILES_JSON, data);
}

function readFaceUsers() {
  return readJson(FACE_DB, { users: [] });
}

function writeFaceUsers(data) {
  writeJson(FACE_DB, data);
}

function readModeration() {
  return readJson(MOD_DB, { alerts: [] });
}

function writeModeration(data) {
  writeJson(MOD_DB, data);
}

function appendWebhook(event, payload) {
  const now = new Date().toISOString();
  const body = JSON.stringify({ event, timestamp: now, payload });
  const signature = crypto.createHmac('sha256', WEBHOOK_CONFIG.hmacSecret).update(body).digest('hex');
  const log = readJson(WEBHOOK_LOG, { events: [] });
  log.events.push({ event, timestamp: now, payload, signature });
  writeJson(WEBHOOK_LOG, log);
  if (WEBHOOK_CONFIG.url) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Face-Signature': signature,
      'X-Face-Timestamp': now
    };
    const options = { method: 'POST', headers, body };
    if (WEBHOOK_CONFIG.mtlsCertPath && WEBHOOK_CONFIG.mtlsKeyPath && fs.existsSync(WEBHOOK_CONFIG.mtlsCertPath) && fs.existsSync(WEBHOOK_CONFIG.mtlsKeyPath)) {
      options.agent = new https.Agent({
        cert: fs.readFileSync(WEBHOOK_CONFIG.mtlsCertPath),
        key: fs.readFileSync(WEBHOOK_CONFIG.mtlsKeyPath),
        rejectUnauthorized: true
      });
    }
    fetch(WEBHOOK_CONFIG.url, options).catch((err) => console.error('webhook_failed', err?.message || err));
  }
}

function appendAudit(action, userId, detail) {
  const log = readJson(AUDIT_DB, { entries: [] });
  const prevHash = log.entries.length ? log.entries[log.entries.length - 1].hash : null;
  const entry = {
    id: crypto.randomUUID(),
    action,
    userId,
    detail,
    ts: Date.now(),
    prevHash
  };
  entry.hash = crypto.createHash('sha256').update(JSON.stringify({ ...entry, prevHash })).digest('hex');
  log.entries.push(entry);
  writeJson(AUDIT_DB, log);
  return entry;
}

function purgeAuditsForUser(userId) {
  const log = readJson(AUDIT_DB, { entries: [] });
  const filtered = log.entries.filter((entry) => entry.userId !== userId);
  const rebuilt = [];
  let prevHash = null;
  for (const entry of filtered) {
    const nextEntry = { ...entry, prevHash };
    nextEntry.hash = crypto.createHash('sha256').update(JSON.stringify({ ...nextEntry, prevHash })).digest('hex');
    rebuilt.push(nextEntry);
    prevHash = nextEntry.hash;
  }
  writeJson(AUDIT_DB, { entries: rebuilt });
}

function enqueueModeration(alert) {
  const data = readModeration();
  data.alerts.push(alert);
  writeModeration(data);
  appendAudit('risk_alert', alert.userId, `Queued moderation case ${alert.id}`);
  appendWebhook('risk.alert', alert);
}

function updateModeration(alertId, status, actor = 'system') {
  const data = readModeration();
  const alert = data.alerts.find((a) => a.id === alertId);
  if (!alert) return null;
  alert.status = status;
  alert.resolvedBy = actor;
  alert.resolvedAt = Date.now();
  writeModeration(data);
  appendAudit(`moderation_${status}`, alert.userId, `Case ${alert.id} marked ${status} by ${actor}`);
  if (status === 'ban' || status === 'deny') {
    appendWebhook('face.revoked', { userId: alert.userId, reason: alert.reasons });
  }
  return alert;
}

const challengeMap = new Map();

function createChallenge(userId) {
  const challengeId = crypto.randomUUID();
  const order = Math.random() > 0.5 ? ['blink', 'yaw'] : ['yaw', 'blink'];
  const challenge = {
    challengeId,
    userId,
    attempts: 0,
    createdAt: Date.now(),
    lockedUntil: null,
    order
  };
  challengeMap.set(challengeId, challenge);
  return challenge;
}

function getUserRecord(store, userId) {
  return store.users.find((u) => u.userId === userId) || null;
}

function ensureUser(store, payload) {
  let user = getUserRecord(store, payload.userId);
  if (!user) {
    user = {
      userId: payload.userId,
      tenantId: payload.tenantId || 'default',
      region: payload.region || 'global',
      createdAt: Date.now(),
      biohashes: [],
      trustedDevices: [],
      risk: { history: [] },
      consent: null,
      identificationOptIn: !!payload.identificationOptIn,
      retention: { days: FACE_CONFIG.tenantRetentionDays, keyRotationDue: Date.now() + 90 * 86400000 }
    };
    store.users.push(user);
  }
  return user;
}

function storeTrustedDevice(user, fingerprint, secureHardware) {
  if (!fingerprint) return;
  const exists = user.trustedDevices.find((d) => d.fingerprint === fingerprint);
  if (!exists) {
    user.trustedDevices.push({ fingerprint, secureHardware, boundAt: Date.now() });
  } else {
    exists.boundAt = Date.now();
    exists.secureHardware = secureHardware;
  }
}

schedulePurgeJob(console);
scheduleBiasDashboardJob(console);

app.use('/storage', express.static(STORAGE));
app.use('/admin', express.static(path.join(__dirname_, 'admin')));
app.use('/sdk', express.static(path.join(__dirname_, 'sdk')));
app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    ffmpeg: !!ffmpegPath,
    engine: !!(process.env.REPLICATE_API_TOKEN || process.env.FAL_API_KEY) ? 'configured' : 'not_configured',
    vectorIndexMode: vectorIndexMode(),
    consentVersion: FACE_CONFIG.consentVersion
  });
});

function extractAudio(inFile, outFile, cb) {
  const args = ['-y', '-i', inFile, '-vn', '-ac', '1', '-ar', '48000', '-b:a', '192k', outFile];
  const proc = spawn(ffmpegPath, args);
  let err = '';
  proc.stderr.on('data', (d) => (err += d.toString()));
  proc.on('close', (code) => cb(code === 0 ? null : new Error(err)));
}

// Voice clone endpoints retained for backwards compatibility
function uid(prefix = 'id') {
  return `${prefix}_` + Math.random().toString(36).slice(2, 10);
}

function isVideo(name, mime = '') {
  const ext = path.extname(name || '').toLowerCase();
  return mime.startsWith('video/') || ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'].includes(ext);
}

function isAudio(name, mime = '') {
  const ext = path.extname(name || '').toLowerCase();
  return mime.startsWith('audio/') || ['.wav', '.mp3', '.m4a', '.ogg', '.webm', '.aac'].includes(ext);
}

app.post('/api/enrollFromMedia', upload.single('media'), (req, res) => {
  try {
    const { name = 'Ma voix', consent } = req.body;
    if (consent !== 'true') return res.status(400).json({ error: 'consent_required' });
    if (!req.file) return res.status(400).json({ error: 'no_media' });
    const id = uid('v');
    const baseOut = path.join(STORAGE, `${id}.wav`);
    const handleEnroll = (audioPath) => {
      const data = readProfiles();
      data.profiles.push({ id, name, sample: path.basename(audioPath), createdAt: Date.now(), status: 'ready' });
      writeProfiles(data);
      res.json({ id, name, sampleUrl: `/storage/${path.basename(audioPath)}` });
    };
    if (isVideo(req.file.originalname, req.file.mimetype)) {
      extractAudio(req.file.path, baseOut, (err) => {
        try { fs.unlinkSync(req.file.path); } catch {}
        if (err) return res.status(500).json({ error: 'extract_failed', detail: String(err).slice(0, 200) });
        handleEnroll(baseOut);
      });
    } else if (isAudio(req.file.originalname, req.file.mimetype)) {
      fs.renameSync(req.file.path, baseOut);
      handleEnroll(baseOut);
    } else {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'unsupported_file' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/enroll', upload.single('audio'), (req, res) => {
  try {
    const { name = 'Ma voix', consent } = req.body;
    if (consent !== 'true') return res.status(400).json({ error: 'consent_required' });
    if (!req.file) return res.status(400).json({ error: 'no_audio' });
    const id = uid('v');
    const out = path.join(STORAGE, `${id}.wav`);
    if (isAudio(req.file.originalname, req.file.mimetype)) {
      extractAudio(req.file.path, out, (err) => {
        try { fs.unlinkSync(req.file.path); } catch {}
        if (err) return res.status(500).json({ error: 'normalize_failed' });
        const data = readProfiles();
        data.profiles.push({ id, name, sample: path.basename(out), createdAt: Date.now(), status: 'ready' });
        writeProfiles(data);
        res.json({ id, name, sampleUrl: `/storage/${path.basename(out)}` });
      });
    } else {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: 'unsupported_file' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/voices', (_, res) => res.json(readProfiles()));
app.delete('/api/voices/:id', (req, res) => {
  const data = readProfiles();
  const idx = data.profiles.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not_found' });
  const profile = data.profiles[idx];
  try { fs.unlinkSync(path.join(STORAGE, profile.sample)); } catch {}
  data.profiles.splice(idx, 1);
  writeProfiles(data);
  res.json({ ok: true });
});

app.post('/api/clone/train', (req, res) => {
  const { voiceId } = req.body || {};
  const data = readProfiles();
  const profile = data.profiles.find((p) => p.id === voiceId);
  if (!profile) return res.status(404).json({ error: 'voice_not_found' });
  profile.status = 'trained';
  writeProfiles(data);
  res.json({ ok: true, status: profile.status });
});

app.get('/api/clone/status', (req, res) => {
  const { id } = req.query;
  const data = readProfiles();
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile) return res.status(404).json({ error: 'voice_not_found' });
  res.json({ status: profile.status || 'ready' });
});

app.post('/api/tts', async (req, res) => {
  const { text, voiceId } = req.body || {};
  const hasEngine = !!(process.env.REPLICATE_API_TOKEN || process.env.FAL_API_KEY);
  if (!hasEngine) return res.status(501).json({ error: 'engine_not_configured' });
  return res.status(501).json({ error: 'adapter_missing', text, voiceId });
});

app.post('/api/convert', upload.single('audio'), (req, res) => {
  try {
    const { semitones = '0' } = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'no_audio' });
    const ratio = Math.pow(2, parseFloat(semitones) / 12);
    const out = path.join(TMP, uid('conv') + '.wav');
    const args = ['-y', '-i', req.file.path, '-af', `asetrate=48000*${ratio},aresample=48000,atempo=${(1 / ratio).toFixed(4)}`, '-ac', '1', '-ar', '48000', out];
    const proc = spawn(ffmpegPath, args);
    let err = '';
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      try { fs.unlinkSync(req.file.path); } catch {}
      if (code !== 0) return res.status(500).json({ error: 'convert_failed', detail: err.slice(0, 200) });
      const buf = fs.readFileSync(out);
      try { fs.unlinkSync(out); } catch {}
      res.setHeader('Content-Type', 'audio/wav');
      res.send(buf);
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

function computeCosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1;
  return dot / denom;
}

function requireBiohashPayload(body) {
  if (!Array.isArray(body.embedding) || body.embedding.length !== 512) {
    throw new Error('invalid_embedding');
  }
  if (!body.userSeed) {
    throw new Error('missing_user_seed');
  }
}

app.post('/v1/face/enroll', (req, res) => {
  try {
    requireBiohashPayload(req.body);
    const {
      userId,
      tenantId = 'default',
      region = 'global',
      embedding,
      userSeed,
      passiveSignals,
      deviceFingerprint,
      secureHardware,
      consentVersion = FACE_CONFIG.consentVersion,
      identificationOptIn = false
    } = req.body;
    if (!userId) return res.status(400).json({ error: 'missing_user' });
    const store = readFaceUsers();
    const user = ensureUser(store, { userId, tenantId, region, identificationOptIn });
    const consent = setConsent(userId, { version: consentVersion, analytics: !!req.body.analyticsOptIn, biometrics: true });
    user.consent = consent;
    user.identificationOptIn = !!identificationOptIn;
    const hashed = applyBiohash(embedding, userSeed);
    const passiveScore = evaluatePassiveSignals(passiveSignals);
    user.biohashes.push({
      vector: Array.from(hashed),
      createdAt: Date.now(),
      passiveScore,
      deviceFingerprint,
      secureHardware,
      version: consent.version
    });
    storeTrustedDevice(user, deviceFingerprint, secureHardware);
    writeFaceUsers(store);
    upsertVector({ tenantId, region, userId, vector: hashed, allowMultiple: !!identificationOptIn });
    appendAudit('face_enroll', userId, `Enrollment with passive score ${passiveScore.toFixed(2)}`);
    appendWebhook('face.enrolled', { userId, tenantId, region });
    res.json({ ok: true, consent, trustedDevices: user.trustedDevices });
  } catch (err) {
    console.error('enroll_error', err);
    res.status(400).json({ error: err.message || 'bad_request' });
  }
});

app.post('/v1/face/verify', (req, res) => {
  try {
    requireBiohashPayload(req.body);
    const {
      userId,
      embedding,
      userSeed,
      passiveSignals,
      activeChallenge = { blink: false, yaw: false },
      deviceFingerprint,
      secureHardware,
      velocityCounters,
      abuseFlags,
      ip,
      asn,
      geo
    } = req.body;
    if (!userId) return res.status(400).json({ error: 'missing_user' });
    const store = readFaceUsers();
    const user = getUserRecord(store, userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    const hashed = applyBiohash(embedding, userSeed);
    let best = null;
    for (const candidate of user.biohashes) {
      const similarity = computeCosine(candidate.vector, hashed);
      if (!best || similarity > best.similarity) {
        best = { candidate, similarity };
      }
    }
    const passiveScore = evaluatePassiveSignals(passiveSignals);
    const activeScore = evaluateActiveChallenge(activeChallenge);
    const combined = combineScores({ cosineSimilarity: best?.similarity || 0, passiveScore, activeScore, alpha: FACE_CONFIG.alpha, beta: FACE_CONFIG.beta });
    const newDevice = !user.trustedDevices.find((d) => d.fingerprint === deviceFingerprint);
    const risk = evaluateRisk({ ip, asn, geo, deviceFingerprint, newDevice, velocityCounters, abuseFlags });
    if (risk.block) {
      const alert = {
        id: crypto.randomUUID(),
        userId,
        score: risk.riskScore,
        reasons: risk.reasons,
        createdAt: Date.now(),
        status: 'pending'
      };
      enqueueModeration(alert);
      return res.status(423).json({ error: 'risk_block', risk });
    }
    if (!best || combined < FACE_CONFIG.livenessThreshold) {
      recordOutcome('global', 'false_reject');
      appendWebhook('liveness.failed', { userId, combined, passiveScore, activeScore });
      if (risk.requireLiveness) {
        const challenge = createChallenge(userId);
        return res.status(403).json({ error: 'liveness_required', challenge, risk });
      }
      return res.status(401).json({ error: 'no_match', combined, risk });
    }
    recordOutcome('global', 'true_accept');
    user.risk.history.push({ ts: Date.now(), risk });
    storeTrustedDevice(user, deviceFingerprint, secureHardware);
    writeFaceUsers(store);
    const response = {
      ok: true,
      similarity: best.similarity,
      combined,
      risk,
      trustedDevices: user.trustedDevices
    };
    if (risk.requireLiveness) {
      const challenge = createChallenge(userId);
      response.challenge = challenge;
    }
    res.json(response);
  } catch (err) {
    console.error('verify_error', err);
    res.status(400).json({ error: err.message || 'bad_request' });
  }
});

app.post('/v1/face/identify', (req, res) => {
  try {
    requireBiohashPayload(req.body);
    const { embedding, userSeed, tenantId = 'default', region = 'global' } = req.body;
    const hashed = applyBiohash(embedding, userSeed);
    const results = queryVector({ tenantId, region, vector: hashed, limit: FACE_CONFIG.identificationLimit });
    res.json({ matches: results });
  } catch (err) {
    res.status(400).json({ error: err.message || 'bad_request' });
  }
});

app.post('/v1/face/recheck', (req, res) => {
  const { challengeId, blink, yaw, deviceFingerprint } = req.body || {};
  if (!challengeId) return res.status(400).json({ error: 'missing_challenge' });
  const state = challengeMap.get(challengeId);
  if (!state) return res.status(404).json({ error: 'challenge_not_found' });
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    const remaining = state.lockedUntil - Date.now();
    return res.status(429).json({ error: 'challenge_cooldown', cooldownMs: remaining });
  }
  state.attempts += 1;
  const activeScore = evaluateActiveChallenge({ blink: !!blink, yaw: !!yaw });
  if (activeScore >= 0.8) {
    state.passed = true;
    state.lockedUntil = Date.now() + FACE_CONFIG.challengeCooldownMs;
    appendAudit('liveness_pass', state.userId, `Challenge ${challengeId} passed`);
    recordOutcome('global', 'true_accept');
    challengeMap.set(challengeId, state);
    return res.json({ ok: true, challengeId, activeScore, order: state.order, deviceFingerprint });
  }
  if (state.attempts >= FACE_CONFIG.challengeMaxAttempts) {
    state.lockedUntil = Date.now() + FACE_CONFIG.challengeCooldownMs;
    appendWebhook('liveness.failed', { userId: state.userId, challengeId, activeScore });
    recordOutcome('global', 'false_reject');
    return res.status(423).json({ error: 'challenge_locked', cooldownMs: FACE_CONFIG.challengeCooldownMs });
  }
  challengeMap.set(challengeId, state);
  res.status(401).json({ error: 'challenge_failed', attempt: state.attempts, order: state.order });
});

function ensureChallengeCompletion(userId, challengeId) {
  if (!challengeId) {
    return { ok: false, challenge: createChallenge(userId) };
  }
  const state = challengeMap.get(challengeId);
  if (!state || state.userId !== userId || !state.passed) {
    return { ok: false, challenge: state || createChallenge(userId) };
  }
  challengeMap.delete(challengeId);
  return { ok: true };
}

function handleProtectedAction(req, res, action) {
  const { userId, challengeId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const store = readFaceUsers();
  const user = getUserRecord(store, userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const enforcement = ensureChallengeCompletion(userId, challengeId);
  if (!enforcement.ok) {
    return res.status(403).json({ error: 'liveness_required', challenge: enforcement.challenge, action });
  }
  appendAudit(`protected_${action}`, userId, `Completed protected action ${action}`);
  res.json({ ok: true, action });
}

app.post('/v1/protected/send-message', (req, res) => handleProtectedAction(req, res, 'send_message'));
app.post('/v1/protected/mass-like', (req, res) => handleProtectedAction(req, res, 'mass_like'));
app.post('/v1/protected/login', (req, res) => handleProtectedAction(req, res, 'login_new_device'));

app.get('/v1/legal/consent', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const consent = getConsent(userId);
  res.json({ consent, showBanner: shouldShowConsentBanner(userId, FACE_CONFIG.consentVersion) });
});

app.post('/v1/legal/consent', (req, res) => {
  const { userId, analytics = false, biometrics = true, version = FACE_CONFIG.consentVersion } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const record = setConsent(userId, { version, analytics: !!analytics, biometrics: !!biometrics });
  res.json({ ok: true, consent: record });
});

app.get('/v1/dsar/status', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const record = getDSAR(userId);
  res.json({ record: record || { status: 'none' } });
});

app.post('/v1/dsar/export', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const store = readFaceUsers();
  const user = getUserRecord(store, userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const exportPayload = {
    user: {
      userId: user.userId,
      tenantId: user.tenantId,
      region: user.region,
      biohashes: user.biohashes,
      trustedDevices: user.trustedDevices,
      consent: user.consent
    },
    consent: getConsent(userId),
    dsar: getDSAR(userId)
  };
  const exportPath = path.join(DSAR_EXPORTS, `${userId}-${Date.now()}.json`);
  fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2));
  const record = {
    userId,
    status: 'export_ready',
    requestedAt: Date.now(),
    completedAt: Date.now(),
    exportPath
  };
  setDSAR(record);
  res.json({ ok: true, exportPath });
});

app.delete('/v1/dsar/erase', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'missing_user' });
  const store = readFaceUsers();
  const user = getUserRecord(store, userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  removeUserVectors({ tenantId: user.tenantId, region: user.region, userId });
  const nextUsers = store.users.filter((u) => u.userId !== userId);
  writeFaceUsers({ users: nextUsers });
  deleteConsent(userId);
  purgeAuditsForUser(userId);
  const receipt = makeReceipt(userId, 'erase');
  setDSAR({ userId, status: 'erased', requestedAt: Date.now(), completedAt: Date.now(), receipt });
  appendWebhook('face.revoked', { userId, reason: 'dsar_erase' });
  res.json({ ok: true, receipt });
});

app.get('/admin/api/queue', (req, res) => {
  const data = readModeration();
  const audits = readJson(AUDIT_DB, { entries: [] }).entries.slice(-50).reverse();
  res.json({ alerts: data.alerts.filter((a) => a.status === 'pending'), audits });
});

app.post('/admin/api/queue/action', (req, res) => {
  const { alertId, action } = req.body || {};
  if (!alertId || !action) return res.status(400).json({ error: 'invalid_payload' });
  const result = updateModeration(alertId, action, req.headers['x-admin-user'] || 'admin');
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, alert: result });
});

const PORT = process.env.PORT || 5173;
let serverInstance;
if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(PORT, () => {
    console.log('Face auth suite running at http://localhost:' + PORT);
  });
}

export { app, serverInstance };
