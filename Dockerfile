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
  return rooms.has(code) ? makeRoomCode() : code;
}

function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(roomCode, data, exceptWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const playerId of room.players.keys()) {
    const client = [...clients.values()].find(c => c.playerId === playerId && c.roomCode === roomCode);
    if (client && client.ws !== exceptWs) {
      safeSend(client.ws, data);
    }
  }
}

function roomSnapshot(room) {
  return {
    roomCode: room.code,
    players: Array.from(room.players.values()),
    bullets: room.bullets
  };
}

function createRoom() {
  const code = makeRoomCode();
  const room = {
    code,
    players: new Map(),
    bullets: [],
    lastBulletId: 1
  };
  rooms.set(code, room);
  return room;
}

function joinRoom(ws, roomCode, name) {
  let room = rooms.get(roomCode);
  if (!room) {
    safeSend(ws, { type: 'error', message: 'Room not found.' });
    return;
  }

  const client = clients.get(ws);
  if (!client) return;

  client.roomCode = roomCode;

  const player = {
    id: client.playerId,
    name: (name || 'Player').slice(0, 16),
    x: 100 + Math.random() * 600,
    y: 100 + Math.random() * 300,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 100,
    color: client.color
  };

  room.players.set(player.id, player);

  safeSend(ws, {
    type: 'joined',
    playerId: player.id,
    room: roomSnapshot(room)
  });

  broadcastRoom(roomCode, {
    type: 'playerJoined',
    player
  }, ws);
}

