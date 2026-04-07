import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'survival-secret-key';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], profiles: [], progress: [], matches: [] }, null, 2));

const readDb = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDb = (db) => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
const id = () => Math.random().toString(36).slice(2, 10);

const onlinePlayers = new Map();
const lobbies = new Map();

const worldState = {
  size: { w: 2800, h: 2800 },
  players: {},
  zombies: Array.from({ length: 20 }, (_, i) => ({ id: `z${i}`, x: 200 + i * 120, y: 200 + (i % 5) * 180, hp: 100 })),
  loot: Array.from({ length: 140 }, (_, i) => ({
    id: `l${i}`,
    x: Math.random() * 2700 + 50,
    y: Math.random() * 2700 + 50,
    type: ['food', 'water', 'ammo', 'medkit', 'pistol'][i % 5],
  })),
};

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password, pseudo } = req.body;
  if (!email || !password || !pseudo) return res.status(400).json({ error: 'Missing fields' });
  const db = readDb();
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'Email already used' });
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = id();
  db.users.push({ id: userId, email, passwordHash, createdAt: Date.now() });
  db.profiles.push({ userId, pseudo, avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(pseudo)}`, stats: { kills: 0, deaths: 0, wins: 0, xp: 0 } });
  db.progress.push({ userId, level: 1, inventory: [], survival: { hp: 100, hunger: 100, thirst: 100 }, games: {} });
  writeDb(db);
  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId: user.id });
});

app.get('/api/profile', auth, (req, res) => {
  const db = readDb();
  const profile = db.profiles.find((p) => p.userId === req.user.userId);
  const progress = db.progress.find((p) => p.userId === req.user.userId);
  res.json({ ...profile, progress });
});

app.put('/api/profile', auth, (req, res) => {
  const { pseudo, avatar } = req.body;
  const db = readDb();
  const profile = db.profiles.find((p) => p.userId === req.user.userId);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  if (pseudo) profile.pseudo = pseudo;
  if (avatar) profile.avatar = avatar;
  writeDb(db);
  res.json(profile);
});

app.post('/api/progress', auth, (req, res) => {
  const update = req.body;
  const db = readDb();
  const p = db.progress.find((x) => x.userId === req.user.userId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.level = Math.max(p.level, update.level || p.level);
  p.inventory = update.inventory || p.inventory;
  p.survival = update.survival || p.survival;
  p.games = { ...p.games, ...(update.games || {}) };
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/games', (_req, res) => {
  res.json([
    { id: 'dayzero', name: 'DayZero Wasteland', mode: 'multiplayer', players: Object.keys(worldState.players).length },
    { id: 'mini-survival', name: 'Mini Survival', mode: 'solo' },
    { id: 'battle-lite', name: 'Battle Royale Lite', mode: 'multiplayer' },
    { id: 'arcade-horde', name: 'Arcade Horde Rush', mode: 'solo' },
  ]);
});

app.get('/api/lobbies', (_req, res) => {
  res.json([...lobbies.values()].map((l) => ({ id: l.id, name: l.name, players: l.players.length, game: l.game })));
});

io.on('connection', (socket) => {
  socket.on('auth', ({ token }) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      onlinePlayers.set(socket.id, { userId: payload.userId, pseudo: payload.email.split('@')[0] });
      socket.emit('auth_ok');
    } catch {
      socket.emit('auth_fail');
    }
  });

  socket.on('join_world', ({ pseudo }) => {
    const spawn = { x: 1300 + Math.random() * 300, y: 1300 + Math.random() * 300 };
    worldState.players[socket.id] = {
      id: socket.id,
      pseudo,
      x: spawn.x,
      y: spawn.y,
      hp: 100,
      hunger: 100,
      thirst: 100,
      ammo: 25,
      inventory: ['bandage'],
      facing: 0,
      score: 0,
    };
    socket.emit('world_init', { selfId: socket.id, state: worldState });
    io.emit('world_snapshot', worldState);
  });

  socket.on('player_input', ({ mx, my, shoot, angle }) => {
    const p = worldState.players[socket.id];
    if (!p) return;
    const speed = 4;
    p.x = Math.max(0, Math.min(worldState.size.w, p.x + mx * speed));
    p.y = Math.max(0, Math.min(worldState.size.h, p.y + my * speed));
    p.hunger = Math.max(0, p.hunger - 0.02);
    p.thirst = Math.max(0, p.thirst - 0.03);
    p.facing = angle || p.facing;
    if (p.hunger <= 0 || p.thirst <= 0) p.hp = Math.max(0, p.hp - 0.12);

    for (const loot of [...worldState.loot]) {
      const d = Math.hypot(loot.x - p.x, loot.y - p.y);
      if (d < 28) {
        if (loot.type === 'food') p.hunger = Math.min(100, p.hunger + 30);
        if (loot.type === 'water') p.thirst = Math.min(100, p.thirst + 30);
        if (loot.type === 'ammo') p.ammo += 10;
        if (loot.type === 'medkit') p.hp = Math.min(100, p.hp + 30);
        if (loot.type === 'pistol') p.inventory.push('pistol');
        worldState.loot = worldState.loot.filter((l) => l.id !== loot.id);
      }
    }

    if (shoot && p.ammo > 0) {
      p.ammo -= 1;
      for (const zid of Object.keys(worldState.zombies)) {
        const z = worldState.zombies[zid];
        if (!z) continue;
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < 140) {
          z.hp -= 34;
          if (z.hp <= 0) {
            p.score += 1;
            z.x = Math.random() * 2700 + 50;
            z.y = Math.random() * 2700 + 50;
            z.hp = 100;
          }
          break;
        }
      }
    }

    if (p.hp <= 0) {
      p.hp = 100;
      p.hunger = 100;
      p.thirst = 100;
      p.x = 1200;
      p.y = 1200;
      p.inventory = ['bandage'];
    }
  });

  socket.on('create_lobby', ({ name, game }) => {
    const lobby = { id: id(), name, game, players: [socket.id], chat: [] };
    lobbies.set(lobby.id, lobby);
    socket.join(lobby.id);
    io.emit('lobbies', [...lobbies.values()]);
  });

  socket.on('join_lobby', ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    if (!lobby.players.includes(socket.id)) lobby.players.push(socket.id);
    socket.join(lobby.id);
    io.to(lobby.id).emit('lobby_update', lobby);
    io.emit('lobbies', [...lobbies.values()]);
  });

  socket.on('auto_matchmake', ({ game }) => {
    let lobby = [...lobbies.values()].find((l) => l.game === game && l.players.length < 8);
    if (!lobby) {
      lobby = { id: id(), name: `Auto ${game}`, game, players: [], chat: [] };
      lobbies.set(lobby.id, lobby);
    }
    if (!lobby.players.includes(socket.id)) lobby.players.push(socket.id);
    socket.join(lobby.id);
    io.to(lobby.id).emit('lobby_update', lobby);
  });

  socket.on('chat', ({ lobbyId, message, pseudo }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const line = { id: id(), pseudo, message: String(message).slice(0, 180), at: Date.now() };
    lobby.chat.push(line);
    lobby.chat = lobby.chat.slice(-100);
    io.to(lobbyId).emit('chat', line);
  });

  socket.on('disconnect', () => {
    delete worldState.players[socket.id];
    onlinePlayers.delete(socket.id);
    for (const lobby of lobbies.values()) {
      lobby.players = lobby.players.filter((p) => p !== socket.id);
      if (lobby.players.length === 0) lobbies.delete(lobby.id);
    }
    io.emit('world_snapshot', worldState);
    io.emit('lobbies', [...lobbies.values()]);
  });
});

setInterval(() => {
  for (const z of worldState.zombies) {
    const nearest = Object.values(worldState.players).sort(
      (a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y),
    )[0];
    if (nearest) {
      const dx = nearest.x - z.x;
      const dy = nearest.y - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      z.x += (dx / dist) * 1.6;
      z.y += (dy / dist) * 1.6;
      if (dist < 28) nearest.hp = Math.max(0, nearest.hp - 0.35);
    }
  }
  io.emit('world_snapshot', worldState);
}, 50);

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
