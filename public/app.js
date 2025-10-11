import { WebFaceSDK } from '/sdk/face/web/wasm.js';

const sdk = new WebFaceSDK();
const enrollForm = document.getElementById('enroll-form');
const verifyForm = document.getElementById('verify-form');
const identifyForm = document.getElementById('identify-form');
const enrollStatus = document.getElementById('enroll-status');
const verifyStatus = document.getElementById('verify-status');
const identifyStatus = document.getElementById('identify-status');
const consentBanner = document.getElementById('consent-banner');
const consentVersionEl = document.getElementById('consent-version');
const consentAcceptBtn = document.getElementById('consent-accept');
const consentAnalytics = document.getElementById('consent-analytics');
const protectedStatus = document.getElementById('protected-status');
const protectedUser = document.getElementById('protected-user');
const protectedChallenge = document.getElementById('protected-challenge');
const dsarUser = document.getElementById('dsar-user');
const dsarOutput = document.getElementById('dsar-output');

const toastTemplate = document.getElementById('toast-template');
let toastHost;
let pendingChallenge = null;

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw Object.assign(new Error(detail.error || res.statusText), { detail });
  }
  return res.json();
}

function parseEmbedding(value) {
  const parts = String(value || '').split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length === 0) {
    throw new Error('Provide embedding values');
  }
  if (parts.length < 512) {
    while (parts.length < 512) parts.push(0);
  }
  return parts.slice(0, 512);
}

function showToast(message, tone = 'default') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-container';
    document.body.appendChild(toastHost);
  }
  const node = toastTemplate.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  if (tone === 'danger') node.style.borderColor = 'rgba(255,107,107,0.6)';
  toastHost.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

async function hydrateHealth() {
  try {
    const health = await fetchJSON('/api/health');
    consentVersionEl.textContent = health.consentVersion;
  } catch (err) {
    console.warn('Health check failed', err);
  }
}

hydrateHealth();

async function refreshConsent(userId) {
  if (!userId) return;
  try {
    const { consent, showBanner } = await fetchJSON(`/v1/legal/consent?userId=${encodeURIComponent(userId)}`);
    consentBanner.hidden = !showBanner;
    consentAnalytics.checked = !!consent?.analytics;
    consentAcceptBtn.dataset.userId = userId;
  } catch (err) {
    console.warn('Consent lookup failed', err);
  }
}

consentAcceptBtn.addEventListener('click', async () => {
  const userId = consentAcceptBtn.dataset.userId;
  if (!userId) return;
  try {
    await fetchJSON('/v1/legal/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, analytics: consentAnalytics.checked, biometrics: true })
    });
    showToast('Consent saved');
    consentBanner.hidden = true;
  } catch (err) {
    showToast(`Consent failed: ${err.message}`, 'danger');
  }
});

enrollForm.userId.addEventListener('blur', (e) => refreshConsent(e.target.value));

enrollForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(enrollForm);
  try {
    const payload = Object.fromEntries(data.entries());
    const embedding = parseEmbedding(payload.embedding);
    const response = await sdk.enroll({
      userId: payload.userId,
      tenantId: payload.tenantId,
      region: payload.region,
      userSeed: payload.userSeed,
      embedding,
      passiveSignals: { glareScore: 0.1, moireScore: 0.1, flatnessScore: 0.1 },
      consentVersion: consentVersionEl.textContent,
      identificationOptIn: data.has('identificationOptIn'),
      analyticsOptIn: data.has('analyticsOptIn')
    });
    enrollStatus.textContent = `Enrolled. Trusted devices: ${response.trustedDevices.length}`;
    dsarUser.value = payload.userId;
    protectedUser.value = payload.userId;
    refreshConsent(payload.userId);
    showToast('Enrollment complete');
  } catch (err) {
    enrollStatus.textContent = `Error: ${err.message}`;
    showToast(`Enroll failed: ${err.message}`, 'danger');
  }
});

function openLivenessModal(challenge) {
  pendingChallenge = challenge;
  const modal = document.getElementById('liveness-modal');
  modal.hidden = false;
  document.getElementById('modal-blink').checked = false;
  document.getElementById('modal-yaw').checked = false;
  document.getElementById('modal-status').textContent = '';
  document.getElementById('liveness-instructions').textContent = `Complete sequence: ${challenge.order.join(' → ')}`;
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  pendingChallenge = null;
  document.getElementById('liveness-modal').hidden = true;
});

