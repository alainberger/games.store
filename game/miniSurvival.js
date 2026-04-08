// ── miniSurvival.js ─ Solo Mini Survival ─────────────────────────────────

export function createMiniSurvival(canvas, hud) {
  const ctx = canvas.getContext('2d');
  let player = { x: 120, y: 120, hp: 100, food: 100, water: 100 };
  let loot   = _genLoot(canvas, 45);
  const keys  = new Set();
  let running = false;
  let touchMx = 0, touchMy = 0;

  // ── HUD ───────────────────────────────────────────────────────────────────
  function updateHUD() {
    const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=Math.round(v); };
    const bar = (id, v) => { const e=document.getElementById(id); if(e) e.style.width=Math.max(0,Math.min(100,v))+'%'; };
    set('ms-hp',    player.hp);    bar('ms-hp-bar',    player.hp);
    set('ms-food',  player.food);  bar('ms-food-bar',  player.food);
    set('ms-water', player.water); bar('ms-water-bar', player.water);
    set('ms-loot',  loot.length);
  }

  // ── GAME TICK ─────────────────────────────────────────────────────────────
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);

    const spd = 2.8;
    const right  = (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    const left   = (keys.has('a') || keys.has('q') || keys.has('arrowleft') ? 1 : 0);
    const down   = (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const up     = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0);
    let mvx = (right - left + touchMx);
    let mvy = (down  - up   + touchMy);
    const len = Math.hypot(mvx, mvy);
    if (len > 1) { mvx/=len; mvy/=len; }

    player.x = Math.max(12, Math.min(canvas.width  - 12, player.x + mvx * spd));
    player.y = Math.max(12, Math.min(canvas.height - 12, player.y + mvy * spd));

    player.food  = Math.max(0, player.food  - 0.05);
    player.water = Math.max(0, player.water - 0.07);
    if (player.food <= 0 || player.water <= 0) player.hp = Math.max(0, player.hp - 0.15);
    if (player.hp <= 0) {
      player = { x: 120, y: 120, hp: 100, food: 100, water: 100 };
    }

    // Loot pickup
    loot = loot.filter(l => {
      if (Math.hypot(l.x - player.x, l.y - player.y) < 18) {
        if (l.t === 'food')  player.food  = Math.min(100, player.food  + 32);
        else                  player.water = Math.min(100, player.water + 32);
        return false;
      }
      return true;
    });
    if (loot.length < 20) loot.push(_spawnLoot(canvas));

    // ── RENDER ──────────────────────────────────────────────────────────────
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#060e06'; ctx.fillRect(0, 0, W, H);

    // Ground tiles
    ctx.fillStyle = '#090f09';
    for (let gx = 0; gx < W; gx += 60) {
      for (let gy = 0; gy < H; gy += 60) {
        if ((Math.floor(gx/60) + Math.floor(gy/60)) % 2 === 0) ctx.fillRect(gx,gy,60,60);
      }
    }

    // Grid
    ctx.strokeStyle = 'rgba(74,222,128,.035)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Loot items
    for (const l of loot) {
      const isFood = l.t === 'food';
      ctx.beginPath();
      if (isFood) ctx.roundRect(l.x-6, l.y-6, 12, 12, 3);
      else {
        // Water droplet
        ctx.arc(l.x, l.y, 6, 0, Math.PI*2);
      }
      ctx.fillStyle = isFood ? '#22c55e' : '#38bdf8';
      ctx.fill();
      // Glow
      ctx.shadowColor = isFood ? '#22c55e' : '#38bdf8';
      ctx.shadowBlur  = 10; ctx.fill(); ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle   = isFood ? '#86efac' : '#bae6fd';
      ctx.font        = '9px Share Tech Mono,monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(isFood ? '🍖' : '💧', l.x, l.y + 16);
      ctx.textAlign = 'left';
    }

    // Player shadow
    const shadow = ctx.createRadialGradient(player.x, player.y+2, 0, player.x, player.y+2, 16);
    shadow.addColorStop(0,'rgba(0,0,0,.4)'); shadow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(player.x, player.y+2, 16, 0, Math.PI*2); ctx.fillStyle=shadow; ctx.fill();

    // Player glow
    const grd = ctx.createRadialGradient(player.x,player.y,0,player.x,player.y,20);
    grd.addColorStop(0,'rgba(248,250,252,.25)'); grd.addColorStop(1,'rgba(248,250,252,0)');
    ctx.beginPath(); ctx.arc(player.x,player.y,20,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

    // Player body
    ctx.beginPath(); ctx.arc(player.x, player.y, 11, 0, Math.PI*2);
    ctx.fillStyle = '#f8fafc'; ctx.fill();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();

    // Player direction dot
    const faceX = player.x + (mvx || 0) * 10;
    const faceY = player.y + (mvy || 0) * 10;
    ctx.beginPath(); ctx.arc(faceX, faceY, 3, 0, Math.PI*2);
    ctx.fillStyle = '#4ade80'; ctx.fill();

    // Low stat warnings
    if (player.food < 25 || player.water < 25 || player.hp < 25) {
      ctx.fillStyle = `rgba(239,68,68,${.3 + .3*Math.sin(Date.now()/200)})`;
      ctx.fillRect(0,0,W,H);
    }

    updateHUD();
  }

  const kd = e => keys.add(e.key.toLowerCase());
  const ku = e => keys.delete(e.key.toLowerCase());

  // Touch joystick
  const jzone  = document.getElementById('jzoneMini');
  const jthumb = document.getElementById('jthumbMini');
  if (jzone && jthumb) {
    let jA = false;
    jzone.addEventListener('touchstart', e => {
      e.preventDefault(); jA = true;
      _jCalc(e.touches[0], jzone, jthumb, (x,y)=>{ touchMx=x; touchMy=y; });
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (!jA) return; e.preventDefault();
      _jCalc(e.touches[0], jzone, jthumb, (x,y)=>{ touchMx=x; touchMy=y; });
    }, { passive: false });
    window.addEventListener('touchend', () => {
      if (!jA) return; jA=false; touchMx=0; touchMy=0;
      jthumb.style.transform = 'translate(-50%,-50%)';
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      player = { x: 120, y: 120, hp: 100, food: 100, water: 100 };
      loot   = _genLoot(canvas, 45);
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup',   ku);
      tick();
    },
    stop() {
      running = false;
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup',   ku);
    },
  };
}

function _genLoot(canvas, n) {
  return Array.from({ length: n }, () => _spawnLoot(canvas));
}
function _spawnLoot(canvas) {
  const W = canvas?.width  || 960;
  const H = canvas?.height || 540;
  return {
    x: Math.random() * (W - 40) + 20,
    y: Math.random() * (H - 40) + 20,
    t: Math.random() > .5 ? 'food' : 'water',
  };
}
function _jCalc(touch, zone, thumb, cb) {
  if (!touch) return;
  const r   = zone.getBoundingClientRect();
  const dx  = touch.clientX - (r.left + r.width/2);
  const dy  = touch.clientY - (r.top  + r.height/2);
  const max = 38;
  const d   = Math.min(Math.hypot(dx,dy), max);
  const a   = Math.atan2(dy, dx);
  thumb.style.transform = `translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`;
  cb(Math.cos(a)*d/max, Math.sin(a)*d/max);
}
