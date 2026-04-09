// ── pseudo.js ─ Simple pseudo management (no auth) ────────────────────────

const KEY = 'survivalhub_pseudo';

export function getPseudo() {
  return localStorage.getItem(KEY) || '';
}

export function setPseudo(p) {
  const safe = String(p || '').trim().slice(0, 20);
  localStorage.setItem(KEY, safe);
  return safe;
}

export function hasPseudo() {
  return getPseudo().length >= 2;
}

export function clearPseudo() {
  localStorage.removeItem(KEY);
}
