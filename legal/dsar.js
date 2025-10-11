import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const DSAR_PATH = path.join(STORAGE_ROOT, 'dsar.json');

function ensureStore() {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  if (!fs.existsSync(DSAR_PATH)) fs.writeFileSync(DSAR_PATH, JSON.stringify({ records: [] }, null, 2));
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DSAR_PATH, 'utf-8'));
}

function writeStore(data) {
  fs.writeFileSync(DSAR_PATH, JSON.stringify(data, null, 2));
}

export function getDSAR(userId) {
  return readStore().records.find((r) => r.userId === userId) || null;
}

export function setDSAR(record) {
  const data = readStore();
  const idx = data.records.findIndex((r) => r.userId === record.userId);
  if (idx >= 0) data.records[idx] = record; else data.records.push(record);
  writeStore(data);
}

export function makeReceipt(userId, action) {
  const secret = process.env.DSAR_RECEIPT_SECRET || 'dsar_dev_secret';
  const payload = `${userId}:${action}:${Date.now()}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
}
