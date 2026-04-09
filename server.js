import express        from 'express';
import http           from 'http';
import { Server }     from 'socket.io';
import path           from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3000;

// ── IN-MEMORY STATE ────────────────────────────────────────────────────────
const socketPseudos = new Map(); // socketId → pseudo
const lobbies       = new Map(); // lobbyId  → lobby
const uid           = () => Math.random().toString(36).slice(2, 10);

// ── WORLD STATE ────────────────────────────────────────────────────────────
const worldState = {
  size: { w: 2800, h: 2800 },
  players: {},
  zombies: Array.from({ length: 20 }, (_, i) => ({
    id: `z${i}`,
    x:  200 + i * 120,
    y:  200 + (i % 5) * 180,
    hp: 100,
  })),
  loot: Array.from({ length: 140 }, (_, i) => ({
    id:   `l${i}`,
    x:    50 + Math.floor(i / 5) * 180 + (i % 5) * 30,
    y:    50 + (i % 14) * 190,
    type: ['food','water','ammo','medkit','pistol'][i % 5],
  })),
};

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(__dirname));

// ── REST ROUTES ────────────────────────────────────────────────────────────
app.get('/api/games', (_req, res) => {
  res.json([
    { id: 'dayzero',       name: 'DayZero Wasteland',  mode: 'multiplayer', players: Object.keys(worldState.players).length },
    { id: 'mini-survival', name: 'Mini Survival',       mode: 'solo' },
    { id: 'battle-lite',   name: 'Battle Royale Lite',  mode: 'solo' },
    { id: 'arcade-horde',  name: 'Arcade Horde Rush',   mode: 'solo' },
  ]);
});

app.get('/api/lobbies', (_req, res) => {
  res.json([...lobbies.values()].map(l => ({
    id:      l.id,
    name:    l.name,
    players: l.players.length,
    game:    l.game,
  })));
});

app.get('/api/online', (_req, res) => {
  res.json({ count: socketPseudos.size });
});

// ── SOCKET.IO ──────────────────────────────────────────────────────────────
function broadcastOnline() {
  io.emit('online_count', socketPseudos.size);
}

