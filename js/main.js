// ── main.js ─ Entry Point ─────────────────────────────────────────────────

import { showPage, toast, setupHamburger, initHeroCanvas, hideLoading, $ } from './ui.js';
import { getPseudo, setPseudo, hasPseudo } from './pseudo.js';
import { initSocket, setupLobbyUI, getSocket } from './multiplayer.js';
import { renderGamesGrid, startGame, stopAllGames, setSocket, setPseudo as setGamePseudo, GAMES } from './game.js';

// ── PAGE → GAME MAP ────────────────────────────────────────────────────────
const PAGE_TO_GAME = {
  survivalPage: 'dayzero',
  miniPage:     'mini-survival',
  battlePage:   'battle-lite',
  arcadePage:   'arcade-horde',
};

// ── NAVIGATE ───────────────────────────────────────────────────────────────
function navigate(id) {
  const gamePgs = Object.keys(PAGE_TO_GAME);
  if (!gamePgs.includes(id)) stopAllGames();
  if (gamePgs.includes(id)) {
    stopAllGames();
    showPage(id);
    setTimeout(() => startGame(PAGE_TO_GAME[id]), 90);
    return;
  }
  showPage(id);
}

// Expose globally for HUD back buttons
window.showPage = navigate;

// ── AFTER PSEUDO IS SET ────────────────────────────────────────────────────
function onReady() {
  const pseudo = getPseudo();

  // Show pseudo in topbar + sidebar
  const tbPseudo = $('tbPseudo');
  if (tbPseudo) tbPseudo.textContent = pseudo;

  const tbUser = $('tbUserInfo');
  if (tbUser) tbUser.style.display = '';

  const changeBtn = $('changePseudoBtn');
  if (changeBtn) changeBtn.style.display = '';

  const sbInfo = $('sbPseudoInfo');
  if (sbInfo) { sbInfo.textContent = pseudo; sbInfo.style.display = ''; }

  const sbChange = $('sbChangePseudo');
  if (sbChange) sbChange.style.display = '';

  // Init socket
  initSocket();

  // Give socket time to connect then pass to game module
  setTimeout(() => { setSocket(getSocket()); }, 400);

  // Set pseudo for game factories
  setGamePseudo(pseudo);

  // Setup lobby UI
  setupLobbyUI(gameId => {
    stopAllGames();
    const page = GAMES.find(g => g.id === gameId)?.page || 'survivalPage';
    showPage(page);
    setTimeout(() => startGame(gameId), 90);
  });

  // Render games grid
  renderGamesGrid(gameId => {
    stopAllGames();
    const page = GAMES.find(g => g.id === gameId)?.page || 'survivalPage';
    showPage(page);
    setTimeout(() => startGame(gameId), 90);
  });

  // Animated hero canvas
  initHeroCanvas();

  // Navigate to home
  showPage('homePage');
}

// ── PSEUDO FORM ────────────────────────────────────────────────────────────
function setupPseudoForm() {
  const input   = $('pseudoInput');
  const playBtn = $('pseudoPlayBtn');
  const msg     = $('pseudoMsg');

  const clearMsg = () => { if (msg) { msg.textContent = ''; msg.className = 'pseudo-msg'; } };

  const doPlay = () => {
    const val = input?.value.trim() || '';
    if (val.length < 2) {
      if (msg) { msg.textContent = 'Pseudo trop court (min. 2 caractères)'; msg.className = 'pseudo-msg error'; }
      input?.focus();
      return;
    }
    clearMsg();
    setPseudo(val);
    onReady();
  };

  // Pre-fill if returning user
  if (input && getPseudo()) input.value = getPseudo();

  playBtn?.addEventListener('click', doPlay);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') doPlay(); });
  input?.addEventListener('input', clearMsg);
}

// ── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  setupHamburger();

  // Hide all pages initially
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; });

  // Brand click
  $('brandBtn')?.addEventListener('click', () => navigate(hasPseudo() ? 'homePage' : 'pseudoPage'));

  // Nav buttons (desktop + sidebar)
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Change pseudo buttons
  const goToPseudo = () => { stopAllGames(); showPage('pseudoPage'); };
  $('changePseudoBtn')?.addEventListener('click', goToPseudo);
  $('sbChangePseudo')?.addEventListener('click', goToPseudo);

  // Hero play button → DayZero multiplayer
  $('heroPlayBtn')?.addEventListener('click', () => {
    stopAllGames();
    showPage('survivalPage');
    setTimeout(() => startGame('dayzero'), 90);
  });

  // HUD back buttons
  ['svBackBtn', 'miniBackBtn', 'battleBackBtn', 'arcadeBackBtn'].forEach(id => {
    $(id)?.addEventListener('click', () => { stopAllGames(); showPage('homePage'); });
  });

  // Setup pseudo form
  setupPseudoForm();

  // Wait for loading animation
  await new Promise(r => setTimeout(r, 1700));
  hideLoading();

  // Auto-login if pseudo already saved
  if (hasPseudo()) {
    onReady();
  } else {
    showPage('pseudoPage');
    $('pseudoInput')?.focus();
  }
}

init();
