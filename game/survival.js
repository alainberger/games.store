export function createSurvival(canvas, hud, socket, profile) {
  const ctx = canvas.getContext('2d');
  const state = { selfId: null, world: null };
  const keys = new Set();
  let running = false;

  const keyToVec = () => ({
    mx: (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
    my: (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0),
  });

  const shoot = () => keys.has(' ');

  socket.on('world_init', ({ selfId, state: world }) => {
    state.selfId = selfId;
    state.world = world;
  });

  socket.on('world_snapshot', (world) => {
    state.world = world;
  });

  const draw = () => {
    if (!running) return;
    requestAnimationFrame(draw);
    if (!state.world || !state.selfId) return;

    const p = state.world.players[state.selfId];
    if (!p) return;

    const vw = canvas.width;
    const vh = canvas.height;
    ctx.clearRect(0, 0, vw, vh);

    const camX = Math.max(0, Math.min(state.world.size.w - vw, p.x - vw / 2));
    const camY = Math.max(0, Math.min(state.world.size.h - vh, p.y - vh / 2));

    ctx.fillStyle = '#17212e';
    ctx.fillRect(0, 0, vw, vh);

    ctx.strokeStyle = '#2a3a4e';
    for (let x = -((camX % 80)); x < vw; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke(); }
    for (let y = -((camY % 80)); y < vh; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke(); }

    for (const loot of state.world.loot) {
      const lx = loot.x - camX;
      const ly = loot.y - camY;
      ctx.fillStyle = loot.type === 'food' ? '#16a34a' : loot.type === 'water' ? '#3b82f6' : loot.type === 'ammo' ? '#eab308' : loot.type === 'medkit' ? '#ef4444' : '#a855f7';
      ctx.fillRect(lx - 6, ly - 6, 12, 12);
    }

    for (const z of state.world.zombies) {
      const zx = z.x - camX;
      const zy = z.y - camY;
      ctx.fillStyle = '#8b1d1d';
      ctx.beginPath(); ctx.arc(zx, zy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(zx - 12, zy - 20, 24, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(zx - 12, zy - 20, 24 * (z.hp / 100), 4);
    }

    for (const player of Object.values(state.world.players)) {
      const x = player.x - camX;
      const y = player.y - camY;
      ctx.fillStyle = player.id === state.selfId ? '#3fa2ff' : '#f97316';
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(player.pseudo, x - 16, y - 20);
    }

    const v = keyToVec();
    socket.emit('player_input', { mx: v.mx, my: v.my, shoot: shoot(), angle: 0 });
    hud.textContent = `HP:${p.hp.toFixed(0)} | Hunger:${p.hunger.toFixed(0)} | Thirst:${p.thirst.toFixed(0)} | Ammo:${p.ammo} | Score:${p.score} | Loot:${p.inventory.join(',')}`;
  };

  const down = (e) => keys.add(e.key.toLowerCase());
  const up = (e) => keys.delete(e.key.toLowerCase());

  return {
    start() {
      if (running) return;
      running = true;
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      socket.emit('join_world', { pseudo: profile?.pseudo || 'Guest' });
      draw();
    },
    stop() {
      running = false;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    },
  };
}
