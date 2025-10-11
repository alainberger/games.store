import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const CONSENT_PATH = path.join(STORAGE_ROOT, 'consent.json');

interface ConsentRecord {
  userId: string;
  version: string;
  analytics: boolean;
  biometrics: boolean;
  timestamp: number;
}

function ensureStore() {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  if (!fs.existsSync(CONSENT_PATH)) fs.writeFileSync(CONSENT_PATH, JSON.stringify({ records: [] }, null, 2));
}

function readStore(): { records: ConsentRecord[] } {
  ensureStore();
  return JSON.parse(fs.readFileSync(CONSENT_PATH, 'utf-8'));
}

function writeStore(data: { records: ConsentRecord[] }) {
  fs.writeFileSync(CONSENT_PATH, JSON.stringify(data, null, 2));
}

export function getConsent(userId: string): ConsentRecord | null {
  const data = readStore();
  return data.records.find((r) => r.userId === userId) || null;
}

export function setConsent(userId: string, payload: Omit<ConsentRecord, 'userId' | 'timestamp'> & { timestamp?: number }): ConsentRecord {
  const data = readStore();
  let record = data.records.find((r) => r.userId === userId);
  const timestamp = payload.timestamp ?? Date.now();
  if (!record) {
    record = { userId, version: payload.version, analytics: payload.analytics, biometrics: payload.biometrics, timestamp };
    data.records.push(record);
  } else {
    record.version = payload.version;
    record.analytics = payload.analytics;
    record.biometrics = payload.biometrics;
    record.timestamp = timestamp;
  }
  writeStore(data);
  return record;
}

export function shouldShowConsentBanner(userId: string, currentVersion: string): boolean {
  const record = getConsent(userId);
  return !record || record.version !== currentVersion;
}

export function listConsents(): ConsentRecord[] {
  return readStore().records;
}

export function deleteConsent(userId: string) {
  const data = readStore();
  const next = data.records.filter((r) => r.userId !== userId);
  if (next.length !== data.records.length) {
    writeStore({ records: next });
  }
}
