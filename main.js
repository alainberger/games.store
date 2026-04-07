import { socket, connectSocket, wireLobby } from './multiplayer/socket.js';
import { createSurvival } from './game/survival.js';
import { createMiniSurvival } from './game/miniSurvival.js';
import { createBattleLite } from './game/battleLite.js';
import { createArcadeHorde } from './game/arcadeHorde.js';

const el = (id) => document.getElementById(id);
const pages = {
  auth: el('authPage'), home: el('homePage'), profile: el('profilePage'), lobby: el('lobbyPage'),
  survival: el('survivalPage'), mini: el('miniPage'), battle: el('battlePage'), arcade: el('arcadePage'),
};

const state = { token: localStorage.getItem('token') || '', profile: null, activeLobbyId: null };
let modules = {};

function show(name) {
  Object.values(pages).forEach((p) => p.classList.remove('active'));
  pages[name].classList.add('active');
  Object.entries(modules).forEach(([k, m]) => (k === name ? m.start?.() : m.stop?.()));
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(path, { ...options, headers });
  if (!r.ok) throw new Error((await r.json()).error || 'API error');
  return r.json();
}

async function initAuth() {
  const msg = el('authMsg');
  el('loginBtn').onclick = async () => {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: el('email').value, password: el('password').value }),
      });
      state.token = data.token;
      localStorage.setItem('token', state.token);
      await afterLogin();
    } catch (e) { msg.textContent = e.message; }
  };
  el('registerBtn').onclick = async () => {
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: el('email').value, password: el('password').value, pseudo: el('pseudo').value }),
      });
      state.token = data.token;
      localStorage.setItem('token', state.token);
      await afterLogin();
    } catch (e) { msg.textContent = e.message; }
  };
  el('logoutBtn').onclick = () => { localStorage.removeItem('token'); location.reload(); };
}

async function renderHome() {
  const games = await api('/api/games');
  el('gamesGrid').innerHTML = games.map((g) => `<div class="card game-card"><h4>${g.name}</h4><p>${g.mode}</p><button data-open="${g.id}">Jouer</button></div>`).join('');
  el('gamesGrid').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.open;
      if (id === 'dayzero') show('survival');
      if (id === 'mini-survival') show('mini');
      if (id === 'battle-lite') show('battle');
      if (id === 'arcade-horde') show('arcade');
    };
  });
}

async function renderProfile() {
  state.profile = await api('/api/profile');
  el('avatar').src = state.profile.avatar;
  el('pseudoInput').value = state.profile.pseudo;
  el('stats').textContent = `Kills:${state.profile.stats.kills} Deaths:${state.profile.stats.deaths} Wins:${state.profile.stats.wins} XP:${state.profile.stats.xp} Level:${state.profile.progress.level}`;
  el('saveProfile').onclick = async () => {
    state.profile = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ pseudo: el('pseudoInput').value }) });
    await renderProfile();
  };
}

async function setupLobbies() {
  const renderLobbies = (lobbies) => {
    const box = el('lobbyList');
    box.innerHTML = lobbies.map((l) => `<div class="card"><b>${l.name}</b><div>${l.game} | ${l.players} joueurs</div><button data-join="${l.id}">Rejoindre</button></div>`).join('');
    box.querySelectorAll('button').forEach((b) => b.onclick = () => {
      state.activeLobbyId = b.dataset.join;
      socket.emit('join_lobby', { lobbyId: state.activeLobbyId });
    });
  };

  wireLobby({
    onLobbies: renderLobbies,
    onLobbyUpdate: (lobby) => { state.activeLobbyId = lobby.id; },
    onChat: (line) => {
      const p = document.createElement('p');
      p.className = 'chat-line';
      p.textContent = `${line.pseudo}: ${line.message}`;
      el('chatLog').appendChild(p);
      el('chatLog').scrollTop = 999999;
    },
  });

  const lobbies = await api('/api/lobbies');
  renderLobbies(lobbies);

  el('createLobby').onclick = () => socket.emit('create_lobby', { name: el('lobbyName').value || 'Nouveau lobby', game: el('lobbyGame').value });
  el('autoMatch').onclick = () => socket.emit('auto_matchmake', { game: el('lobbyGame').value });
  el('sendChat').onclick = () => {
    if (!state.activeLobbyId) return;
    socket.emit('chat', { lobbyId: state.activeLobbyId, message: el('chatInput').value, pseudo: state.profile?.pseudo || 'guest' });
    el('chatInput').value = '';
  };
}

function setupNav() {
  document.querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => show(b.dataset.page);
  });
  el('hamburger').onclick = () => el('menu').classList.toggle('open');
}

async function afterLogin() {
  connectSocket(state.token);
  await renderProfile();
  await renderHome();
  await setupLobbies();

  modules = {
    survival: createSurvival(el('gameCanvas'), el('hud'), socket, state.profile),
    mini: createMiniSurvival(el('miniCanvas'), el('miniHud')),
    battle: createBattleLite(el('battleCanvas'), el('battleHud')),
    arcade: createArcadeHorde(el('arcadeCanvas'), el('arcadeHud')),
  };
  setupNav();
  show('home');
}

initAuth();
if (state.token) {
  afterLogin().catch(() => show('auth'));
} else {
  show('auth');
}
