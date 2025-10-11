process.env.NODE_ENV = 'test';
process.env.DISABLE_TELEMETRY = '1';

import assert from 'assert';
import { app } from '../server.js';

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function makeEmbedding(seed = 0.1) {
  const arr = new Array(512).fill(0).map((_, i) => Math.fround(Math.sin(seed + i / 10) * 0.5 + 0.5));
  return arr;
}

(async () => {
  try {
    const userId = 'tester';
    const embed = makeEmbedding(0.2);

    const enroll = await request('/v1/face/enroll', {
      method: 'POST',
      body: {
        userId,
        tenantId: 'demo',
        region: 'eu-west',
        embedding: embed,
        userSeed: 'seed-123',
        passiveSignals: { glareScore: 0.1, moireScore: 0.1, flatnessScore: 0.1 },
        deviceFingerprint: 'device-1',
        secureHardware: 'webauthn'
      }
    });
    assert.strictEqual(enroll.status, 200, 'enroll should succeed');

    const verifySuccess = await request('/v1/face/verify', {
      method: 'POST',
      body: {
        userId,
        embedding: embed,
        userSeed: 'seed-123',
        passiveSignals: { glareScore: 0.05, moireScore: 0.05, flatnessScore: 0.05 },
        activeChallenge: { blink: true, yaw: true },
        deviceFingerprint: 'device-1',
        secureHardware: 'webauthn',
        velocityCounters: { logins: 1 },
        geo: { country: 'FR' }
      }
    });
    assert.strictEqual(verifySuccess.status, 200, 'verify should succeed');

    const spoof = await request('/v1/face/verify', {
      method: 'POST',
      body: {
        userId,
        embedding: makeEmbedding(1.1),
        userSeed: 'seed-123',
        passiveSignals: { glareScore: 0.9, moireScore: 0.9, flatnessScore: 0.9 },
        activeChallenge: { blink: false, yaw: false },
        deviceFingerprint: 'spoof-device',
        velocityCounters: { logins: 1 },
        geo: { country: 'FR' }
      }
    });
    assert.notStrictEqual(spoof.status, 200, 'spoof should fail');

    const risky = await request('/v1/face/verify', {
      method: 'POST',
      body: {
        userId,
        embedding: embed,
        userSeed: 'seed-123',
        passiveSignals: { glareScore: 0.2, moireScore: 0.2, flatnessScore: 0.2 },
        activeChallenge: { blink: false, yaw: false },
        deviceFingerprint: 'device-risky',
        secureHardware: 'none',
        velocityCounters: { logins: 3 },
        abuseFlags: ['spam'],
        asn: 'AS9009'
      }
    });
    assert.strictEqual(risky.status, 200, 'risk should respond with challenge');
    assert.ok(risky.data.challenge, 'challenge payload expected');
    const challengeId = risky.data.challenge.challengeId;
    const recheck = await request('/v1/face/recheck', {
      method: 'POST',
      body: { challengeId, blink: true, yaw: true }
    });
    assert.strictEqual(recheck.status, 200, 'recheck should pass');

    const dsarExport = await request('/v1/dsar/export', {
      method: 'POST',
      body: { userId }
    });
    assert.strictEqual(dsarExport.status, 200, 'export should succeed');

    const dsarErase = await request('/v1/dsar/erase', {
      method: 'DELETE',
      body: { userId }
    });
    assert.strictEqual(dsarErase.status, 200, 'erase should succeed');

    const verifyAfterErase = await request('/v1/face/verify', {
      method: 'POST',
      body: {
        userId,
        embedding: embed,
        userSeed: 'seed-123',
        passiveSignals: { glareScore: 0.05 },
        activeChallenge: { blink: true, yaw: true },
        deviceFingerprint: 'device-1'
      }
    });
    assert.strictEqual(verifyAfterErase.status, 404, 'verify after erase should fail');

    console.log('E2E tests passed');
  } catch (err) {
    console.error('E2E tests failed', err);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.exit(process.exitCode ?? 0);
  }
})();
