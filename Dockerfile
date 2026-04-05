FROM node:20-alpine

WORKDIR /app

RUN npm init -y && npm install ws

RUN cat > /app/server.js <<'EOF'
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const rooms = new Map();
const clients = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: new Map(),
      bullets: [],
      lastBulletId: 1
    });
  }
  return rooms.get(code);
}

function sanitizePlayer(p) {
  return {
    id: p.id,
    name: p.name || 'Player',
    x: Number.isFinite(p.x) ? p.x : 200,
    y: Number.isFinite(p.y) ? p.y : 200,
    angle: Number.isFinite(p.angle) ? p.angle : 0,
    hp: Number.isFinite(p.hp) ? p.hp : 100,
    color: p.color || '#00F5FF'
  };
}

function roomState(room) {
  return {
    type: 'state',
    roomCode: room.code,
    players: Array.from(room.players.values()).map(sanitizePlayer),
    bullets: room.bullets
  };
}

function broadcastRoom(room, payload) {
  const data = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function removePlayer(ws) {
  const meta = clients.get(ws);
  if (!meta) return;

  const { roomCode, playerId } = meta;
  const room = rooms.get(roomCode);
  if (room) {
    room.players.delete(playerId);
    broadcastRoom(room, {
      type: 'player_left',
      playerId
    });

    if (room.players.size === 0) {
      rooms.delete(roomCode);
    } else {
      broadcastRoom(room, roomState(room));
    }
  }

  clients.delete(ws);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wasmer Multiplayer Shooter</title>
  <style>
    :root {
      --bg: #0A0A0B;
      --panel: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.18);
      --cyan: #00F5FF;
      --magenta: #FF00E5;
      --text: #F4F7FB;
      --muted: #AAB3C5;
      --danger: #ff4d6d;
      --ok: #2bd576;
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at top, #15151a 0%, #0A0A0B 55%);
      color: var(--text);
      font-family: Inter, Arial, sans-serif;
      overflow: hidden;
    }

    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
      background: transparent;
    }

    .hud, .menu {
      position: fixed;
      z-index: 10;
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.35);
    }

    .menu {
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 420px);
      padding: 18px;
    }

    .hud {
      top: 12px;
      left: 12px;
      padding: 12px 14px;
      min-width: 250px;
    }

    h1, h2, p { margin: 0 0 12px 0; }
    h1 {
      font-size: 20px;
      color: var(--cyan);
    }

    .row {
      display: flex;
      gap: 10px;
      margin: 8px 0;
      align-items: center;
    }

    .col {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    input, button {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.06);
      color: var(--text);
      outline: none;
      font-size: 14px;
    }

    input::placeholder { color: #98a2b3; }

    button {
      cursor: pointer;
      transition: 0.2s ease;
      font-weight: 700;
    }

    button:hover {
      transform: translateY(-1px);
      border-color: rgba(0,245,255,0.5);
      box-shadow: 0 0 18px rgba(0,245,255,0.18);
    }

    .primary {
      background: linear-gradient(135deg, rgba(0,245,255,0.18), rgba(255,0,229,0.18));
    }

    .muted { color: var(--muted); font-size: 13px; }
    .ok { color: var(--ok); }
    .danger { color: var(--danger); }
    .hidden { display: none; }

    .badge {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--cyan);
      background: rgba(255,255,255,0.06);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    .topright {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 11;
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 10px 12px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <canvas id="game"></canvas>

  <div class="menu" id="menu">
    <h1>Multiplayer Shooter</h1>
    <p class="muted">Create a room or join one with a code. Open in two tabs to test.</p>

    <div class="col">
      <input id="nameInput" maxlength="16" placeholder="Your name" />
      <div class="row">
        <button class="primary" id="createBtn">Create Room</button>
        <button id="joinBtn">Join Room</button>
      </div>
      <input id="roomInput" maxlength="6" placeholder="Room code (for Join)" />
      <p id="status" class="muted">Connecting...</p>
    </div>
  </div>

  <div class="hud hidden" id="hud">
    <div class="row" style="justify-content:space-between;">
      <strong>Room: <span id="roomCode">------</span></strong>
      <span class="badge" id="hpLabel">HP 100</span>
    </div>
    <div class="muted">WASD move · Mouse aim · Click shoot</div>
    <div class="muted">Share this code with friends.</div>
  </div>

  <div class="topright hidden" id="netBox">offline</div>

  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    const menu = document.getElementById('menu');
    const hud = document.getElementById('hud');
    const roomCodeEl = document.getElementById('roomCode');
    const hpLabel = document.getElementById('hpLabel');
    const statusEl = document.getElementById('status');
    const netBox = document.getElementById('netBox');

    const nameInput = document.getElementById('nameInput');
    const roomInput = document.getElementById('roomInput');
    const createBtn = document.getElementById('createBtn');
    const joinBtn = document.getElementById('joinBtn');

    let W = canvas.width = innerWidth;
    let H = canvas.height = innerHeight;
    addEventListener('resize', () => {
      W = canvas.width = innerWidth;
      H = canvas.height = innerHeight;
    });

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(proto + '//' + location.host + '/ws');

    const state = {
      connected: false,
      joined: false,
      selfId: null,
      roomCode: null,
      players: new Map(),
      bullets: [],
      keys: {},
      mouse: { x: W/2, y: H/2 },
      me: { x: 200, y: 200, angle: 0, hp: 100, color: '#00F5FF', name: 'Player' },
      lastSent: 0
    };

    function setStatus(msg, cls='muted') {
      statusEl.className = cls;
      statusEl.textContent = msg;
    }

    function randColor() {
      const colors = ['#00F5FF', '#FF00E5', '#7CFF6B', '#FFD166', '#7AA2FF'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    function send(obj) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    }

    ws.addEventListener('open', () => {
      state.connected = true;
      netBox.classList.remove('hidden');
      netBox.textContent = 'online';
      netBox.className = 'topright ok';
      setStatus('Connected. Create or join a room.', 'ok');
    });

    ws.addEventListener('close', () => {
      state.connected = false;
      netBox.textContent = 'offline';
      netBox.className = 'topright danger';
      setStatus('Disconnected from server.', 'danger');
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'welcome') {
        state.selfId = msg.playerId;
      }

      if (msg.type === 'joined') {
        state.joined = true;
        state.roomCode = msg.roomCode;
        roomCodeEl.textContent = msg.roomCode;
        menu.classList.add('hidden');
        hud.classList.remove('hidden');
        history.replaceState(null, '', '/?room=' + encodeURIComponent(msg.roomCode));
      }

      if (msg.type === 'state') {
        state.players.clear();
        for (const p of msg.players) {
          state.players.set(p.id, p);
          if (p.id === state.selfId) {
            state.me.hp = p.hp;
            hpLabel.textContent = 'HP ' + p.hp;
          }
        }
        state.bullets = msg.bullets || [];
      }

      if (msg.type === 'error') {
        setStatus(msg.message || 'Error', 'danger');
      }
    });

    createBtn.onclick = () => {
      const name = (nameInput.value || 'Player').trim().slice(0,16);
      state.me.name = name || 'Player';
      state.me.color = randColor();
      send({
        type: 'create_room',
        name: state.me.name,
        color: state.me.color
      });
    };

    joinBtn.onclick = () => {
      const code = (roomInput.value || '').trim().toUpperCase();
      const name = (nameInput.value || 'Player').trim().slice(0,16);
      if (!code) {
        setStatus('Enter a room code first.', 'danger');
        return;
      }
      state.me.name = name || 'Player';
      state.me.color = randColor();
      send({
        type: 'join_room',
        roomCode: code,
        name: state.me.name,
        color: state.me.color
      });
    };

    const params = new URLSearchParams(location.search);
    const roomFromUrl = (params.get('room') || '').toUpperCase();
    if (roomFromUrl) roomInput.value = roomFromUrl;

    addEventListener('keydown', e => state.keys[e.key.toLowerCase()] = true);
    addEventListener('keyup', e => state.keys[e.key.toLowerCase()] = false);
    addEventListener('mousemove', e => {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
    });

    addEventListener('mousedown', () => {
      if (!state.joined) return;
      send({ type: 'shoot' });
    });

    function update(dt) {
      if (!state.joined) return;

      const speed = 220;
      let dx = 0, dy = 0;
      if (state.keys['w']) dy -= 1;
      if (state.keys['s']) dy += 1;
      if (state.keys['a']) dx -= 1;
      if (state.keys['d']) dx += 1;

      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;

      state.me.x += dx * speed * dt;
      state.me.y += dy * speed * dt;

      state.me.x = Math.max(20, Math.min(W - 20, state.me.x));
      state.me.y = Math.max(20, Math.min(H - 20, state.me.y));

      state.me.angle = Math.atan2(state.mouse.y - state.me.y, state.mouse.x - state.me.x);

      const now = performance.now();
      if (now - state.lastSent > 33) {
        state.lastSent = now;
        send({
          type: 'move',
          x: state.me.x,
          y: state.me.y,
          angle: state.me.angle
        });
      }
    }

    function drawGrid() {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      const size = 40;
      for (let x = 0; x < W; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    function drawPlayer(p, isSelf) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);

      ctx.shadowBlur = 18;
      ctx.shadowColor = p.color || '#00F5FF';
      ctx.fillStyle = p.color || '#00F5FF';

      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillRect(8, -3, 16, 6);

      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText((p.name || 'Player') + (isSelf ? ' (You)' : ''), p.x, p.y - 18);

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(p.x - 20, p.y + 16, 40, 5);
      ctx.fillStyle = p.hp > 35 ? '#2bd576' : '#ff4d6d';
      ctx.fillRect(p.x - 20, p.y + 16, Math.max(0, (p.hp / 100) * 40), 5);
    }

    function drawBullet(b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FF00E5';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#FF00E5';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      update(dt);

      ctx.clearRect(0, 0, W, H);
      drawGrid();

      for (const b of state.bullets) drawBullet(b);
      for (const [id, p] of state.players) drawPlayer(p, id === state.selfId);

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const playerId = makeId();

  ws.send(JSON.stringify({
    type: 'welcome',
    playerId
  }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'create_room') {
      let code;
      do {
        code = makeRoomCode();
      } while (rooms.has(code));

      const room = getOrCreateRoom(code);
      const player = {
        id: playerId,
        ws,
        name: (msg.name || 'Player').slice(0, 16),
        x: 200 + Math.random() * 300,
        y: 150 + Math.random() * 200,
        angle: 0,
        hp: 100,
        color: msg.color || '#00F5FF'
      };

      room.players.set(playerId, player);
      clients.set(ws, { roomCode: code, playerId });

      ws.send(JSON.stringify({ type: 'joined', roomCode: code, playerId }));
      broadcastRoom(room, roomState(room));
      return;
    }

    if (msg.type === 'join_room') {
      const code = String(msg.roomCode || '').toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
        return;
      }

      const player = {
        id: playerId,
        ws,
        name: (msg.name || 'Player').slice(0, 16),
        x: 240 + Math.random() * 260,
        y: 170 + Math.random() * 180,
        angle: 0,
        hp: 100,
        color: msg.color || '#FF00E5'
      };

      room.players.set(playerId, player);
      clients.set(ws, { roomCode: code, playerId });

      ws.send(JSON.stringify({ type: 'joined', roomCode: code, playerId }));
      broadcastRoom(room, roomState(room));
      return;
    }

    const meta = clients.get(ws);
    if (!meta) return;

    const room = rooms.get(meta.roomCode);
    if (!room) return;

    const player = room.players.get(meta.playerId);
    if (!player) return;

    if (msg.type === 'move') {
      player.x = Math.max(20, Math.min(3000, Number(msg.x) || player.x));
      player.y = Math.max(20, Math.min(3000, Number(msg.y) || player.y));
      player.angle = Number(msg.angle) || 0;
      broadcastRoom(room, roomState(room));
      return;
    }

    if (msg.type === 'shoot') {
      const speed = 560;
      const bullet = {
        id: room.lastBulletId++,
        ownerId: player.id,
        x: player.x + Math.cos(player.angle) * 24,
        y: player.y + Math.sin(player.angle) * 24,
        vx: Math.cos(player.angle) * speed,
        vy: Math.sin(player.angle) * speed,
        ttl: 1.1
      };
      room.bullets.push(bullet);
      broadcastRoom(room, roomState(room));
      return;
    }
  });

  ws.on('close', () => removePlayer(ws));
  ws.on('error', () => removePlayer(ws));
});

setInterval(() => {
  for (const room of rooms.values()) {
    const survivors = [];

    for (const b of room.bullets) {
      b.x += b.vx * 0.05;
      b.y += b.vy * 0.05;
      b.ttl -= 0.05;

      let hit = false;
      for (const p of room.players.values()) {
        if (p.id === b.ownerId) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if ((dx * dx + dy * dy) < 18 * 18) {
          p.hp -= 20;
          if (p.hp <= 0) {
            p.hp = 100;
            p.x = 120 + Math.random() * 500;
            p.y = 120 + Math.random() * 300;
          }
          hit = true;
          break;
        }
      }

      if (!hit && b.ttl > 0) survivors.push(b);
    }

    room.bullets = survivors;
    if (room.players.size > 0) {
      broadcastRoom(room, roomState(room));
    }
  }
}, 50);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on port ' + PORT);
});
EOF

EXPOSE 8080

CMD ["node", "/app/server.js"]
