// ── main.js ─ Entry Point ─────────────────────────────────────────────────

import { showPage, toast, setupHamburger, initHeroCanvas, hideLoading, $ } from './ui.js';
import { getToken, getProfile, loadProfile, updateNav, renderProfile, setupAuthForms, setupProfilePage, clearAuth } from './auth.js';
import { initSocket, setupLobbyUI, joinLobby, getSocket } from './multiplayer.js';
import { renderGamesGrid, startGame, stopAllGames, setSocket, setProfile, GAMES } from './game.js';

// ── PAGE MAP: game page id → game id ─────────────────────────────────────
const PAGE_TO_GAME = {
  survivalPage: 'dayzero',
  miniPage:     'mini-survival',
  battlePage:   'battle-lite',
  arcadePage:   'arcade-horde',
};

// ── LOGOUT ─────────────────────────────────────────────────────────────────
function doLogout() {
  clearAuth();
  location.reload();
}

// ── NAVIGATE TO PAGE ───────────────────────────────────────────────────────
function navigate(id) {
  if (!getToken() && id !== 'authPage') {
    toast('Connectez-vous pour accéder à cette page', 'warning');
    showPage('authPage');
    return;
  }
  // Stop any running game
  const gamePgs = Object.keys(PAGE_TO_GAME);
  if (!gamePgs.includes(id)) stopAllGames();
  // If game page, start the game after show
  if (gamePgs.includes(id)) {
    stopAllGames();
    showPage(id);
    setTimeout(() => startGame(PAGE_TO_GAME[id]), 90);
    return;
  }
  if (id === 'profilePage') renderProfile();
  showPage(id);
}

// ── EXPOSE GLOBALLY (for HUD back buttons) ────────────────────────────────
window.showPage = navigate;

// ── AFTER LOGIN: wire everything ─────────────────────────────────────────
async function onLogin() {
  const profile = getProfile();
  if (!profile) return;

  // Init socket
  initSocket(getToken());

  // Give socket a tick to connect then pass to game module
  setTimeout(() => { setSocket(getSocket()); }, 400);

  // Set profile for games
  setProfile(profile);

  // Update nav
  updateNav();

  // Setup lobby UI
  setupLobbyUI(gameId => {
    stopAllGames();
    const page = GAMES.find(g => g.id === gameId)?.page || 'survivalPage';
    showPage(page);
    setTimeout(() => startGame(gameId), 90);
  });

  // Setup profile page
  renderProfile();
  setupProfilePage();

  // Render games grid
  renderGamesGrid(gameId => {
    stopAllGames();
    const page = GAMES.find(g => g.id === gameId)?.page || 'survivalPage';
    showPage(page);
    setTimeout(() => startGame(gameId), 90);
  });

  // Hero canvas
  initHeroCanvas();

  // Show home
  showPage('homePage');
}

// ── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  // Setup hamburger
  setupHamburger();

  // Hide all pages initially
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; });

  // Brand click
  $('brandBtn')?.addEventListener('click', () => navigate(getToken() ? 'homePage' : 'authPage'));

  // Nav buttons (desktop + sidebar)
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Logout buttons
  $('logoutBtn')?.addEventListener('click', doLogout);
  $('sbLogout')?.addEventListener('click', doLogout);
  $('loginNavBtn')?.addEventListener('click', () => showPage('authPage'));

  // Hero play button
  $('heroPlayBtn')?.addEventListener('click', () => {
    stopAllGames();
    showPage('survivalPage');
    setTimeout(() => startGame('dayzero'), 90);
  });

  // HUD back buttons
  ['svBackBtn','miniBackBtn','battleBackBtn','arcadeBackBtn'].forEach(id => {
    $(id)?.addEventListener('click', () => { stopAllGames(); showPage('homePage'); });
  });

  // Setup auth forms
  setupAuthForms(async (profile) => {
    if (profile) await onLogin();
  });

  // Wait for loading animation then attempt auto-login
  await new Promise(r => setTimeout(r, 1700));
  hideLoading();

  if (getToken()) {
    try {
      await loadProfile();
      await onLogin();
    } catch {
      clearAuth();
      showPage('authPage');
    }
  } else {
    showPage('authPage');
  }
}

init();
