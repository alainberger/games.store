export function createMiniSurvival(canvas, hud) {
  const ctx = canvas.getContext('2d');
  let player = { x: 120, y: 120, hp: 100, food: 100, water: 100 };
  let loot = Array.from({ length: 45 }, () => ({ x: Math.random() * 920 + 20, y: Math.random() * 500 + 20, t: Math.random() > .5 ? 'food' : 'water' }));
  const keys = new Set();
  let run = false;

  function tick() {
    if (!run) return;
    requestAnimationFrame(tick);
    const v = 2.8;
    if (keys.has('w')) player.y -= v;
    if (keys.has('s')) player.y += v;
    if (keys.has('a')) player.x -= v;
    if (keys.has('d')) player.x += v;

    player.food = Math.max(0, player.food - 0.05);
    player.water = Math.max(0, player.water - 0.07);
    if (player.food <= 0 || player.water <= 0) player.hp = Math.max(0, player.hp - 0.15);
    if (player.hp <= 0) player = { x: 120, y: 120, hp: 100, food: 100, water: 100 };

    loot = loot.filter((l) => {
      if (Math.hypot(l.x - player.x, l.y - player.y) < 16) {
        if (l.t === 'food') player.food = Math.min(100, player.food + 30);
        else player.water = Math.min(100, player.water + 30);
        return false;
      }
      return true;
    });
    if (loot.length < 20) loot.push({ x: Math.random() * 920 + 20, y: Math.random() * 500 + 20, t: Math.random() > .5 ? 'food' : 'water' });

    ctx.fillStyle = '#0f1f17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const l of loot) {
      ctx.fillStyle = l.t === 'food' ? '#22c55e' : '#38bdf8';
      ctx.fillRect(l.x - 5, l.y - 5, 10, 10);
    }
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(player.x, player.y, 10, 0, Math.PI * 2); ctx.fill();
    hud.textContent = `HP:${player.hp.toFixed(0)} Food:${player.food.toFixed(0)} Water:${player.water.toFixed(0)} Ressources:${loot.length}`;
  }

  const d = (e) => keys.add(e.key.toLowerCase());
  const u = (e) => keys.delete(e.key.toLowerCase());

  return {
    start() { if (run) return; run = true; window.addEventListener('keydown', d); window.addEventListener('keyup', u); tick(); },
    stop() { run = false; window.removeEventListener('keydown', d); window.removeEventListener('keyup', u); }
  };
}
