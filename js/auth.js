// ── auth.js ─ Authentication & Profile ───────────────────────────────────

import { toast, esc, $ } from './ui.js';

let _token = localStorage.getItem('token') || '';
let _profile = null;

export function getToken()       { return _token; }
export function getProfile()     { return _profile; }
export function clearAuth()      { _token=''; _profile=null; localStorage.removeItem('token'); }

export const AVATAR_STYLES = [
  { id:'bottts',      label:'Robot'   },
  { id:'avataaars',   label:'Classic' },
  { id:'pixel-art',   label:'Pixel'   },
  { id:'adventurer',  label:'Hero'    },
  { id:'fun-emoji',   label:'Emoji'   },
  { id:'lorelei',     label:'Sketch'  },
  { id:'notionists',  label:'Notion'  },
  { id:'open-peeps',  label:'Peeps'   },
];

const LEVEL_NAMES = ['Novice','Survivant','Chasseur','Guerrier','Vétéran','Expert','Élite','Légende','Mythique'];

export function avatarUrl(seed, style = 'bottts') {
  return `https://api.dicebear.com/8.x/${style}/svg?seed=${encodeURIComponent(seed || 'survivor')}&backgroundColor=060a06`;
}

// ── API HELPER ─────────────────────────────────────────────────────────────
export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (_token) headers.Authorization = `Bearer ${_token}`;
  const r = await fetch(path, { ...opts, headers });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Erreur serveur (${r.status})`);
  return d;
}

// ── AUTH ACTIONS ───────────────────────────────────────────────────────────
export async function doLogin(email, password) {
  const d = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ email, password }) });
  _token = d.token;
  localStorage.setItem('token', _token);
  _profile = await api('/api/profile');
  return _profile;
}

export async function doRegister(pseudo, email, password) {
  const d = await api('/api/auth/register', { method:'POST', body:JSON.stringify({ email, password, pseudo }) });
  _token = d.token;
  localStorage.setItem('token', _token);
  _profile = await api('/api/profile');
  return _profile;
}

export async function loadProfile() {
  _profile = await api('/api/profile');
  return _profile;
}

// ── NAV UPDATE ─────────────────────────────────────────────────────────────
export function updateNav() {
  if (!_profile) return;
  const av  = $('tbAvatar'), ps = $('tbPseudo');
  const inf = $('tbUserInfo'), lb = $('logoutBtn'), ln = $('loginNavBtn'), sb = $('sbLogout');
  if (av)  av.src = _profile.avatar || avatarUrl(_profile.pseudo);
  if (ps)  ps.textContent = _profile.pseudo || 'Survivant';
  if (inf) inf.style.display = 'flex';
  if (lb)  lb.style.display = 'flex';
  if (ln)  ln.style.display = 'none';
  if (sb)  sb.style.display = 'block';
}

// ── PROFILE PAGE ───────────────────────────────────────────────────────────
export function renderProfile() {
  if (!_profile) return;
  const p   = _profile;
  const av  = p.avatar || avatarUrl(p.pseudo);
  const el  = id => $(id);

  if (el('profileAvatar')) el('profileAvatar').src = av;
  if (el('profilePseudo')) el('profilePseudo').value = p.pseudo || '';

  // Extract seed from DiceBear URL
  try {
    const url = new URL(p.avatar || '', 'http://x');
    const seed = decodeURIComponent(url.searchParams.get('seed') || p.pseudo || 'survivor');
    if (el('avatarSeed')) el('avatarSeed').value = seed;
  } catch { if (el('avatarSeed')) el('avatarSeed').value = p.pseudo || 'survivor'; }

  const stats = p.stats || {};
  if (el('sKills'))  el('sKills').textContent  = stats.kills  || 0;
  if (el('sDeaths')) el('sDeaths').textContent = stats.deaths || 0;
  if (el('sWins'))   el('sWins').textContent   = stats.wins   || 0;
  if (el('sXP'))     el('sXP').textContent     = stats.xp     || 0;

  const xp   = stats.xp || 0;
  const lvl  = Math.floor(xp / 1000) + 1;
  const xpIn = xp % 1000;
  if (el('levelBadge')) el('levelBadge').textContent = lvl;
  if (el('levelTitle')) el('levelTitle').textContent = LEVEL_NAMES[Math.min(lvl-1, LEVEL_NAMES.length-1)];
  if (el('xpBar'))   el('xpBar').style.width = (xpIn / 10) + '%';
  if (el('xpText'))  el('xpText').textContent = `${xpIn} / 1000 XP`;

  _renderInventory(p.progress?.inventory || []);
}

function _renderInventory(inv) {
  const g = $('inventoryGrid');
  if (!g) return;
  const ICONS = { food:'🥫', water:'💧', ammo:'🔫', medkit:'🩹', pistol:'🔫', bandage:'🩹', rifle:'🎯', grenade:'💣' };
  if (!Array.isArray(inv) || inv.length === 0) {
    g.innerHTML = '<div class="inv-empty">Aucun item</div>'; return;
  }
  const counts = {};
  for (const item of inv) counts[item] = (counts[item] || 0) + 1;
  g.innerHTML = '';
  for (const [item, count] of Object.entries(counts)) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.title = `${item} ×${count}`;
    slot.innerHTML = `${ICONS[item]||'📦'}<span class="icount">${count}</span>`;
    g.appendChild(slot);
  }
}

// ── SETUP PROFILE PAGE UI ──────────────────────────────────────────────────
export function setupProfilePage() {
  let selStyle = _extractStyle(_profile?.avatar) || 'bottts';
  const grid = $('avatarStyleGrid');

  if (grid) {
    grid.innerHTML = '';
    AVATAR_STYLES.forEach(s => {
      const btn = document.createElement('button');
      btn.className = `avs-btn${s.id === selStyle ? ' sel' : ''}`;
      btn.type = 'button'; btn.title = s.label;
      const seed = $('avatarSeed')?.value || _profile?.pseudo || 'survivor';
      btn.innerHTML = `<img src="${avatarUrl(seed, s.id)}" alt="${s.label}" loading="lazy" />`;
      btn.addEventListener('click', () => {
        selStyle = s.id;
        grid.querySelectorAll('.avs-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        _previewAvatar(selStyle);
      });
      grid.appendChild(btn);
    });
  }

  $('avatarSeed')?.addEventListener('input', () => _previewAvatar(selStyle));

  $('randomSeedBtn')?.addEventListener('click', () => {
    const seed = Math.random().toString(36).substring(2, 10);
    if ($('avatarSeed')) $('avatarSeed').value = seed;
    _previewAvatar(selStyle);
  });

  $('saveProfileBtn')?.addEventListener('click', async () => {
    const pseudo = $('profilePseudo')?.value.trim();
    const seed   = $('avatarSeed')?.value.trim() || pseudo || 'survivor';
    const av     = avatarUrl(seed, selStyle);
    const btn    = $('saveProfileBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde...'; }
    try {
      _profile = await api('/api/profile', { method:'PUT', body:JSON.stringify({ pseudo, avatar:av }) });
      updateNav();
      renderProfile();
      toast('Profil sauvegardé !', 'success');
    } catch(e) { toast(e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'SAUVEGARDER'; } }
  });
}

function _previewAvatar(style) {
  const seed = $('avatarSeed')?.value || _profile?.pseudo || 'survivor';
  const url  = avatarUrl(seed, style);
  if ($('profileAvatar')) $('profileAvatar').src = url;
  // Update style grid thumbnails
  const grid = $('avatarStyleGrid');
  if (grid) {
    const imgs = grid.querySelectorAll('.avs-btn img');
    AVATAR_STYLES.forEach((s, i) => { if (imgs[i]) imgs[i].src = avatarUrl(seed, s.id); });
  }
}

function _extractStyle(url) {
  if (!url) return null;
  const m = url.match(/\/8\.x\/([^/]+)\//);
  return m ? m[1] : null;
}

// ── AUTH FORM SETUP ────────────────────────────────────────────────────────
export function setupAuthForms(onSuccess) {
  function setMsg(txt, type) {
    const el = $('authMsg');
    if (el) { el.textContent = txt; el.className = `auth-msg ${type}`; }
  }

  // Tab switching
  $('atab-login')?.addEventListener('click', () => _switchTab('login'));
  $('atab-register')?.addEventListener('click', () => _switchTab('register'));
  $('toRegisterLink')?.addEventListener('click', e => { e.preventDefault(); _switchTab('register'); });
  $('toLoginLink')?.addEventListener('click', e => { e.preventDefault(); _switchTab('login'); });

  // Login
  $('loginBtn')?.addEventListener('click', async () => {
    const btn = $('loginBtn');
    const email = $('loginEmail')?.value.trim();
    const pw    = $('loginPassword')?.value;
    if (!email || !pw) { setMsg('Remplissez tous les champs', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Connexion...';
    try {
      const p = await doLogin(email, pw);
      setMsg('', '');
      await onSuccess(p);
    } catch(e) { setMsg(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'SE CONNECTER'; }
  });

  // Enter key on password field
  $('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn')?.click(); });

  // Register
  $('registerBtn')?.addEventListener('click', async () => {
    const btn    = $('registerBtn');
    const pseudo = $('regPseudo')?.value.trim();
    const email  = $('regEmail')?.value.trim();
    const pw     = $('regPassword')?.value;
    if (!pseudo || !email || !pw) { setMsg('Remplissez tous les champs', 'error'); return; }
    if (pw.length < 6) { setMsg('Mot de passe : minimum 6 caractères', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Création...';
    try {
      const p = await doRegister(pseudo, email, pw);
      setMsg('', '');
      await onSuccess(p);
    } catch(e) { setMsg(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'CRÉER UN COMPTE'; }
  });
}

function _switchTab(tab) {
  $('atab-login')?.classList.toggle('active', tab === 'login');
  $('atab-register')?.classList.toggle('active', tab === 'register');
  if ($('form-login'))    $('form-login').style.display    = tab === 'login'    ? '' : 'none';
  if ($('form-register')) $('form-register').style.display = tab === 'register' ? '' : 'none';
  const m = $('authMsg');
  if (m) { m.textContent = ''; m.className = 'auth-msg'; }
}
