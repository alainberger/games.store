export function createBattleLite(canvas, hud) {
  const ctx = canvas.getContext('2d');
  let me = { x: 480, y: 270, hp: 100, kills: 0 };
  let bots = Array.from({ length: 15 }, (_, i) => ({ id: i, x: Math.random() * 940 + 10, y: Math.random() * 520 + 10, hp: 100 }));
  const keys = new Set();
  let running = false;

  const step = () => {
    if (!running) return;
    requestAnimationFrame(step);
    const sp = 3;
    if (keys.has('w')) me.y -= sp;
    if (keys.has('s')) me.y += sp;
    if (keys.has('a')) me.x -= sp;
    if (keys.has('d')) me.x += sp;

    if (keys.has(' ')) {
      const target = bots.find((b) => Math.hypot(b.x - me.x, b.y - me.y) < 120);
      if (target) target.hp -= 8;
    }
    bots = bots.filter((b) => {
      if (b.hp <= 0) { me.kills += 1; return false; }
      const dx = me.x - b.x;
      const dy = me.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x += (dx / d) * 1.2;
      b.y += (dy / d) * 1.2;
      if (d < 16) me.hp = Math.max(0, me.hp - 0.3);
      return true;
    });

    if (bots.length < 10) bots.push({ id: Math.random(), x: Math.random() * 940 + 10, y: Math.random() * 520 + 10, hp: 100 });
    if (me.hp <= 0) { me = { x: 480, y: 270, hp: 100, kills: 0 }; }

    ctx.fillStyle = '#1f1328';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f43f5e';
    for (const b of bots) { ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.arc(me.x, me.y, 11, 0, Math.PI * 2); ctx.fill();
    hud.textContent = `Battle Royale Lite | HP:${me.hp.toFixed(0)} | Kills:${me.kills} | Ennemis:${bots.length}`;
  };

  const kd = (e) => keys.add(e.key.toLowerCase());
  const ku = (e) => keys.delete(e.key.toLowerCase());

  return {
    start() { if (running) return; running = true; window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); step(); },
    stop() { running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); }
  };
}