async function submitModalChallenge() {
  if (!pendingChallenge) return;
  const blink = document.getElementById('modal-blink').checked;
  const yaw = document.getElementById('modal-yaw').checked;
  try {
    const result = await sdk.recheckLiveness({
      challengeId: pendingChallenge.challengeId,
      blink,
      yaw
    });
    document.getElementById('modal-status').textContent = `Score ${result.activeScore.toFixed(2)}`;
    document.getElementById('liveness-modal').hidden = true;
    protectedChallenge.value = pendingChallenge.challengeId;
    showToast('Liveness ok');
    pendingChallenge = null;
  } catch (err) {
    document.getElementById('modal-status').textContent = err.message;
    showToast(`Challenge failed: ${err.message}`, 'danger');
  }
}

document.getElementById('modal-submit').addEventListener('click', submitModalChallenge);

verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(verifyForm);
  try {
    const payload = Object.fromEntries(data.entries());
    const embedding = parseEmbedding(payload.embedding);
    const response = await sdk.verify({
      userId: payload.userId,
      userSeed: payload.userSeed,
      embedding,
      passiveSignals: { glareScore: 0.05, moireScore: 0.1, flatnessScore: 0.08 },
      activeChallenge: { blink: data.has('blink'), yaw: data.has('yaw') },
      velocityCounters: { logins: 1 },
      geo: { country: 'FR' }
    });
    verifyStatus.textContent = `Similarity ${(response.similarity || 0).toFixed(2)} | combined ${(response.combined || 0).toFixed(2)}`;
    if (response.challenge) {
      openLivenessModal(response.challenge);
    }
  } catch (err) {
    verifyStatus.textContent = `Error: ${err.message}`;
    if (err.detail?.challenge) {
      openLivenessModal(err.detail.challenge);
    }
    showToast(`Verify failed: ${err.message}`, 'danger');
  }
});

identifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(identifyForm);
  try {
    const payload = Object.fromEntries(data.entries());
    const embedding = parseEmbedding(payload.embedding);
    const response = await sdk.identify({
      tenantId: payload.tenantId,
      region: payload.region,
      userSeed: payload.userSeed,
      embedding
    });
    identifyStatus.textContent = JSON.stringify(response.matches, null, 2);
  } catch (err) {
    identifyStatus.textContent = `Error: ${err.message}`;
  }
});

function protectedAction(action) {
  return async () => {
    if (!protectedUser.value) {
      showToast('Set user ID first', 'danger');
      return;
    }
    try {
      const body = {
        userId: protectedUser.value,
        challengeId: protectedChallenge.value || undefined
      };
      const res = await fetchJSON(`/v1/protected/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      protectedStatus.textContent = `${res.action} ok`;
      protectedChallenge.value = '';
    } catch (err) {
      protectedStatus.textContent = err.message;
      if (err.detail?.challenge) {
        openLivenessModal(err.detail.challenge);
      }
    }
  };
}

document.querySelectorAll('#protected button[data-action]').forEach((btn) => {
  btn.addEventListener('click', protectedAction(btn.dataset.action));
});

async function handleDsar(action) {
  if (!dsarUser.value) {
    showToast('Provide user id', 'danger');
    return;
  }
  try {
    if (action === 'status') {
      const data = await fetchJSON(`/v1/dsar/status?userId=${encodeURIComponent(dsarUser.value)}`);
      dsarOutput.textContent = JSON.stringify(data, null, 2);
    } else if (action === 'export') {
      const data = await fetchJSON('/v1/dsar/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: dsarUser.value })
      });
      dsarOutput.textContent = JSON.stringify(data, null, 2);
      showToast('Export ready');
    } else if (action === 'erase') {
      const data = await fetchJSON('/v1/dsar/erase', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: dsarUser.value })
      });
      dsarOutput.textContent = JSON.stringify(data, null, 2);
      showToast('Erase complete');
    }
  } catch (err) {
    dsarOutput.textContent = err.message;
  }
}

document.getElementById('dsar-status').addEventListener('click', () => handleDsar('status'));
document.getElementById('dsar-export').addEventListener('click', () => handleDsar('export'));
document.getElementById('dsar-erase').addEventListener('click', () => handleDsar('erase'));
