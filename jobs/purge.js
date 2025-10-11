import fs from 'fs';
import path from 'path';
import { FACE_CONFIG } from '../config.js';

const FACE_PATH = path.join(process.cwd(), 'storage', 'face-users.json');

function readUsers() {
  if (!fs.existsSync(FACE_PATH)) return { users: [] };
  return JSON.parse(fs.readFileSync(FACE_PATH, 'utf-8'));
}

function writeUsers(data) {
  fs.writeFileSync(FACE_PATH, JSON.stringify(data, null, 2));
}

export function schedulePurgeJob(logger = console) {
  const interval = 24 * 60 * 60 * 1000; // daily
  setInterval(() => {
    const store = readUsers();
    const now = Date.now();
    let changed = false;
    store.users = store.users.filter((user) => {
      const retentionDays = user.retention?.days ?? FACE_CONFIG.tenantRetentionDays;
      const cutoff = user.retention?.purgeAt ?? (user.createdAt + retentionDays * 86400000);
      if (cutoff && now > cutoff) {
        changed = true;
        logger.warn(`[purge] Removing user ${user.userId} due to retention policy`);
        return false;
      }
      return true;
    });
    if (changed) {
      writeUsers(store);
    }
  }, interval).unref();
}
