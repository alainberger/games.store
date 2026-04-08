// ── multiplayer.js ─ Socket / Lobby / Chat ────────────────────────────────

import { toast, esc, $ } from './ui.js';
import { getProfile, avatarUrl } from './auth.js';

export let socket = null;
let _lobbyId = null;

export function getSocket()         { return socket; }
export function getActiveLobbyId()  { return _lobbyId; }

const GAME_LABELS = {
  'dayzero':       '☠ DayZero',
  'mini-survival': '🌲 Mini Survival',
  'battle-lite':   '⚔ Battle Lite',
  'arcade-horde':  '🎮 Arcade Horde',
};

// ── INIT ───────────────────────────────────────────────────────────────────
export function initSocket(token) {
  if (!window.io) return;
  socket = io();

  socket.on('connect', () => {
    socket.emit('auth', { token });
  });

  socket.on('auth_ok',   () => { /* authenticated */ });
  socket.on('auth_fail', () => toast('Erreur authentification socket', 'error'));

  socket.on('lobbies',       renderLobbies);
  socket.on('lobby_update',  onLobbyUpdate);
  socket.on('chat',          appendChat);
  socket.on('matchmake_result', onMatchResult);

  socket.on('online_count', count => {
    const el = $('hOnline');
    if (el) el.textContent = count;
  });

  // Initial lobby load
  fetch('/api/lobbies')
    .then(r => r.json())
    .then(data => renderLobbies(data))
    .catch(() => {});
}

