import express   from 'express';
import http      from 'http';
import { Server } from 'socket.io';
import fs        from 'fs';
import path      from 'path';
import bcrypt    from 'bcryptjs';
import jwt       from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'survival-secret-key';
const DB_PATH    = path.join(__dirname, 'data', 'db.json');

// ── DB HELPERS ─────────────────────────────────────────────────────────────
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (!fs.existsSync(DB_PATH))
  fs.writeFileSync(DB_PATH, JSON.stringify({ users:[], profiles:[], progress:[], matches:[] }, null, 2));

const readDb  = ()   => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDb = (db) => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
const uid     = ()   => Math.random().toString(36).slice(2, 10);

// ── IN-MEMORY STATE ────────────────────────────────────────────────────────
const onlinePlayers = new Map();  // socketId → { userId, pseudo }
const socketPseudos = new Map();  // socketId → pseudo (set on join_world / join_lobby)
const lobbies       = new Map();  // lobbyId  → lobby object

// ── WORLD STATE (DayZero multiplayer game) ────────────────────────────────
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
    x:    Math.random() * 2700 + 50,
    y:    Math.random() * 2700 + 50,
    type: ['food','water','ammo','medkit','pistol'][i % 5],
  })),
};

// ── EXPRESS MIDDLEWARE ─────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ── AUTH MIDDLEWARE ────────────────────────────────────────────────────────
function authMw(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ── ROUTES ─────────────────────────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, pseudo } = req.body;
  if (!email || !password || !pseudo) return res.status(400).json({ error: 'Champs manquants' });
  const db = readDb();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'Email déjà utilisé' });
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = uid();
  db.users.push({ id: userId, email, passwordHash, createdAt: Date.now() });
  db.profiles.push({
    userId,
    pseudo,
    avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(pseudo)}&backgroundColor=060a06`,
    stats:  { kills: 0, deaths: 0, wins: 0, xp: 0 },
  });
  db.progress.push({
    userId,
    level: 1,
    inventory: [],
    survival: { hp: 100, hunger: 100, thirst: 100 },
    games: {},
  });
  writeDb(db);
  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db   = readDb();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok)  return res.status(401).json({ error: 'Identifiants invalides' });
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId: user.id });
});

// Get profile
app.get('/api/profile', authMw, (req, res) => {
  const db       = readDb();
  const profile  = db.profiles.find(p => p.userId === req.user.userId);
  const progress = db.progress.find(p => p.userId === req.user.userId);
  if (!profile) return res.status(404).json({ error: 'Profil introuvable' });
  res.json({ ...profile, progress });
});

// Update profile
app.put('/api/profile', authMw, (req, res) => {
  const { pseudo, avatar } = req.body;
  const db      = readDb();
  const profile = db.profiles.find(p => p.userId === req.user.userId);
  if (!profile) return res.status(404).json({ error: 'Profil introuvable' });
  if (pseudo) profile.pseudo = pseudo;
  if (avatar) profile.avatar = avatar;
  writeDb(db);
  res.json(profile);
});

// Update progress
app.post('/api/progress', authMw, (req, res) => {
  const update = req.body;
  const db     = readDb();
  const prog   = db.progress.find(x => x.userId === req.user.userId);
  if (!prog) return res.status(404).json({ error: 'Progression introuvable' });
  prog.level    = Math.max(prog.level, update.level || prog.level);
  prog.inventory = update.inventory ?? prog.inventory;
  prog.survival  = update.survival  ?? prog.survival;
  prog.games     = { ...prog.games, ...(update.games || {}) };
  writeDb(db);
  res.json({ ok: true });
});

// Update stats (kills, deaths, wins, xp)
app.post('/api/stats', authMw, (req, res) => {
  const { kills=0, deaths=0, wins=0, xp=0 } = req.body;
  const db      = readDb();
  const profile = db.profiles.find(p => p.userId === req.user.userId);
  if (!profile) return res.status(404).json({ error: 'Profil introuvable' });
  profile.stats.kills  += kills;
  profile.stats.deaths += deaths;
  profile.stats.wins   += wins;
  profile.stats.xp     += xp;
  writeDb(db);
  res.json(profile.stats);
});

// Games list
app.get('/api/games', (_req, res) => {
  res.json([
    { id:'dayzero',       name:'DayZero Wasteland',   mode:'multiplayer', players: Object.keys(worldState.players).length },
    { id:'mini-survival', name:'Mini Survival',        mode:'solo' },
    { id:'battle-lite',   name:'Battle Royale Lite',   mode:'solo' },
    { id:'arcade-horde',  name:'Arcade Horde Rush',    mode:'solo' },
  ]);
});

// Lobbies list
app.get('/api/lobbies', (_req, res) => {
  res.json([...lobbies.values()].map(l => ({
    id:      l.id,
    name:    l.name,
    players: l.players.length,
    game:    l.game,
  })));
});

// ── SOCKET.IO ──────────────────────────────────────────────────────────────
function broadcastOnlineCount() {
  io.emit('online_count', onlinePlayers.size);
}

io.on('connection', socket => {

  // ── AUTH ────────────────────────────────────────────────────────────────
  socket.on('auth', ({ token }) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      onlinePlayers.set(socket.id, { userId: payload.userId, pseudo: payload.email.split('@')[0] });
      socket.emit('auth_ok');
      broadcastOnlineCount();
    } catch {
      socket.emit('auth_fail');
    }
  });

  // ── DAYZERO WORLD ───────────────────────────────────────────────────────
  socket.on('join_world', ({ pseudo }) => {
    socketPseudos.set(socket.id, pseudo);
    const spawn = {
      x: 1300 + Math.random() * 300,
      y: 1300 + Math.random() * 300,
    };
    worldState.players[socket.id] = {
      id:        socket.id,
      pseudo,
      x:         spawn.x,
      y:         spawn.y,
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
    p.x       = Math.max(0, Math.min(worldState.size.w, p.x + mx * speed));
    p.y       = Math.max(0, Math.min(worldState.size.h, p.y + my * speed));
    p.hunger  = Math.max(0, p.hunger - 0.02);
    p.thirst  = Math.max(0, p.thirst - 0.03);
    p.facing  = angle || p.facing;
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

  // ── LOBBIES ─────────────────────────────────────────────────────────────
  socket.on('create_lobby', ({ name, game, pseudo }) => {
    const pseudo_ = pseudo || socketPseudos.get(socket.id) || 'Guest';
    socketPseudos.set(socket.id, pseudo_);
    const lobby = {
      id:      uid(),
      name:    name || 'Nouveau lobby',
      game:    game || 'dayzero',
      players: [pseudo_],
      chat:    [],
    };
    lobbies.set(lobby.id, lobby);
    socket.join(lobby.id);
    socket._lobbyId = lobby.id;
    io.emit('lobbies', [...lobbies.values()]);
    io.to(lobby.id).emit('lobby_update', lobby);
  });

  socket.on('join_lobby', ({ lobbyId, pseudo }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const pseudo_ = pseudo || socketPseudos.get(socket.id) || 'Guest';
    socketPseudos.set(socket.id, pseudo_);
    if (!lobby.players.includes(pseudo_)) lobby.players.push(pseudo_);
    socket.join(lobby.id);
    socket._lobbyId = lobby.id;
    io.to(lobby.id).emit('lobby_update', lobby);
    io.emit('lobbies', [...lobbies.values()]);
  });

  socket.on('leave_lobby', ({ lobbyId, pseudo }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const pseudo_ = pseudo || socketPseudos.get(socket.id) || '';
    lobby.players = lobby.players.filter(p => p !== pseudo_);
    socket.leave(lobbyId);
    socket._lobbyId = null;
    if (lobby.players.length === 0) {
      lobbies.delete(lobbyId);
    } else {
      io.to(lobbyId).emit('lobby_update', lobby);
    }
    io.emit('lobbies', [...lobbies.values()]);
  });

  socket.on('auto_matchmake', ({ game, pseudo }) => {
    const pseudo_ = pseudo || socketPseudos.get(socket.id) || 'Guest';
    socketPseudos.set(socket.id, pseudo_);

    let lobby = [...lobbies.values()].find(l => l.game === game && l.players.length < 8);
    if (!lobby) {
      lobby = { id: uid(), name: `Auto ${game}`, game, players: [], chat: [] };
      lobbies.set(lobby.id, lobby);
    }
    if (!lobby.players.includes(pseudo_)) lobby.players.push(pseudo_);
    socket.join(lobby.id);
    socket._lobbyId = lobby.id;

    io.to(lobby.id).emit('lobby_update', lobby);
    io.emit('lobbies', [...lobbies.values()]);

    // Notify this socket of the match result
    socket.emit('matchmake_result', { lobbyId: lobby.id, lobbyName: lobby.name });
  });

  // ── CHAT ────────────────────────────────────────────────────────────────
  socket.on('chat', ({ lobbyId, message, pseudo }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const line = {
      id:      uid(),
      pseudo:  pseudo || socketPseudos.get(socket.id) || 'Guest',
      message: String(message).slice(0, 180),
      at:      Date.now(),
    };
    lobby.chat.push(line);
    lobby.chat = lobby.chat.slice(-100);
    io.to(lobbyId).emit('chat', line);
  });

  // ── DISCONNECT ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Remove from world
    delete worldState.players[socket.id];

    // Remove from any lobby
    const pseudo = socketPseudos.get(socket.id);
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

    onlinePlayers.delete(socket.id);
    socketPseudos.delete(socket.id);

    io.emit('world_snapshot', worldState);
    io.emit('lobbies', [...lobbies.values()]);
    broadcastOnlineCount();
  });
});

// ── SERVER GAME LOOP (zombie AI + world broadcast) ────────────────────────
setInterval(() => {
  for (const z of worldState.zombies) {
    const nearest = Object.values(worldState.players)
      .sort((a,b) => Math.hypot(a.x-z.x,a.y-z.y) - Math.hypot(b.x-z.x,b.y-z.y))[0];
    if (nearest) {
      const dx   = nearest.x - z.x;
      const dy   = nearest.y - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      z.x += (dx / dist) * 1.6;
      z.y += (dy / dist) * 1.6;
      if (dist < 28) nearest.hp = Math.max(0, nearest.hp - 0.35);
    }
  }
  io.emit('world_snapshot', worldState);
}, 50);

// ── STATIC SPA FALLBACK ────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

server.listen(PORT, () => console.log(`✅  SurvivalHub running → http://localhost:${PORT}`));