function leaveRoom(ws) {
  const client = clients.get(ws);
  if (!client || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  const playerId = client.playerId;
  room.players.delete(playerId);

  broadcastRoom(client.roomCode, {
    type: 'playerLeft',
    playerId
  }, ws);

  if (room.players.size === 0) {
    rooms.delete(client.roomCode);
  }

  client.roomCode = null;
}

const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Wasmer Multiplayer Shooter</title>
<style>
  :root{
    --bg:#0A0A0B;
    --panel:rgba(255,255,255,0.10);
    --border:rgba(255,255,255,0.18);
    --cyan:#00F5FF;
    --magenta:#FF00E5;
    --text:#F3F7FA;
    --muted:#9FB0C0;
    --danger:#ff5c7a;
    --ok:#6cffb2;
  }
  *{box-sizing:border-box}
  html,body{
    margin:0;padding:0;width:100%;height:100%;
    background:radial-gradient(circle at top, #141418 0%, #0A0A0B 60%);
    color:var(--text);
    font-family:Inter,system-ui,Arial,sans-serif;
    overflow:hidden;
  }
  canvas{
    display:block;
    width:100vw;
    height:100vh;
    background:transparent;
  }
  .hud{
    position:fixed;
    top:14px;
    left:14px;
    right:14px;
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    pointer-events:none;
  }
  .panel{
    pointer-events:auto;
    background:var(--panel);
    border:1px solid var(--border);
    backdrop-filter:blur(24px) saturate(180%);
    -webkit-backdrop-filter:blur(24px) saturate(180%);
    border-radius:16px;
    padding:12px;
    box-shadow:0 10px 35px rgba(0,0,0,0.35);
  }
  .leftPanel{
    width:min(380px, calc(100vw - 28px));
  }
  .topInfo{
    min-width:220px;
    text-align:right;
  }
  h1{
    margin:0 0 8px 0;
    font-size:18px;
    color:var(--cyan);
    text-shadow:0 0 12px rgba(0,245,255,0.35);
  }
  .row{
    display:flex;
    gap:8px;
    margin-top:8px;
  }
  input{
    width:100%;
    padding:10px 12px;
    border-radius:10px;
    border:1px solid var(--border);
    background:rgba(255,255,255,0.08);
    color:white;
    outline:none;
  }
  input::placeholder{color:#b9c4cf}
  button{
    padding:10px 12px;
    border:none;
    border-radius:10px;
    cursor:pointer;
    font-weight:700;
    color:#071014;
    background:linear-gradient(135deg,var(--cyan),#7efaff);
  }
  button.alt{
    background:linear-gradient(135deg,var(--magenta),#ff6bf1);
    color:white;
  }
  .small{
    font-size:12px;
    color:var(--muted);
    margin-top:8px;
  }
  .status{
    margin-top:8px;
    font-size:13px;
  }
  .ok{color:var(--ok)}
  .err{color:var(--danger)}
  .code{
    font-weight:800;
    letter-spacing:2px;
    color:var(--cyan);
    font-size:18px;
  }
  .help{
    position:fixed;
    left:14px;
    bottom:14px;
    max-width:min(420px, calc(100vw - 28px));
    font-size:12px;
    color:var(--muted);
  }
  .badge{
    display:inline-block;
    margin-top:6px;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid rgba(0,245,255,.25);
    background:rgba(0,245,255,.08);
    color:var(--cyan);
    font-size:12px;
  }
</style>
</head>
<body>
  <canvas id="game"></canvas>

  <div class="hud">
    <div class="panel leftPanel">
      <h1>Multiplayer Shooter</h1>
      <input id="nameInput" placeholder="Your name" maxlength="16" />
      <div class="row">
        <button id="createBtn">Create Room</button>
      </div>
      <div class="row">
        <input id="roomInput" placeholder="Enter room code" maxlength="6" />
        <button id="joinBtn" class="alt">Join Room</button>
      </div>
      <div id="status" class="status">Connecting...</div>
      <div class="small">Open this in another tab/device and join the same room code.</div>
    </div>

    <div class="panel topInfo">
      <div>Room</div>
      <div id="roomCode" class="code">------</div>
      <div id="playersCount" class="small">Players: 0</div>
      <div id="share" class="badge" style="display:none;"></div>
    </div>
  </div>

  <div class="panel help">
    Move: <b>WASD / Arrow keys</b> · Aim: <b>Mouse</b> · Shoot: <b>Click</b>
  </div>

<script>
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const statusEl = document.getElementById('status');
  const roomCodeEl = document.getElementById('roomCode');
  const playersCountEl = document.getElementById('playersCount');
  const shareEl = document.getElementById('share');

  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');

  let connected = false;
  let myId = null;
  let currentRoom = null;
  let mouse = { x: W/2, y: H/2, down: false };
  let keys = new Set();
  let lastSent = 0;
  let lastShot = 0;

  const state = {
    players: new Map(),
    bullets: []
  };

  const me = () => state.players.get(myId);

  function setStatus(msg, ok = true) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (ok ? 'ok' : 'err');
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);

  function randomFallbackColor(id) {
    const colors = ['#00F5FF','#FF00E5','#6CFFB2','#FFD166','#7AA2FF'];
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return colors[sum % colors.length];
  }

  function updateUi() {
    roomCodeEl.textContent = currentRoom || '------';
    playersCountEl.textContent = 'Players: ' + state.players.size;
    if (currentRoom) {
      shareEl.style.display = 'inline-block';
      shareEl.textContent = 'Share code: ' + currentRoom;
    } else {
      shareEl.style.display = 'none';
    }
  }

  ws.addEventListener('open', () => {
    connected = true;
    setStatus('Connected to server');
  });

  ws.addEventListener('close', () => {
    connected = false;
    setStatus('Disconnected from server', false);
  });

  ws.addEventListener('error', () => {
    setStatus('WebSocket error', false);
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'welcome') {
      myId = msg.playerId;
      setStatus('Connected. Create or join a room.');
    }

    if (msg.type === 'roomCreated') {
      currentRoom = msg.roomCode;
      roomInput.value = msg.roomCode;
      ws.send(JSON.stringify({
        type: 'joinRoom',
        roomCode: msg.roomCode,
        name: nameInput.value.trim() || 'Player'
      }));
      updateUi();
    }

    if (msg.type === 'joined') {
      currentRoom = msg.room.roomCode;
      state.players.clear();
      for (const p of msg.room.players) state.players.set(p.id, p);
      state.bullets = msg.room.bullets || [];
      updateUi();
      setStatus('Joined room ' + currentRoom);
    }

    if (msg.type === 'playerJoined') {
      state.players.set(msg.player.id, msg.player);
      updateUi();
    }

    if (msg.type === 'playerLeft') {
      state.players.delete(msg.playerId);
      updateUi();
    }

    if (msg.type === 'state') {
      if (msg.players) {
        for (const p of msg.players) {
          const existing = state.players.get(p.id) || {};
          state.players.set(p.id, { ...existing, ...p });
        }
      }
      if (msg.bullets) state.bullets = msg.bullets;
      updateUi();
    }

    if (msg.type === 'error') {
      setStatus(msg.message || 'Server error', false);
    }
  });

  createBtn.addEventListener('click', () => {
    if (!connected) return setStatus('Not connected yet', false);
    ws.send(JSON.stringify({ type: 'createRoom' }));
  });

  joinBtn.addEventListener('click', () => {
    if (!connected) return setStatus('Not connected yet', false);
    const code = roomInput.value.trim().toUpperCase();
    if (!code) return setStatus('Enter a room code', false);
    ws.send(JSON.stringify({
      type: 'joinRoom',
      roomCode: code,
      name: nameInput.value.trim() || 'Player'
    }));
  });

  window.addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mousedown', () => mouse.down = true);
  window.addEventListener('mouseup', () => mouse.down = false);

  function updateLocal(dt) {
    const p = me();
    if (!p) return;

    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;

    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const speed = 220;
    p.x += dx * speed * dt;
    p.y += dy * speed * dt;

    p.x = Math.max(20, Math.min(W - 20, p.x));
    p.y = Math.max(20, Math.min(H - 20, p.y));

    p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);

    const now = performance.now();
    if (ws.readyState === 1 && now - lastSent > 33) {
      ws.send(JSON.stringify({
        type: 'move',
        x: p.x,
        y: p.y,
        angle: p.angle
      }));
      lastSent = now;
    }

    if (mouse.down && ws.readyState === 1 && now - lastShot > 160) {
      ws.send(JSON.stringify({
        type: 'shoot',
        x: p.x,
        y: p.y,
        angle: p.angle
      }));
      lastShot = now;
    }
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(p, isMe) {
    const color = p.color || randomFallbackColor(p.id);

    ctx.save();
    ctx.translate(p.x, p.y);

    ctx.shadowColor = color;
    ctx.shadowBlur = 18;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(p.angle || 0);
    ctx.fillStyle = '#dffcff';
    ctx.fillRect(6, -4, 18, 8);

    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((isMe ? 'You' : p.name || 'Player') + ' [' + (p.hp ?? 100) + ']', p.x, p.y - 22);
  }

  function drawBullets() {
    for (const b of state.bullets) {
      ctx.save();
      ctx.fillStyle = '#FFD166';
      ctx.shadowColor = '#FFD166';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    updateLocal(dt);

    ctx.clearRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#101218');
    g.addColorStop(1, '#09090b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawGrid();
    drawBullets();

    for (const [id, p] of state.players) {
      drawPlayer(p, id === myId);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
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
  const colorOptions = ['#00F5FF', '#FF00E5', '#6CFFB2', '#FFD166', '#7AA2FF'];
  const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];

  clients.set(ws, {
    ws,
    playerId,
    roomCode: null,
    color
  });

  safeSend(ws, { type: 'welcome', playerId });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    const client = clients.get(ws);
    if (!client) return;

    if (msg.type === 'createRoom') {
      const room = createRoom();
      safeSend(ws, { type: 'roomCreated', roomCode: room.code });
      return;
    }

    if (msg.type === 'joinRoom') {
      leaveRoom(ws);
      joinRoom(ws, String(msg.roomCode || '').toUpperCase(), String(msg.name || 'Player'));
      return;
    }

    if (!client.roomCode) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;
    const player = room.players.get(client.playerId);
    if (!player) return;

    if (msg.type === 'move') {
      player.x = Number(msg.x) || player.x;
      player.y = Number(msg.y) || player.y;
      player.angle = Number(msg.angle) || 0;

      broadcastRoom(client.roomCode, {
        type: 'state',
        players: [player]
      }, ws);
      return;
    }

    if (msg.type === 'shoot') {
      const speed = 500;
      const bullet = {
        id: room.lastBulletId++,
        ownerId: player.id,
        x: player.x + Math.cos(player.angle) * 22,
        y: player.y + Math.sin(player.angle) * 22,
        vx: Math.cos(player.angle) * speed,
        vy: Math.sin(player.angle) * speed,
        life: 1.2
      };
      room.bullets.push(bullet);
      broadcastRoom(client.roomCode, {
        type: 'state',
        bullets: room.bullets
      });
      return;
    }
  });

  ws.on('close', () => {
    leaveRoom(ws);
    clients.delete(ws);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      b.x += b.vx / 30;
      b.y += b.vy / 30;
      b.life -= 1 / 30;

      if (b.life <= 0) {
        room.bullets.splice(i, 1);
        continue;
      }

      for (const p of room.players.values()) {
        if (p.id === b.ownerId) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        if (dx * dx + dy * dy < 18 * 18) {
          p.hp -= 20;
          if (p.hp <= 0) {
            p.hp = 100;
            p.x = 80 + Math.random() * 700;
            p.y = 80 + Math.random() * 400;
          }
          room.bullets.splice(i, 1);
          break;
        }
      }
    }

    broadcastRoom(room.code, {
      type: 'state',
      players: Array.from(room.players.values()),
      bullets: room.bullets
    });
  }
}, 1000 / 30);

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});
EOF

EXPOSE 8080

CMD ["node", "/app/server.js"]
