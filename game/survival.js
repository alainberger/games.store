// ── survival.js ─ DayZero Multiplayer Survival ───────────────────────────

export function createSurvival(canvas, hud, socket, profile) {
  const ctx   = canvas.getContext('2d');
  const state = { selfId: null, world: null };
  const keys  = new Set();
  let running  = false;
  let touchMx  = 0, touchMy = 0, touchShoot = false;

  // ── HUD HELPERS ──────────────────────────────────────────────────────────
  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = Math.round(val);
  }
  function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function updateHUD(p, playerCount) {
    setEl('sv-hp', p.hp);        setBar('sv-hp-bar', p.hp);
    setEl('sv-hunger', p.hunger);setBar('sv-hunger-bar', p.hunger);
    setEl('sv-thirst', p.thirst);setBar('sv-thirst-bar', p.thirst);
    setEl('sv-ammo', p.ammo);
    setEl('sv-score', p.score);
    setEl('sv-players', playerCount);
  }

  // ── INPUT VECTOR ─────────────────────────────────────────────────────────
  function inputVec() {
    const right  = (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    const left   = (keys.has('a') || keys.has('q') || keys.has('arrowleft') ? 1 : 0);
    const down   = (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const up     = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0);
    let mx = right - left + touchMx;
    let my = down  - up   + touchMy;
    // Normalize diagonal
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { mx, my };
  }
  function isShooting() { return keys.has(' ') || touchShoot; }

  // ── SOCKET EVENTS ─────────────────────────────────────────────────────────
  if (socket) {
    socket.on('world_init', ({ selfId, state: world }) => {
      state.selfId = selfId;
      state.world  = world;
    });
    socket.on('world_snapshot', world => { state.world = world; });
  }

  // ── DRAW HELPERS ──────────────────────────────────────────────────────────
  function drawLoot(loot, cx, cy) {
    const colors = { food:'#22c55e', water:'#38bdf8', ammo:'#fbbf24', medkit:'#f87171', pistol:'#c084fc' };
    const lx = loot.x - cx, ly = loot.y - cy;
    if (lx < -20 || lx > canvas.width+20 || ly < -20 || ly > canvas.height+20) return;
    ctx.fillStyle = colors[loot.type] || '#888';
    ctx.beginPath();
    ctx.roundRect(lx-7, ly-7, 14, 14, 3);
    ctx.fill();
    // Glow
    ctx.shadowColor = colors[loot.type] || '#888';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  function drawZombie(z, cx, cy) {
    const zx = z.x - cx, zy = z.y - cy;
    if (zx < -30 || zx > canvas.width+30 || zy < -30 || zy > canvas.height+30) return;

    // Body
    ctx.save();
    ctx.translate(zx, zy);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI*2);
    ctx.fillStyle = '#6b1212'; ctx.fill();
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ff6060';
    ctx.fillRect(-5,-3,4,4); ctx.fillRect(2,-3,4,4);
    // Mouth
    ctx.fillStyle = '#8b0000';
    ctx.fillRect(-4,3,8,2);

    ctx.restore();

    // HP bar
    const bw = 28;
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(zx - bw/2 - 1, zy - 23, bw + 2, 5);
    ctx.fillStyle = `hsl(${z.hp * 1.2},80%,45%)`;
    ctx.fillRect(zx - bw/2, zy - 22, bw * (z.hp/100), 3);
  }

  function drawPlayer(p, isSelf, camX, camY) {
    const x = p.x - camX, y = p.y - camY;
    if (x < -30 || x > canvas.width+30 || y < -30 || y > canvas.height+30) return;

    ctx.save();
    ctx.translate(x, y);

    if (isSelf) {
      // Glow halo
      const g = ctx.createRadialGradient(0,0,0,0,0,22);
      g.addColorStop(0,'rgba(74,222,128,.3)'); g.addColorStop(1,'rgba(74,222,128,0)');
      ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    }

    // Player body
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2);
    ctx.fillStyle   = isSelf ? '#4ade80' : '#fb923c';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    // Direction indicator
    ctx.rotate(p.facing || 0);
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(4,-10); ctx.lineTo(-4,-10); ctx.closePath();
    ctx.fillStyle = isSelf ? '#fff' : '#fde68a'; ctx.fill();

    ctx.restore();

    // Pseudo label
    ctx.fillStyle   = isSelf ? '#4ade80' : '#fb923c';
    ctx.font        = 'bold 11px Rajdhani,sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(p.pseudo || '', x, y - 20);
    ctx.textAlign   = 'left';
  }

  // ── MAIN DRAW LOOP ─────────────────────────────────────────────────────────
  function draw() {
    if (!running) return;
    requestAnimationFrame(draw);
    if (!state.world || !state.selfId) {
      ctx.fillStyle = '#060a06';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#4ade80'; ctx.font = '16px Rajdhani,sans-serif'; ctx.textAlign='center';
      ctx.fillText('Connexion au serveur...', canvas.width/2, canvas.height/2);
      ctx.textAlign = 'left';
      return;
    }

    const p  = state.world.players[state.selfId];
    if (!p) return;

    const vw = canvas.width, vh = canvas.height;
    const camX = Math.max(0, Math.min(state.world.size.w - vw, p.x - vw/2));
    const camY = Math.max(0, Math.min(state.world.size.h - vh, p.y - vh/2));

    // Background
    ctx.fillStyle = '#060a06';
    ctx.fillRect(0, 0, vw, vh);

    // Ground texture (grass patches)
    ctx.fillStyle = '#0a120a';
    for (let gx = Math.floor(camX/80)*80 - camX; gx < vw; gx += 80) {
      for (let gy = Math.floor(camY/80)*80 - camY; gy < vh; gy += 80) {
        if ((Math.floor((gx+camX)/80) + Math.floor((gy+camY)/80)) % 2 === 0) {
          ctx.fillRect(gx, gy, 80, 80);
        }
      }
    }

    // Grid
    ctx.strokeStyle = 'rgba(74,222,128,.04)'; ctx.lineWidth = 1;
    for (let x = -(camX % 80); x < vw; x += 80) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,vh); ctx.stroke(); }
    for (let y = -(camY % 80); y < vh; y += 80) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(vw,y); ctx.stroke(); }

    // Obstacles (static rocks/trees derived from world seed)
    ctx.fillStyle = 'rgba(40,60,40,.6)';
    for (let i = 0; i < 40; i++) {
      const ox = ((i * 347 + 13) % 2600) + 100 - camX;
      const oy = ((i * 613 + 29) % 2600) + 100 - camY;
      if (ox < -30 || ox > vw+30 || oy < -30 || oy > vh+30) continue;
      ctx.beginPath(); ctx.arc(ox, oy, 14 + (i%5)*3, 0, Math.PI*2); ctx.fill();
    }

    // Loot
    for (const loot of state.world.loot) drawLoot(loot, camX, camY);

    // Zombies
    for (const z of state.world.zombies) drawZombie(z, camX, camY);

    // Other players (behind self)
    for (const pl of Object.values(state.world.players)) {
      if (pl.id !== state.selfId) drawPlayer(pl, false, camX, camY);
    }
    drawPlayer(p, true, camX, camY);

    // Send input
    const v = inputVec();
    socket?.emit('player_input', { mx: v.mx, my: v.my, shoot: isShooting(), angle: p.facing });

    // Update HUD
    updateHUD(p, Object.keys(state.world.players).length);
  }

  // ── KEYBOARD ──────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }

  // ── TOUCH SHOOT BUTTON ────────────────────────────────────────────────────
  const tShoot = document.getElementById('tShoot');
  if (tShoot) {
    tShoot.addEventListener('touchstart', e => { e.preventDefault(); touchShoot = true; }, { passive: false });
    tShoot.addEventListener('touchend',   ()  => { touchShoot = false; });
  }

  // ── JOYSTICK ──────────────────────────────────────────────────────────────
  const jzone = document.getElementById('jzoneSv');
  const jthumb= document.getElementById('jthumbSv');
  if (jzone && jthumb) {
    let jActive = false;
    jzone.addEventListener('touchstart', e => {
      e.preventDefault(); jActive = true;
      _calcJoystick(e.touches[0], jzone, jthumb, (x,y) => { touchMx=x; touchMy=y; });
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (!jActive) return;
      e.preventDefault();
      _calcJoystick(e.touches[0], jzone, jthumb, (x,y) => { touchMx=x; touchMy=y; });
    }, { passive: false });
    window.addEventListener('touchend', () => {
      if (!jActive) return;
      jActive = false; touchMx = 0; touchMy = 0;
      jthumb.style.transform = 'translate(-50%,-50%)';
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      socket?.emit('join_world', { pseudo: profile?.pseudo || 'Guest' });
      draw();
    },
    stop() {
      running = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    },
  };
}

function _calcJoystick(touch, zone, thumb, cb) {
  if (!touch) return;
  const r    = zone.getBoundingClientRect();
  const dx   = touch.clientX - (r.left + r.width/2);
  const dy   = touch.clientY - (r.top  + r.height/2);
  const maxD = 38;
  const dist = Math.min(Math.hypot(dx,dy), maxD);
  const ang  = Math.atan2(dy, dx);
  const nx   = Math.cos(ang) * dist / maxD;
  const ny   = Math.sin(ang) * dist / maxD;
  thumb.style.transform = `translate(calc(-50% + ${Math.cos(ang)*dist}px),calc(-50% + ${Math.sin(ang)*dist}px))`;
  cb(nx, ny);
}
