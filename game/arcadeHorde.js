// ── arcadeHorde.js ─ Arcade Horde Wave Survival ───────────────────────────

export function createArcadeHorde(canvas, hud) {
  const ctx   = canvas.getContext('2d');
  let p       = { x: 480, y: 270, hp: 100, score: 0 };
  let horde   = [];
  let wave    = 1;
  let waveTimer = 0;
  let killed  = 0;         // enemies killed this wave
  let waveTarget = 20;     // kills needed for next wave
  let spawnRate = 0.07;    // chance per frame to spawn
  const keys  = new Set();
  let running = false;
  let touchMx = 0, touchMy = 0, touchAtk = false;
  let lastKillFlash = 0;
  let waveFlash = 0;

  // ── HUD ────────────────────────────────────────────────────────────────
  function updateHUD() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = Math.round(v); };
    const bar = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = Math.max(0, Math.min(100, v)) + '%'; };
    set('ah-hp',    p.hp);
    bar('ah-hp-bar', p.hp);
    set('ah-score', p.score);
    set('ah-wave',  wave);
    set('ah-horde', horde.length);
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    const W = canvas.width, H = canvas.height;
    const pos = [
      { x: Math.random()*W, y: -12 },
      { x: W+12,            y: Math.random()*H },
      { x: Math.random()*W, y: H+12 },
      { x: -12,             y: Math.random()*H },
    ][side];
    const hp = 22 + wave * 4;
    horde.push({ ...pos, hp, maxHp: hp, spd: 1.3 + wave * 0.12 });
  }

  // ── MAIN LOOP ──────────────────────────────────────────────────────────
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);

    waveTimer++;
    if (Math.random() < spawnRate + wave * 0.005) spawnEnemy();

    // Movement
    const spd   = 3.2;
    const right = (keys.has('d') || keys.has('arrowright') ? 1 : 0);
    const left  = (keys.has('a') || keys.has('q') || keys.has('arrowleft') ? 1 : 0);
    const down  = (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const up    = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0);
    let mvx = right - left + touchMx;
    let mvy = down  - up   + touchMy;
    const mvLen = Math.hypot(mvx, mvy);
    if (mvLen > 1) { mvx /= mvLen; mvy /= mvLen; }

    p.x = Math.max(12, Math.min(canvas.width  - 12, p.x + mvx * spd));
    p.y = Math.max(12, Math.min(canvas.height - 12, p.y + mvy * spd));

    // Attack — hit closest enemy in range
    const attacking = keys.has(' ') || touchAtk;
    if (attacking) {
      const inRange = horde.filter(e => Math.hypot(e.x-p.x, e.y-p.y) < 155);
      inRange.sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y) - Math.hypot(b.x-p.x,b.y-p.y));
      if (inRange[0]) inRange[0].hp -= 5 + wave * 0.5;
    }

    // Move horde, resolve damage/death
    horde = horde.filter(e => {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d  = Math.hypot(dx, dy) || 1;
      e.x += (dx/d) * e.spd;
      e.y += (dy/d) * e.spd;
      if (d < 15) p.hp = Math.max(0, p.hp - (0.35 + wave * 0.04));
      if (e.hp <= 0) {
        p.score += 10 * wave;
        killed++;
        lastKillFlash = Date.now();
        return false;
      }
      return true;
    });

    // Wave progression
    if (killed >= waveTarget) {
      wave++;
      killed = 0;
      waveTarget = Math.floor(20 * Math.pow(1.3, wave - 1));
      spawnRate  = Math.min(0.22, 0.07 + wave * 0.015);
      waveFlash  = Date.now();
      horde      = []; // clear remaining enemies on new wave
    }

    // Death → reset
    if (p.hp <= 0) {
      p = { x: canvas.width/2, y: canvas.height/2, hp: 100, score: 0 };
      horde = [];
      wave  = 1;
      killed = 0;
      waveTarget = 20;
      spawnRate  = 0.07;
    }

    // ── RENDER ────────────────────────────────────────────────────────────
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#1a0c04'; ctx.fillRect(0, 0, W, H);

    // Lava-style floor pattern
    ctx.fillStyle = '#200d04';
    for (let gx = 0; gx < W; gx += 65) {
      for (let gy = 0; gy < H; gy += 65) {
        if ((Math.floor(gx/65)+Math.floor(gy/65)) % 2 === 0) ctx.fillRect(gx,gy,65,65);
      }
    }

    // Grid
    ctx.strokeStyle='rgba(251,146,60,.05)'; ctx.lineWidth=1;
    for (let x=0;x<W;x+=65){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=65){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Attack radius visual
    if (attacking) {
      const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,155);
      g.addColorStop(0,'rgba(251,146,60,.14)'); g.addColorStop(1,'rgba(251,146,60,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,155,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.strokeStyle='rgba(251,146,60,.4)'; ctx.lineWidth=1.5; ctx.stroke();
    }

    // Enemies
    for (const e of horde) {
      const pct   = e.hp / e.maxHp;
      const dist  = Math.hypot(e.x-p.x, e.y-p.y);
      const close = dist < 155;

      // Shadow
      const sg = ctx.createRadialGradient(e.x,e.y+2,0,e.x,e.y+2,13);
      sg.addColorStop(0,'rgba(0,0,0,.45)'); sg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ctx.arc(e.x,e.y+2,13,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();

      // Body (square enemies = horde feel)
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(waveTimer * 0.03);
      if (close && attacking) { ctx.shadowColor='#fb923c'; ctx.shadowBlur=16; }
      ctx.fillStyle   = pct > 0.5 ? '#ef4444' : '#dc2626';
      ctx.strokeStyle = close ? '#fca5a5' : '#f87171';
      ctx.lineWidth   = 1.5;
      const s = 9 + wave;
      ctx.beginPath(); ctx.roundRect(-s, -s, s*2, s*2, 3); ctx.fill(); ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.restore();

      // HP bar
      const bw = 22;
      ctx.fillStyle = '#1a0808';
      ctx.fillRect(e.x - bw/2 - 1, e.y - 20, bw+2, 5);
      ctx.fillStyle = pct > 0.6 ? '#f97316' : pct > 0.3 ? '#eab308' : '#ef4444';
      ctx.fillRect(e.x - bw/2, e.y - 19, bw * pct, 3);
    }

    // Player shadow
    const psg = ctx.createRadialGradient(p.x,p.y+3,0,p.x,p.y+3,20);
    psg.addColorStop(0,'rgba(0,0,0,.5)'); psg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();ctx.arc(p.x,p.y+3,20,0,Math.PI*2);ctx.fillStyle=psg;ctx.fill();

    // Player glow
    const pg = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,26);
    pg.addColorStop(0,'rgba(253,224,71,.38)'); pg.addColorStop(1,'rgba(253,224,71,0)');
    ctx.beginPath();ctx.arc(p.x,p.y,26,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();

    // Player body
    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
    ctx.fillStyle = '#fde047'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
    if (mvLen > 0.1) {
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.atan2(mvy,mvx)+Math.PI/2);
      ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(4,-10); ctx.lineTo(-4,-10); ctx.closePath();
      ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fill();
      ctx.restore();
    }

    // Kill flash
    const ka = Date.now() - lastKillFlash;
    if (ka < 250) {
      ctx.fillStyle = `rgba(251,146,60,${.2*(1-ka/250)})`;
      ctx.fillRect(0,0,W,H);
    }

    // Wave flash
    const wf = Date.now() - waveFlash;
    if (wf < 1800) {
      const alpha = wf < 400 ? wf/400 : wf < 1400 ? 1 : (1800-wf)/400;
      ctx.fillStyle = `rgba(0,0,0,${0.7*alpha})`;
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = `rgba(251,146,60,${alpha})`;
      ctx.font = 'bold 36px Orbitron,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`VAGUE ${wave}`, W/2, H/2);
      ctx.font = '18px Rajdhani,sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${alpha*.8})`;
      ctx.fillText(`Survivez à ${waveTarget} ennemis !`, W/2, H/2+36);
      ctx.textAlign = 'left';
    }

    // Low HP warning
    if (p.hp < 30) {
      ctx.fillStyle=`rgba(239,68,68,${.24+.2*Math.sin(Date.now()/160)})`;
      ctx.fillRect(0,0,W,H);
    }

    // Score panel
    ctx.fillStyle='rgba(0,0,0,.55)';
    ctx.fillRect(W-145,8,137,52);
    ctx.strokeStyle='rgba(251,146,60,.5)'; ctx.lineWidth=1;
    ctx.strokeRect(W-145,8,137,52);
    ctx.fillStyle='#fb923c'; ctx.font='11px Orbitron,sans-serif'; ctx.textAlign='right';
    ctx.fillText(`SCORE`, W-14, 26);
    ctx.fillStyle='#fde68a'; ctx.font='bold 20px Orbitron,sans-serif';
    ctx.fillText(p.score, W-14, 50);
    ctx.textAlign='left';

    // Wave progress bar
    const wpct = Math.min(1, killed / waveTarget);
    ctx.fillStyle='rgba(0,0,0,.5)';
    ctx.fillRect(8, H-22, 180, 12);
    ctx.fillStyle=`rgba(251,146,60,.8)`;
    ctx.fillRect(8, H-22, 180*wpct, 12);
    ctx.strokeStyle='rgba(251,146,60,.4)'; ctx.lineWidth=1;
    ctx.strokeRect(8, H-22, 180, 12);
    ctx.fillStyle='#fff'; ctx.font='9px Share Tech Mono,monospace';
    ctx.fillText(`Vague ${wave} — ${killed}/${waveTarget}`, 14, H-12);

    updateHUD();
  }

  const kd = e => { keys.add(e.key.toLowerCase()); if(e.key===' ') e.preventDefault(); };
  const ku = e => keys.delete(e.key.toLowerCase());

  // Touch attack
  const tAtk = document.getElementById('tAttackAh');
  if (tAtk) {
    tAtk.addEventListener('touchstart', e=>{e.preventDefault();touchAtk=true;},{passive:false});
    tAtk.addEventListener('touchend',   ()=>{touchAtk=false;});
  }

  // Touch joystick
  const jzone  = document.getElementById('jzoneArcade');
  const jthumb = document.getElementById('jthumbArcade');
  if (jzone && jthumb) {
    let jA=false;
    jzone.addEventListener('touchstart', e=>{
      e.preventDefault(); jA=true;
      _jc(e.touches[0],jzone,jthumb,(x,y)=>{touchMx=x;touchMy=y;});
    },{passive:false});
    window.addEventListener('touchmove', e=>{
      if(!jA) return; e.preventDefault();
      _jc(e.touches[0],jzone,jthumb,(x,y)=>{touchMx=x;touchMy=y;});
    },{passive:false});
    window.addEventListener('touchend', ()=>{
      if(!jA) return; jA=false; touchMx=0; touchMy=0;
      jthumb.style.transform='translate(-50%,-50%)';
    });
  }

  return {
    start() {
      if (running) return;
      running=true;
      p={ x:canvas.width/2, y:canvas.height/2, hp:100, score:0 };
      horde=[]; wave=1; killed=0; waveTarget=20; spawnRate=0.07;
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup',   ku);
      loop();
    },
    stop() {
      running=false;
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup',   ku);
    },
  };
}

function _jc(touch, zone, thumb, cb) {
  if (!touch) return;
  const r=zone.getBoundingClientRect();
  const dx=touch.clientX-(r.left+r.width/2), dy=touch.clientY-(r.top+r.height/2);
  const mx=38, d=Math.min(Math.hypot(dx,dy),mx), a=Math.atan2(dy,dx);
  thumb.style.transform=`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`;
  cb(Math.cos(a)*d/mx, Math.sin(a)*d/mx);
}
