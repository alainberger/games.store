// ── ui.js ─ UI utilities ──────────────────────────────────────────────────

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

export function $(id) { return document.getElementById(id); }

// ── TOASTS ────────────────────────────────────────────────────────────────
export function toast(msg, type = 'success') {
  const c = $('toastContainer');
  if (!c) return;
  const icons = { success:'✓', error:'✗', warning:'⚠', info:'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||'✓'}</span><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
}

// ── PAGE NAVIGATION ────────────────────────────────────────────────────────
let _page = null;
export function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; });
  const el = $(id);
  if (!el) return;
  el.style.display = '';
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = '';
  _page = id;
  document.querySelectorAll('.nav-btn,.sb-btn').forEach(b => {
    b.classList.toggle('act', b.dataset.page === id);
  });
  closeSidebar();
}
export function currentPage() { return _page; }

// ── LOADING SCREEN ─────────────────────────────────────────────────────────
export function hideLoading() {
  setTimeout(() => $('loadingScreen')?.classList.add('gone'), 200);
}

// ── HAMBURGER / SIDEBAR ───────────────────────────────────────────────────
export function setupHamburger() {
  $('hamburgerBtn')?.addEventListener('click', () => {
    const sb = $('sidebar');
    sb?.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  $('sbOverlay')?.addEventListener('click', closeSidebar);
}
function openSidebar() {
  $('sidebar')?.classList.add('open');
  $('sbOverlay')?.classList.add('show');
  $('hamburgerBtn')?.classList.add('act');
}
export function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sbOverlay')?.classList.remove('show');
  $('hamburgerBtn')?.classList.remove('act');
}

// ── HERO CANVAS ANIMATION ─────────────────────────────────────────────────
export function initHeroCanvas() {
  const canvas = $('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0;

  const pts = Array.from({ length: 28 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45,
    r: Math.random() * 2.2 + .8,
  }));
  const zombies = Array.from({ length: 8 }, (_, i) => ({
    angle: i * (Math.PI * 2 / 8),
    dist: 85 + (i % 3) * 12,
    spd: .38 + i * .02,
  }));

  (function loop() {
    t += .016;
    ctx.fillStyle = '#060a06';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(74,222,128,.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 38) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 38) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Particles
    for (const p of pts) {
      p.x = (p.x + p.vx + W) % W;
      p.y = (p.y + p.vy + H) % H;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74,222,128,.18)'; ctx.fill();
    }

    // Glow around center
    const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,140);
    g.addColorStop(0,'rgba(74,222,128,.05)'); g.addColorStop(1,'rgba(74,222,128,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // Zombies
    for (const z of zombies) {
      const zx = W/2 + Math.cos(t * z.spd + z.angle) * z.dist;
      const zy = H/2 + Math.sin(t * z.spd * .8 + z.angle) * z.dist;
      ctx.save(); ctx.translate(zx, zy);
      ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2);
      ctx.fillStyle = 'rgba(110,20,20,.9)'; ctx.fill();
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(239,68,68,.8)';
      ctx.fillRect(-3.5,-2.5,3,3); ctx.fillRect(1.5,-2.5,3,3);
      ctx.restore();
    }

    // Player glow
    const pg = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,30);
    pg.addColorStop(0,'rgba(74,222,128,.38)'); pg.addColorStop(1,'rgba(74,222,128,0)');
    ctx.beginPath(); ctx.arc(W/2,H/2,30,0,Math.PI*2); ctx.fillStyle=pg; ctx.fill();
    // Player body
    ctx.save(); ctx.translate(W/2,H/2);
    ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2);
    ctx.fillStyle='#4ade80'; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    ctx.rotate(t*.8);
    ctx.beginPath(); ctx.moveTo(0,-15); ctx.lineTo(4,-9); ctx.lineTo(-4,-9); ctx.closePath();
    ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fill();
    ctx.restore();

    // Scan line
    const sy = (t * 38) % H;
    ctx.fillStyle='rgba(74,222,128,.024)'; ctx.fillRect(0,sy,W,3);

    // Corner brackets
    const cs=18; ctx.strokeStyle='rgba(74,222,128,.42)'; ctx.lineWidth=2;
    [[8,8,1,1],[W-8,8,-1,1],[8,H-8,1,-1],[W-8,H-8,-1,-1]].forEach(([x,y,dx,dy])=>{
      ctx.beginPath(); ctx.moveTo(x,y+dy*cs); ctx.lineTo(x,y); ctx.lineTo(x+dx*cs,y); ctx.stroke();
    });

    requestAnimationFrame(loop);
  })();
}

// ── JOYSTICK HELPER ───────────────────────────────────────────────────────
export function setupJoystick(zoneId, thumbId, onMove) {
  const zone = $(zoneId);
  if (!zone) return;
  const thumb = $(thumbId);
  let active = false;

  function calc(touch) {
    const r = zone.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = touch.clientX - cx, dy = touch.clientY - cy;
    const maxD = 38;
    const dist = Math.min(Math.hypot(dx, dy), maxD);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * dist / maxD;
    const ny = Math.sin(angle) * dist / maxD;
    if (thumb) {
      thumb.style.transform = `translate(calc(-50% + ${Math.cos(angle)*dist}px),calc(-50% + ${Math.sin(angle)*dist}px))`;
    }
    onMove(nx, ny);
  }

  zone.addEventListener('touchstart', e => {
    e.preventDefault(); active = true;
    if (e.touches[0]) calc(e.touches[0]);
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (!active) return;
    e.preventDefault();
    if (e.touches[0]) calc(e.touches[0]);
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    if (thumb) thumb.style.transform = 'translate(-50%,-50%)';
    onMove(0, 0);
  });
}