io.on('connection', socket => {

  // ── IDENTIFY ─────────────────────────────────────────────────────────────
  socket.on('set_pseudo', ({ pseudo }) => {
    const safe = String(pseudo || 'Guest').trim().slice(0, 20) || 'Guest';
    socketPseudos.set(socket.id, safe);
    socket.emit('pseudo_ok', { pseudo: safe });
    broadcastOnline();
  });

  // ── DAYZERO WORLD ────────────────────────────────────────────────────────
  socket.on('join_world', ({ pseudo }) => {
    const p = pseudo || socketPseudos.get(socket.id) || 'Guest';
    socketPseudos.set(socket.id, p);

    worldState.players[socket.id] = {
      id:        socket.id,
      pseudo:    p,
      x:         1300 + Math.random() * 300,
      y:         1300 + Math.random() * 300,
      hp:        100,
      hunger:    100,
      thirst:    100,
      ammo:      25,
      inventory: ['bandage'],
      facing:    0,
      score:     0,
    };

    socket.emit('world_init', { selfId: socket.id, state: worldState });
    io.emit('world_snapshot', worldState);
  });

  socket.on('player_input', ({ mx, my, shoot, angle }) => {
    const p = worldState.players[socket.id];
    if (!p) return;

    const speed = 4;
    p.x      = Math.max(0, Math.min(worldState.size.w, p.x + mx * speed));
    p.y      = Math.max(0, Math.min(worldState.size.h, p.y + my * speed));
    p.hunger = Math.max(0, p.hunger - 0.02);
    p.thirst = Math.max(0, p.thirst - 0.03);
    p.facing = angle ?? p.facing;
    if (p.hunger <= 0 || p.thirst <= 0) p.hp = Math.max(0, p.hp - 0.12);

    // Loot pickup
    worldState.loot = worldState.loot.filter(loot => {
      if (Math.hypot(loot.x - p.x, loot.y - p.y) < 28) {
        if (loot.type === 'food')   p.hunger = Math.min(100, p.hunger + 30);
        if (loot.type === 'water')  p.thirst = Math.min(100, p.thirst + 30);
        if (loot.type === 'ammo')   p.ammo  += 10;
        if (loot.type === 'medkit') p.hp     = Math.min(100, p.hp    + 30);
        if (loot.type === 'pistol') p.inventory.push('pistol');
        return false;
      }
      return true;
    });

    // Shooting
    if (shoot && p.ammo > 0) {
      p.ammo--;
      for (const z of worldState.zombies) {
        if (Math.hypot(z.x - p.x, z.y - p.y) < 140) {
          z.hp -= 34;
          if (z.hp <= 0) {
            p.score++;
            z.x  = Math.random() * 2700 + 50;
            z.y  = Math.random() * 2700 + 50;
            z.hp = 100;
          }
          break;
        }
      }
    }

    // Death → respawn
    if (p.hp <= 0) {
      p.hp        = 100;
      p.hunger    = 100;
      p.thirst    = 100;
      p.x         = 1200;
      p.y         = 1200;
      p.inventory = ['bandage'];
    }
  });

  // ── LOBBIES ──────────────────────────────────────────────────────────────
  socket.on('create_lobby', ({ name, game }) => {
    const pseudo = socketPseudos.get(socket.id) || 'Guest';
    const lobby  = {
      id:      uid(),
      name:    String(name || 'Lobby').slice(0, 40),
      game:    game || 'dayzero',
      players: [pseudo],
      chat:    [],
    };
    lobbies.set(lobby.id, lobby);
    socket.join(lobby.id);
    socket._lobbyId = lobby.id;
    io.emit('lobbies', _serializeLobbies());
    io.to(lobby.id).emit('lobby_update', lobby);
  });

  socket.on('join_lobby', ({ lobbyId }) => {
    const lobby  = lobbies.get(lobbyId);
    if (!lobby || lobby.players.length >= 8) return;
    const pseudo = socketPseudos.get(socket.id) || 'Guest';
    if (!lobby.players.includes(pseudo)) lobby.players.push(pseudo);
    socket.join(lobbyId);
    socket._lobbyId = lobbyId;
    io.to(lobbyId).emit('lobby_update', lobby);
    io.emit('lobbies', _serializeLobbies());
  });

  socket.on('leave_lobby', ({ lobbyId }) => {
    const lobby  = lobbies.get(lobbyId);
    if (!lobby) return;
    const pseudo = socketPseudos.get(socket.id) || '';
    lobby.players = lobby.players.filter(p => p !== pseudo);
    socket.leave(lobbyId);
    socket._lobbyId = null;
    if (lobby.players.length === 0) {
      lobbies.delete(lobbyId);
    } else {
      io.to(lobbyId).emit('lobby_update', lobby);
    }
    io.emit('lobbies', _serializeLobbies());
  });

  socket.on('auto_matchmake', ({ game }) => {
    const pseudo = socketPseudos.get(socket.id) || 'Guest';
    let lobby    = [...lobbies.values()].find(l => l.game === game && l.players.length < 8);
    if (!lobby) {
      lobby = { id: uid(), name: `Auto-${game}`, game, players: [], chat: [] };
      lobbies.set(lobby.id, lobby);
    }
    if (!lobby.players.includes(pseudo)) lobby.players.push(pseudo);
    socket.join(lobby.id);
    socket._lobbyId = lobby.id;
    io.to(lobby.id).emit('lobby_update', lobby);
    io.emit('lobbies', _serializeLobbies());
    socket.emit('matchmake_result', { lobbyId: lobby.id, lobbyName: lobby.name });
  });

  // ── CHAT ─────────────────────────────────────────────────────────────────
  socket.on('chat', ({ lobbyId, message }) => {
    const lobby  = lobbies.get(lobbyId);
    if (!lobby) return;
    const pseudo = socketPseudos.get(socket.id) || 'Guest';
    const line   = {
      id:      uid(),
      pseudo,
      message: String(message).slice(0, 180),
      at:      Date.now(),
    };
    lobby.chat.push(line);
    lobby.chat = lobby.chat.slice(-100);
    io.to(lobbyId).emit('chat', line);
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const pseudo = socketPseudos.get(socket.id);
    delete worldState.players[socket.id];

    // Clean lobbies
    if (pseudo) {
      for (const [id, lobby] of lobbies.entries()) {
        const before = lobby.players.length;
        lobby.players = lobby.players.filter(p => p !== pseudo);
        if (lobby.players.length === 0) {
          lobbies.delete(id);
        } else if (lobby.players.length !== before) {
          io.to(id).emit('lobby_update', lobby);
        }
      }
    }

    socketPseudos.delete(socket.id);
    io.emit('world_snapshot', worldState);
    io.emit('lobbies', _serializeLobbies());
    broadcastOnline();
  });
});

// ── ZOMBIE AI LOOP ────────────────────────────────────────────────────────
setInterval(() => {
  for (const z of worldState.zombies) {
    const players = Object.values(worldState.players);
    if (players.length === 0) continue;
    const nearest = players.reduce((a, b) =>
      Math.hypot(a.x - z.x, a.y - z.y) < Math.hypot(b.x - z.x, b.y - z.y) ? a : b
    );
    const dx   = nearest.x - z.x;
    const dy   = nearest.y - z.y;
    const dist = Math.hypot(dx, dy) || 1;
    z.x += (dx / dist) * 1.6;
    z.y += (dy / dist) * 1.6;
    if (dist < 28) nearest.hp = Math.max(0, nearest.hp - 0.35);
  }
  if (Object.keys(worldState.players).length > 0) {
    io.emit('world_snapshot', worldState);
  }
}, 50);

// ── HELPERS ────────────────────────────────────────────────────────────────
function _serializeLobbies() {
  return [...lobbies.values()].map(l => ({
    id: l.id, name: l.name, game: l.game, players: l.players.length,
  }));
}

// ── SPA FALLBACK ──────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(PORT, () => {
  console.log(`✅ SurvivalHub → http://localhost:${PORT}`);
});
