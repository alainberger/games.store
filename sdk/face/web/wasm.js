const DEFAULT_CONFIG = {
  baseUrl: '/v1/face',
  recheckUrl: '/v1/face/recheck',
  dsarStatusUrl: '/v1/dsar/status'
};

function getDeviceFingerprint() {
  const stored = localStorage.getItem('face_sdk_device_fp');
  if (stored) return stored;
  const fp = crypto.randomUUID();
  localStorage.setItem('face_sdk_device_fp', fp);
  return fp;
}

export class WebFaceSDK {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deviceFingerprint = getDeviceFingerprint();
  }

  async enroll({ userId, embedding, userSeed, passiveSignals, consentVersion, tenantId, region }) {
    const payload = {
      userId,
      tenantId,
      region,
      embedding,
      userSeed,
      passiveSignals,
      deviceFingerprint: this.deviceFingerprint,
      secureHardware: window.PublicKeyCredential ? 'webauthn' : 'none',
      consentVersion
    };
    const res = await fetch(`${this.config.baseUrl}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('enroll_failed');
    return res.json();
  }

  async verify({ userId, embedding, userSeed, passiveSignals, velocityCounters, abuseFlags, ip, asn, geo }) {
    const payload = {
      userId,
      embedding,
      userSeed,
      passiveSignals,
      deviceFingerprint: this.deviceFingerprint,
      secureHardware: window.PublicKeyCredential ? 'webauthn' : 'none',
      velocityCounters,
      abuseFlags,
      ip,
      asn,
      geo
    };
    const res = await fetch(`${this.config.baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('verify_failed');
    return res.json();
  }

  async identify({ embedding, tenantId, region, userSeed }) {
    const payload = { embedding, tenantId, region, userSeed };
    const res = await fetch(`${this.config.baseUrl}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('identify_failed');
    return res.json();
  }

  async recheckLiveness({ challengeId, blink, yaw }) {
    const payload = {
      challengeId,
      blink,
      yaw,
      deviceFingerprint: this.deviceFingerprint
    };
    const res = await fetch(this.config.recheckUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('recheck_failed');
    return res.json();
  }
}

export const adapters = {
  web: () => new WebFaceSDK(),
  wasm: () => new WebFaceSDK()
};