// ── LOBBY UI ───────────────────────────────────────────────────────────────
export function setupLobbyUI(onGameStart) {
  // Create lobby
  $('createLobbyBtn')?.addEventListener('click', () => {
    const name = $('lobbyName')?.value.trim();
    const game = $('lobbyGame')?.value;
    if (!name) { toast('Entrez un nom de lobby', 'warning'); return; }
    socket?.emit('create_lobby', { name, game, pseudo: getProfile()?.pseudo || 'Guest' });
    if ($('lobbyName')) $('lobbyName').value = '';
    toast('Lobby créé !', 'success');
  });

  // Auto matchmake
  $('autoMatchBtn')?.addEventListener('click', () => {
    const game = $('matchGame')?.value;
    const btn  = $('autoMatchBtn');
    const st   = $('mmStatus');
    if (btn) { btn.textContent = 'Recherche...'; btn.disabled = true; }
    if (st)  st.innerHTML = `<span class="dot-on" style="background:var(--warn);box-shadow:0 0 5px var(--warn)"></span><span>Recherche...</span>`;
    socket?.emit('auto_matchmake', { game, pseudo: getProfile()?.pseudo || 'Guest' });
    // Timeout fallback
    setTimeout(() => {
      if (btn && btn.disabled) {
        btn.textContent = 'TROUVER UNE PARTIE'; btn.disabled = false;
        if (st) st.innerHTML = `<span class="dot-off"></span><span>Prêt</span>`;
      }
    }, 12000);
  });

  // Leave lobby
  $('leaveLobbyBtn')?.addEventListener('click', () => {
    if (!_lobbyId) return;
    socket?.emit('leave_lobby', { lobbyId: _lobbyId, pseudo: getProfile()?.pseudo || 'Guest' });
    _lobbyId = null;
    _resetActiveLobbyUI();
    toast('Lobby quitté', 'info');
  });

  // Start game from lobby
  $('startFromLobbyBtn')?.addEventListener('click', () => {
    if (!_lobbyId) return;
    const game = $('lobbyGame')?.value || 'dayzero';
    onGameStart?.(game);
  });

  // Chat
  const sendChat = () => {
    const inp = $('chatInput');
    const msg = inp?.value.trim();
    if (!msg || !_lobbyId) return;
    socket?.emit('chat', { lobbyId: _lobbyId, message: msg, pseudo: getProfile()?.pseudo || 'Guest' });
    if (inp) inp.value = '';
  };
  $('sendChatBtn')?.addEventListener('click', sendChat);
  $('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
}

// ── RENDER LOBBIES ─────────────────────────────────────────────────────────
function renderLobbies(lobbies) {
  const list = $('lobbyList');
  const cb   = $('lobbyCountBadge');
  const hl   = $('hLobbies');
  const arr  = Array.isArray(lobbies) ? lobbies : Object.values(lobbies || {});
  if (cb) cb.textContent = arr.length;
  if (hl) hl.textContent = arr.length;
  if (!list) return;
  if (arr.length === 0) { list.innerHTML = '<div class="empty-st">Aucun lobby actif</div>'; return; }
  list.innerHTML = '';
  arr.forEach(lb => {
    const pc   = typeof lb.players === 'number' ? lb.players : (lb.players?.length || 0);
    const mine = _lobbyId === lb.id;
    const div  = document.createElement('div');
    div.className = 'litem';
    div.innerHTML = `
      <div class="litem-info">
        <div class="litem-name">${esc(lb.name)}</div>
        <div class="litem-meta">${GAME_LABELS[lb.game]||lb.game} · ${pc}/8</div>
      </div>
      <button class="${mine?'btn-outline':'btn-primary'} btn-xs" ${mine?'disabled':''} data-lid="${esc(lb.id)}">
        ${mine ? 'Rejoint' : 'Rejoindre'}
      </button>`;
    div.querySelector('button')?.addEventListener('click', () => joinLobby(lb.id));
    list.appendChild(div);
  });
}

export function joinLobby(id) {
  if (_lobbyId === id) return;
  socket?.emit('join_lobby', { lobbyId: id, pseudo: getProfile()?.pseudo || 'Guest' });
  _lobbyId = id;
  toast('Lobby rejoint !', 'success');
}

// ── LOBBY UPDATE ───────────────────────────────────────────────────────────
function onLobbyUpdate(lb) {
  if (!lb) return;
  // Accept if it's a lobby we just joined or our current lobby
  if (_lobbyId && lb.id !== _lobbyId) return;
  if (!_lobbyId) _lobbyId = lb.id;

  const title    = $('activeLobbyTitle');
  const content  = $('activeLobbyContent');
  const noMsg    = $('noLobbyMsg');
  const leaveBtn = $('leaveLobbyBtn');
  const gameBadge= $('alGameBadge');
  const pCount   = $('alPlayerCount');
  const pList    = $('lobbyPlayersList');
  const chatIn   = $('chatInput');
  const sendBtn  = $('sendChatBtn');
  const chatSt   = $('chatStatus');

  if (title)    title.textContent = esc(lb.name);
  if (content)  content.style.display = '';
  if (noMsg)    noMsg.style.display = 'none';
  if (leaveBtn) leaveBtn.style.display = '';
  if (gameBadge)gameBadge.textContent = GAME_LABELS[lb.game] || lb.game;

  const players = lb.players || [];
  if (pCount) pCount.textContent = `${players.length}/8 joueurs`;

  if (pList) {
    pList.innerHTML = '';
    players.forEach(pseudo => {
      const me = getProfile()?.pseudo;
      const d  = document.createElement('div');
      d.className = 'lplayer';
      d.innerHTML = `
        <img class="lplayer-av" src="${avatarUrl(pseudo)}" alt="${esc(pseudo)}" loading="lazy" />
        <span class="lplayer-name">${esc(pseudo)}</span>
        ${pseudo === me ? '<span class="badge" style="margin-left:auto">Vous</span>' : ''}`;
      pList.appendChild(d);
    });
  }

  if (chatIn) chatIn.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  if (chatSt) chatSt.innerHTML = `<span class="dot-on"></span><span>${esc(lb.name)}</span>`;
}

// ── CHAT ───────────────────────────────────────────────────────────────────
function appendChat({ pseudo, message, at, system }) {
  const log = $('chatLog');
  if (!log) return;
  log.querySelector('.chat-welcome')?.remove();
  const d   = document.createElement('div');
  d.className = `cmsg${system ? ' sys' : ''}`;
  const tm  = at ? new Date(at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '';
  d.innerHTML = system
    ? `<div class="cmsg-text">${esc(message)}</div>`
    : `<div class="cmsg-hd"><span class="cmsg-pseudo">${esc(pseudo)}</span><span class="cmsg-time">${tm}</span></div><div class="cmsg-text">${esc(message)}</div>`;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

// ── MATCHMAKE RESULT ───────────────────────────────────────────────────────
function onMatchResult(data) {
  const btn = $('autoMatchBtn');
  const st  = $('mmStatus');
  if (btn) { btn.textContent = 'TROUVER UNE PARTIE'; btn.disabled = false; }
  if (st)  st.innerHTML = `<span class="dot-on"></span><span>Trouvé !</span>`;
  _lobbyId = data.lobbyId;
  toast(`Match trouvé : ${data.lobbyName}`, 'success');
  setTimeout(() => { if (st) st.innerHTML = `<span class="dot-off"></span><span>Prêt</span>`; }, 5000);
}

// ── RESET ACTIVE LOBBY UI ──────────────────────────────────────────────────
function _resetActiveLobbyUI() {
  const els = {
    activeLobbyTitle: e => e.textContent = 'AUCUN LOBBY',
    activeLobbyContent: e => e.style.display = 'none',
    noLobbyMsg: e => e.style.display = '',
    leaveLobbyBtn: e => e.style.display = 'none',
    chatInput: e => e.disabled = true,
    sendChatBtn: e => e.disabled = true,
    chatStatus: e => e.innerHTML = `<span class="dot-off"></span><span>Rejoignez un lobby</span>`,
  };
  for (const [id, fn] of Object.entries(els)) { const el = $(id); if (el) fn(el); }
}
