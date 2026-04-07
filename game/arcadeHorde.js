export function createArcadeHorde(canvas, hud) {
  const ctx = canvas.getContext('2d');
  let p = { x: 480, y: 270, hp: 100, score: 0 };
  let horde = [];
  const keys = new Set();
  let running = false;

  const spawn = () => {
    const side = Math.floor(Math.random() * 4);
    const pos = [
      { x: Math.random() * 960, y: 0 },
      { x: 960, y: Math.random() * 540 },
      { x: Math.random() * 960, y: 540 },
      { x: 0, y: Math.random() * 540 },
    ][side];
    horde.push({ ...pos, hp: 26 });
  };

  const loop = () => {
    if (!running) return;
    requestAnimationFrame(loop);
    if (Math.random() < 0.08) spawn();

    if (keys.has('w')) p.y -= 3.2;
    if (keys.has('s')) p.y += 3.2;
    if (keys.has('a')) p.x -= 3.2;
    if (keys.has('d')) p.x += 3.2;

    if (keys.has(' ')) {
      const closest = horde.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (closest && Math.hypot(closest.x - p.x, closest.y - p.y) < 150) closest.hp -= 5;
    }

    horde = horde.filter((e) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * 1.5;
      e.y += (dy / d) * 1.5;
      if (d < 16) p.hp = Math.max(0, p.hp - 0.4);
      if (e.hp <= 0) { p.score += 10; return false; }
      return true;
    });

    if (p.hp <= 0) { p = { x: 480, y: 270, hp: 100, score: 0 }; horde = []; }

    ctx.fillStyle = '#251208';
    ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = '#ef4444';
    horde.forEach((e) => { ctx.fillRect(e.x - 8, e.y - 8, 16, 16); });
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();

    hud.textContent = `Arcade Horde | HP:${p.hp.toFixed(0)} | Score:${p.score} | Horde:${horde.length}`;
  };

  const kd = (e) => keys.add(e.key.toLowerCase());
  const ku = (e) => keys.delete(e.key.toLowerCase());

  return {
    start() { if (running) return; running = true; window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); loop(); },
    stop() { running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); }
  };
}
