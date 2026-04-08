// ── game.js ─ Game Management ─────────────────────────────────────────────

import { createSurvival }    from '../game/survival.js';
import { createMiniSurvival } from '../game/miniSurvival.js';
import { createBattleLite }   from '../game/battleLite.js';
import { createArcadeHorde }  from '../game/arcadeHorde.js';
import { $ }                  from './ui.js';

let _instances = {};
let _socket    = null;
let _profile   = null;

export function setSocket(s)  { _socket  = s; }
export function setProfile(p) { _profile = p; }

// ── STATIC GAME DATA ───────────────────────────────────────────────────────
export const GAMES = [
  {
    id:    'dayzero',
    title: 'DayZero',
    page:  'survivalPage',
    desc:  'Survival multijoueur en monde ouvert. Lootez, survivez, éliminez.',
    icon:  '☠',
    color: 'linear-gradient(135deg,#1a0505,#2d0e0e)',
    tags:  ['Survival','Open World','PvPvE'],
    multi: true,
  },
  {
    id:    'mini-survival',
    title: 'Mini Survival',
    page:  'miniPage',
    desc:  'Gérez vos ressources et survivez le plus longtemps possible.',
    icon:  '🌲',
    color: 'linear-gradient(135deg,#051a05,#0e2d0e)',
    tags:  ['Solo','Survie','Ressources'],
    multi: false,
  },
  {
    id:    'battle-lite',
    title: 'Battle Lite',
    page:  'battlePage',
    desc:  'Combattez des vagues d\'ennemis IA. Testez vos réflexes.',
    icon:  '⚔',
    color: 'linear-gradient(135deg,#05051a,#0e0e2d)',
    tags:  ['Combat','Solo','Action'],
    multi: false,
  },
  {
    id:    'arcade-horde',
    title: 'Arcade Horde',
    page:  'arcadePage',
    desc:  'Résistez aux hordes infinies. Battez votre record !',
    icon:  '🎮',
    color: 'linear-gradient(135deg,#1a1505,#2d230e)',
    tags:  ['Arcade','Waves','Solo'],
    multi: false,
  },
];

// ── RENDER GAMES GRID ──────────────────────────────────────────────────────
export function renderGamesGrid(onPlay) {
  const grid = $('gamesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  GAMES.forEach(g => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="gc-banner" style="background:${g.color}">
        <div class="gc-icon">${g.icon}</div>
        <div class="gc-badge ${g.multi?'multi':'solo'}">${g.multi?'Multijoueur':'Solo'}</div>
      </div>
      <div class="gc-body">
        <div class="gc-title">${g.title}</div>
        <div class="gc-desc">${g.desc}</div>
        <div class="gc-tags">${g.tags.map(t=>`<span class="gc-tag">${t}</span>`).join('')}</div>
        <button class="btn-primary btn-full" data-gid="${g.id}">JOUER</button>
      </div>`;
    card.querySelector('button').addEventListener('click', () => onPlay(g.id));
    grid.appendChild(card);
  });
}

// ── START GAME ─────────────────────────────────────────────────────────────
export function startGame(id) {
  const gd = GAMES.find(g => g.id === id);
  if (!gd) return;

  // Stop existing instance
  if (_instances[id]) { _instances[id].stop?.(); _instances[id] = null; }

  const pageEl = $(gd.page);
  if (!pageEl) return;

  // Size canvas
  const canvas = pageEl.querySelector('canvas');
  if (canvas) {
    const hudH  = pageEl.querySelector('.game-hud')?.offsetHeight || 52;
    canvas.width  = pageEl.offsetWidth  || window.innerWidth;
    canvas.height = Math.max(300, (pageEl.offsetHeight || window.innerHeight) - hudH - 36);
  }

  if (id === 'dayzero') {
    _instances[id] = createSurvival($('gameCanvas'), $('svHud'), _socket, _profile);
  } else if (id === 'mini-survival') {
    _instances[id] = createMiniSurvival($('miniCanvas'), $('msHud'));
  } else if (id === 'battle-lite') {
    _instances[id] = createBattleLite($('battleCanvas'), $('blHud'));
  } else if (id === 'arcade-horde') {
    _instances[id] = createArcadeHorde($('arcadeCanvas'), $('ahHud'));
  }

  _instances[id]?.start();
}

// ── STOP ALL ───────────────────────────────────────────────────────────────
export function stopAllGames() {
  for (const inst of Object.values(_instances)) inst?.stop?.();
  _instances = {};
}

// ── RESIZE HANDLER ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  for (const g of GAMES) {
    const page = $(g.page);
    if (!page || page.style.display === 'none') continue;
    const canvas = page.querySelector('canvas');
    if (!canvas) continue;
    const hudH  = page.querySelector('.game-hud')?.offsetHeight || 52;
    canvas.width  = page.offsetWidth  || window.innerWidth;
    canvas.height = Math.max(300, (page.offsetHeight || window.innerHeight) - hudH - 36);
  }
});
