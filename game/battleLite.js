// ── battleLite.js ─ Battle Royale Lite (Solo vs AI) ──────────────────────

export function createBattleLite(canvas, hud) {
  const ctx = canvas.getContext('2d');
  let me      = { x: 480, y: 270, hp: 100, kills: 0 };
  let bots    = _spawnBots(canvas, 15);
  const keys  = new Set();
  let running = false;
  let touchMx = 0, touchMy = 0, touchAtk = false;
  let lastKillFlash = 0;

  // ── HUD ────────────────────────────────────────────────────────────────
  function updateHUD() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = Math.round(v); };
    const bar = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = Math.max(0, Math.min(100, v)) + '%'; };
    set('bl-hp', me.hp);      bar('bl-hp-bar', me.hp);
    set('bl-kills', me.kills);
    set('bl-enemies', bots.length);
  }

  // ── STEP ───────────────────────────────────────────────────────────────
  function step() {
    if (!running) return;
    requestAnimationFrame(step);

    const spd   = 3.2;
    const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    const left  = (keys.has('a') || keys.has('q') || keys.has('arrowleft') ? 1 : 0);
    const down  = (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const up    = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0);
    let mvx = right - left + touchMx;
    let mvy = down  - up   + touchMy;
    const len = Math.hypot(mvx, mvy);
    if (len > 1) { mvx /= len; mvy /= len; }

    me.x = Math.max(12, Math.min(canvas.width  - 12, me.x + mvx * spd));
    me.y = Math.max(12, Math.min(canvas.height - 12, me.y + mvy * spd));

    // Attack
    const attacking = keys.has(' ') || touchAtk;
    if (attacking) {
      const target = bots.find(b => Math.hypot(b.x - me.x, b.y - me.y) < 130);
      if (target) target.hp -= 9;
    }

    // Update bots
    bots = bots.filter(b => {
      if (b.hp <= 0) { me.kills++; lastKillFlash = Date.now(); return false; }
      const dx = me.x - b.x, dy = me.y - b.y;
      const d  = Math.hypot(dx, dy) || 1;
      b.x += (dx / d) * (1.1 + b.spd);
      b.y += (dy / d) * (1.1 + b.spd);
      // Bounce off walls
      b.x = Math.max(10, Math.min(canvas.width  - 10, b.x));
      b.y = Math.max(10, Math.min(canvas.height - 10, b.y));
      if (d < 15) me.hp = Math.max(0, me.hp - 0.32);
      return true;
    });
    if (bots.length < 10) bots.push(_mkBot(canvas));

    // Death → respawn
    if (me.hp <= 0) {
      me = { x: canvas.width/2, y: canvas.height/2, hp: 100, kills: 0 };
      bots = _spawnBots(canvas, 15);
    }

    // ── RENDER ──────────────────────────────────────────────────────────
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#0c0818'; ctx.fillRect(0, 0, W, H);

    // Floor pattern
    ctx.fillStyle = '#100d1e';
    for (let gx = 0; gx < W; gx += 70) {
      for (let gy = 0; gy < H; gy += 70) {
        if ((Math.floor(gx/70) + Math.floor(gy/70)) % 2 === 0) ctx.fillRect(gx, gy, 70, 70);
      }
    }

    // Grid
    ctx.strokeStyle = 'rgba(139,92,246,.05)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 70) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 70) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Zone border (safe zone visual)
    ctx.strokeStyle = 'rgba(139,92,246,.3)'; ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W-20, H-20);

    // Attack range indicator when attacking
    if (attacking) {
      const g = ctx.createRadialGradient(me.x, me.y, 0, me.x, me.y, 130);
      g.addColorStop(0, 'rgba(34,211,238,.12)');
      g.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath(); ctx.arc(me.x, me.y, 130, 0, Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(34,211,238,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Bots
    for (const b of bots) {
      const dx = me.x - b.x, dy = me.y - b.y;
      const d  = Math.hypot(dx, dy);
      const inRange = d < 130;

      // Shadow
      const sg = ctx.createRadialGradient(b.x, b.y+2, 0, b.x, b.y+2, 14);
      sg.addColorStop(0,'rgba(0,0,0,.4)'); sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(b.x, b.y+2, 14, 0, Math.PI*2); ctx.fillStyle=sg; ctx.fill();

      // Body glow if in range
      if (inRange && attacking) {
        ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 14;
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI*2);
      ctx.fillStyle = inRange ? '#dc2626' : '#991b1b'; ctx.fill();
      ctx.strokeStyle = inRange ? '#fca5a5' : '#f87171'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowBlur = 0;

      // Eyes
      ctx.fillStyle = '#fef2f2';
      ctx.fillRect(b.x-4, b.y-3, 3, 3); ctx.fillRect(b.x+1, b.y-3, 3, 3);

      // HP bar
      const bw = 24;
      ctx.fillStyle = '#1a0808';
      ctx.fillRect(b.x - bw/2 - 1, b.y - 20, bw+2, 5);
      ctx.fillStyle = b.hp > 60 ? '#22c55e' : b.hp > 30 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(b.x - bw/2, b.y - 19, bw * (b.hp/100), 3);
    }

    // Player shadow
    const psg = ctx.createRadialGradient(me.x, me.y+3, 0, me.x, me.y+3, 18);
    psg.addColorStop(0,'rgba(0,0,0,.5)'); psg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(me.x, me.y+3, 18, 0, Math.PI*2); ctx.fillStyle=psg; ctx.fill();

    // Player glow
    const pg = ctx.createRadialGradient(me.x,me.y,0,me.x,me.y,24);
    pg.addColorStop(0,'rgba(34,211,238,.35)'); pg.addColorStop(1,'rgba(34,211,238,0)');
    ctx.beginPath(); ctx.arc(me.x,me.y,24,0,Math.PI*2); ctx.fillStyle=pg; ctx.fill();

    // Player
    ctx.beginPath(); ctx.arc(me.x, me.y, 13, 0, Math.PI*2);
    ctx.fillStyle = '#22d3ee'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    // Direction indicator
    if (len > 0.1) {
      ctx.save(); ctx.translate(me.x, me.y); ctx.rotate(Math.atan2(mvy, mvx) + Math.PI/2);
      ctx.beginPath(); ctx.moveTo(0,-17); ctx.lineTo(4,-11); ctx.lineTo(-4,-11); ctx.closePath();
      ctx.fillStyle='rgba(255,255,255,.8)'; ctx.fill();
      ctx.restore();
    }

    // Kill flash
    const kAge = Date.now() - lastKillFlash;
    if (kAge < 300) {
      ctx.fillStyle = `rgba(74,222,128,${.25 * (1 - kAge/300)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Low HP warning
    if (me.hp < 30) {
      ctx.fillStyle = `rgba(239,68,68,${.25 + .2*Math.sin(Date.now()/180)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Kill counter HUD (in-canvas)
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(W - 120, 10, 110, 32);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 13px Orbitron,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`KILLS: ${me.kills}`, W - 14, 30);
    ctx.textAlign = 'left';

    updateHUD();
  }

  const kd = e => { keys.add(e.key.toLowerCase()); if (e.key===' ') e.preventDefault(); };
  const ku = e => keys.delete(e.key.toLowerCase());

  // Touch attack button
  const tAtk = document.getElementById('tAttackBl');
  if (tAtk) {
    tAtk.addEventListener('touchstart', e => { e.preventDefault(); touchAtk = true; }, { passive:false });
    tAtk.addEventListener('touchend',   () => { touchAtk = false; });
  }

  // Touch joystick
  const jzone  = document.getElementById('jzoneBattle');
  const jthumb = document.getElementById('jthumbBattle');
  if (jzone && jthumb) {
    let jA = false;
    jzone.addEventListener('touchstart', e => {
      e.preventDefault(); jA = true;
      _jc(e.touches[0], jzone, jthumb, (x,y)=>{ touchMx=x; touchMy=y; });
    }, { passive:false });
    window.addEventListener('touchmove', e => {
      if (!jA) return; e.preventDefault();
      _jc(e.touches[0], jzone, jthumb, (x,y)=>{ touchMx=x; touchMy=y; });
    }, { passive:false });
    window.addEventListener('touchend', () => {
      if (!jA) return; jA=false; touchMx=0; touchMy=0;
      jthumb.style.transform='translate(-50%,-50%)';
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      me   = { x: canvas.width/2, y: canvas.height/2, hp: 100, kills: 0 };
      bots = _spawnBots(canvas, 15);
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup',   ku);
      step();
    },
    stop() {
      running = false;
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup',   ku);
    },
  };
}

function _mkBot(canvas) {
  const side = Math.floor(Math.random() * 4);
  const W = canvas?.width || 960, H = canvas?.height || 540;
  const pos = [
    { x: Math.random()*W, y: -10 },
    { x: W+10,            y: Math.random()*H },
    { x: Math.random()*W, y: H+10 },
    { x: -10,             y: Math.random()*H },
  ][side];
  return { ...pos, hp: 80 + Math.random()*40, spd: 0.3 + Math.random()*0.6 };
}
function _spawnBots(canvas, n) {
  return Array.from({ length: n }, () => {
    const W = canvas?.width || 960, H = canvas?.height || 540;
    return {
      x:   Math.random() * (W-60) + 30,
      y:   Math.random() * (H-60) + 30,
      hp:  80 + Math.random()*40,
      spd: 0.3 + Math.random()*0.6,
    };
  });
}
function _jc(touch, zone, thumb, cb) {
  if (!touch) return;
  const r = zone.getBoundingClientRect();
  const dx = touch.clientX - (r.left + r.width/2);
  const dy = touch.clientY - (r.top  + r.height/2);
  const mx = 38, d = Math.min(Math.hypot(dx,dy), mx), a = Math.atan2(dy,dx);
  thumb.style.transform = `translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`;
  cb(Math.cos(a)*d/mx, Math.sin(a)*d/mx);
}
