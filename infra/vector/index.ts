import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');
const VECTOR_PATH = path.join(STORAGE_ROOT, 'vector-index.bin');
const MODE = (process.env.VECTOR_INDEX_MODE || 'hnsw').toLowerCase();
const KEY = process.env.VECTOR_KMS_KEY || 'vector_dev_key_vector_dev_key_32';

interface VectorRecord {
  userId: string;
  vector: number[];
  createdAt: number;
}

interface Partition {
  tenantId: string;
  region: string;
  vectors: VectorRecord[];
}

interface IndexStore {
  partitions: Partition[];
}

function ensureStore(): IndexStore {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  if (!fs.existsSync(VECTOR_PATH)) {
    const payload = JSON.stringify({ partitions: [] });
    fs.writeFileSync(VECTOR_PATH, encrypt(Buffer.from(payload)));
  }
  return readStore();
}

function encrypt(data: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(KEY).slice(0, 32), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(data: Buffer): Buffer {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const payload = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(KEY).slice(0, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

function readStore(): IndexStore {
  if (!fs.existsSync(VECTOR_PATH)) return { partitions: [] };
  const decrypted = decrypt(fs.readFileSync(VECTOR_PATH));
  return JSON.parse(decrypted.toString());
}

function writeStore(store: IndexStore) {
  fs.writeFileSync(VECTOR_PATH, encrypt(Buffer.from(JSON.stringify(store))));
}

function partitionKey(tenantId: string, region: string) {
  return `${tenantId || 'default'}::${region || 'global'}`;
}

function getPartition(store: IndexStore, tenantId: string, region: string): Partition {
  const key = partitionKey(tenantId, region);
  let part = store.partitions.find((p) => partitionKey(p.tenantId, p.region) === key);
  if (!part) {
    part = { tenantId: tenantId || 'default', region: region || 'global', vectors: [] };
    store.partitions.push(part);
  }
  return part;
}

export function upsertVector({ tenantId, region, userId, vector, allowMultiple }: { tenantId: string; region: string; userId: string; vector: Float32Array; allowMultiple: boolean; }) {
  const store = ensureStore();
  const part = getPartition(store, tenantId, region);
  if (!allowMultiple) {
    part.vectors = part.vectors.filter((v) => v.userId !== userId);
  }
  const record: VectorRecord = { userId, vector: Array.from(vector), createdAt: Date.now() };
  part.vectors.push(record);
  writeStore(store);
}

export function removeUserVectors({ tenantId, region, userId }: { tenantId: string; region: string; userId: string }) {
  const store = ensureStore();
  const part = getPartition(store, tenantId, region);
  const before = part.vectors.length;
  part.vectors = part.vectors.filter((v) => v.userId !== userId);
  if (part.vectors.length !== before) {
    writeStore(store);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1;
  return dot / denom;
}

export function queryVector({ tenantId, region, vector, limit }: { tenantId: string; region: string; vector: Float32Array; limit: number; }) {
  const store = ensureStore();
  const part = getPartition(store, tenantId, region);
  const candidates = part.vectors.map((record) => ({
    userId: record.userId,
    similarity: cosineSimilarity(record.vector, Array.from(vector))
  }));
  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, limit);
}

export function vectorIndexMode(): string {
  return MODE;
}
