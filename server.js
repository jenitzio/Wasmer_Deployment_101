const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;

const rooms = new Map(); // roomCode -> room
const clients = new Map(); // ws -> { id, roomCode, name }

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

function randomSpawn() {
  return {
    x: 100 + Math.random() * 1000,
    y: 100 + Math.random() * 600
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {}
}

function broadcastRoom(roomCode, data) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const client of room.clients) {
    safeSend(client.ws, data);
  }
}

function roomState(room) {
  return {
    type: 'roomState',
    roomCode: room.code,
    players: Object.values(room.players),
    bullets: room.bullets
  };
}

function createRoom() {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();

  const room = {
    code,
    clients: [],
    players: {}, // id -> player
    bullets: [],
    lastBulletId: 0
  };
  rooms.set(code, room);
  return room;
}

function removeClientFromRoom(ws) {
  const info = clients.get(ws);
  if (!info) return;

  const room = rooms.get(info.roomCode);
  if (room) {
    room.clients = room.clients.filter(c => c.ws !== ws);
    delete room.players[info.id];

    broadcastRoom(room.code, {
      type: 'playerLeft',
      id: info.id
    });

    broadcastRoom(room.code, roomState(room));

    if (room.clients.length === 0) {
      rooms.delete(room.code);
    }
  }

  clients.delete(ws);
}

function joinRoom(ws, roomCode, name) {
  const room = rooms.get(roomCode);
  if (!room) {
    safeSend(ws, { type: 'errorMessage', message: 'Room not found.' });
    return;
  }

  const id = makeId();
  const spawn = randomSpawn();

  const player = {
    id,
    name: String(name || 'Player').slice(0, 16),
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 100,
    alive: true,
    color: `hsl(${Math.floor(Math.random() * 360)}deg 90% 60%)`,
    kills: 0,
    deaths: 0
  };

  room.players[id] = player;
  room.clients.push({ ws, id });

  clients.set(ws, {
    id,
    roomCode: room.code,
    name: player.name
  });

  safeSend(ws, {
    type: 'joined',
    id,
    roomCode: room.code,
    player
  });

  broadcastRoom(room.code, roomState(room));
}

function createAndJoinRoom(ws, name) {
  const room = createRoom();
  joinRoom(ws, room.code, name);
}

function respawnPlayer(room, playerId) {
  const p = room.players[playerId];
  if (!p) return;
  const spawn = randomSpawn();
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.hp = 100;
  p.alive = true;
  broadcastRoom(room.code, {
    type: 'respawn',
    player: p
  });
}

function tickRooms() {
  const now = Date.now();

  for (const room of rooms.values()) {
    // Update bullets
    for (const b of room.bullets) {
      b.x += b.vx;
      b.y += b.vy;
      b.life -= 1;
    }

    // Bullet collisions + cleanup
    const survivors = [];
    for (const b of room.bullets) {
      let hit = false;

      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > 1200 || b.y > 800) {
        continue;
      }

      for (const p of Object.values(room.players)) {
        if (!p.alive) continue;
        if (p.id === b.ownerId) continue;

        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const dist2 = dx * dx + dy * dy;
        const r = 18;

        if (dist2 <= r * r) {
          p.hp -= 25;
          hit = true;

          broadcastRoom(room.code, {
            type: 'hit',
            targetId: p.id,
            hp: p.hp,
            x: b.x,
            y: b.y
          });

          if (p.hp <= 0) {
            p.alive = false;
            p.hp = 0;
            p.deaths += 1;

            const killer = room.players[b.ownerId];
            if (killer) killer.kills += 1;

            broadcastRoom(room.code, {
              type: 'died',
              victimId: p.id,
              killerId: b.ownerId
            });

            setTimeout(() => {
              const stillRoom = rooms.get(room.code);
              if (!stillRoom) return;
              respawnPlayer(stillRoom, p.id);
            }, 2000);
          }

          break;
        }
      }

      if (!hit) survivors.push(b);
    }

    room.bullets = survivors;

    // Broadcast state frequently
    broadcastRoom(room.code, {
      type: 'state',
      players: Object.values(room.players),
      bullets: room.bullets,
      serverTime: now
    });
  }
}

setInterval(tickRooms, 1000 / 30);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Multiplayer Shooter</title>
<style>
  :root{
    --bg:#0A0A0B;
    --panel:rgba(255,255,255,0.10);
    --panel-2:rgba(255,255,255,0.07);
    --border:rgba(255,255,255,0.18);
    --cyan:#00F5FF;
    --magenta:#FF00E5;
    --text:#F5FBFF;
    --muted:#AAB8C3;
    --danger:#FF5577;
    --good:#57FFA3;
  }
  *{box-sizing:border-box}
  html,body{
    margin:0;padding:0;background:radial-gradient(circle at top,#131319 0%,#0A0A0B 55%);
    color:var(--text);font-family:Inter,system-ui,Arial,sans-serif;height:100%;overflow:hidden
  }
  canvas{
    display:block;width:100vw;height:100vh;background:
      radial-gradient(circle at 20% 20%, rgba(0,245,255,.08), transparent 20%),
      radial-gradient(circle at 80% 30%, rgba(255,0,229,.06), transparent 25%),
      linear-gradient(180deg,#101014,#080809);
    cursor:crosshair;
  }
  .hud{
    position:fixed;inset:16px auto auto 16px;display:flex;flex-direction:column;gap:10px;z-index:10;
    max-width:min(92vw,380px);
  }
  .panel{
    background:var(--panel);
    backdrop-filter: blur(18px) saturate(180%);
    border:1px solid var(--border);
    border-radius:16px;
    box-shadow:0 10px 35px rgba(0,0,0,.35);
  }
  .topbar{
    padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap
  }
  .title{
    font-weight:800;letter-spacing:.04em;color:var(--cyan);text-shadow:0 0 16px rgba(0,245,255,.35)
  }
  .small{font-size:12px;color:var(--muted)}
  .menu{
    padding:14px;display:grid;gap:10px
  }
  .row{display:flex;gap:10px;flex-wrap:wrap}
  input{
    flex:1;min-width:120px;
    background:var(--panel-2);color:var(--text);
    border:1px solid var(--border);border-radius:12px;padding:12px 12px;outline:none
  }
  button{
    background:linear-gradient(135deg, rgba(0,245,255,.18), rgba(255,0,229,.16));
    color:var(--text);
    border:1px solid rgba(255,255,255,.22);
    border-radius:12px;padding:12px 14px;cursor:pointer;font-weight:700
  }
  button:hover{filter:brightness(1.08)}
  button.secondary{
    background:rgba(255,255,255,.07)
  }
  .status{
    padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);font-size:13px;color:var(--muted)
  }
  .roomLine{
    display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap
  }
  .badge{
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 10px;border-radius:999px;background:rgba(0,245,255,.12);
    border:1px solid rgba(0,245,255,.25);color:var(--cyan);font-weight:800;letter-spacing:.1em
  }
  .score{
    position:fixed;top:16px;right:16px;z-index:10;width:min(92vw,260px);padding:12px 14px
  }
  .score h3{margin:0 0 8px 0;font-size:14px;color:var(--muted)}
  .board{display:grid;gap:6px;font-size:13px}
  .entry{display:flex;justify-content:space-between;gap:8px}
  .controls{
    position:fixed;left:16px;bottom:16px;z-index:10;padding:10px 12px;font-size:12px;color:var(--muted)
  }
  .centerMsg{
    position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    z-index:11;padding:14px 18px;display:none
  }
  .show{display:block}
  .accent{color:var(--magenta)}
  @media (max-width:640px){
    .score{top:auto;bottom:16px;right:16px}
  }
</style>
</head>
<body>
<canvas id="game"></canvas>

<div class="hud">
  <div class="panel topbar">
    <div class="title">CYBER SHOOTER</div>
    <div class="small" id="connLabel">Disconnected</div>
  </div>

  <div class="panel menu">
    <div class="row">
      <input id="nameInput" maxlength="16" placeholder="Your name" />
    </div>
    <div class="row">
      <button id="createBtn">Create room</button>
      <button id="leaveBtn" class="secondary">Leave</button>
    </div>
    <div class="row">
      <input id="roomInput" maxlength="6" placeholder="Enter room code" />
      <button id="joinBtn">Join room</button>
    </div>
    <div class="status" id="statusBox">Create a room or enter a code to join one.</div>
    <div class="roomLine">
      <div class="badge">ROOM <span id="roomCodeLabel">------</span></div>
      <button id="copyBtn" class="secondary">Copy invite</button>
    </div>
  </div>
</div>

<div class="panel score">
  <h3>Scoreboard</h3>
  <div class="board" id="scoreboard"></div>
</div>

<div class="panel controls">
  WASD / Arrows = move · Mouse = aim · Click = shoot
</div>

<div class="panel centerMsg" id="centerMsg"></div>

<script>
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const connLabel = document.getElementById('connLabel');
  const statusBox = document.getElementById('statusBox');
  const roomCodeLabel = document.getElementById('roomCodeLabel');
  const scoreboard = document.getElementById('scoreboard');
  const centerMsg = document.getElementById('centerMsg');

  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const copyBtn = document.getElementById('copyBtn');

  const params = new URLSearchParams(location.search);
  const prefillRoom = (params.get('room') || '').toUpperCase();
  if (prefillRoom) roomInput.value = prefillRoom;
  nameInput.value = localStorage.getItem('mp_name') || ('Player' + Math.floor(Math.random()*1000));

  let ws = null;
  let myId = null;
  let myRoom = null;
  let players = [];
  let bullets = [];
  let effects = [];
  let keys = {};
  let mouse = { x: 0, y: 0, down: false };
  let camera = { x: 0, y: 0 };
  let lastShot = 0;
  let connected = false;

  const WORLD = { w: 1200, h: 800 };

  function setStatus(text) {
    statusBox.textContent = text;
  }

  function flashMessage(text) {
    centerMsg.textContent = text;
    centerMsg.classList.add('show');
    clearTimeout(flashMessage._t);
    flashMessage._t = setTimeout(() => centerMsg.classList.remove('show'), 1400);
  }

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => {
      connected = true;
      connLabel.textContent = 'Connected';
      connLabel.style.color = 'var(--good)';
      setStatus('Connected. Create or join a room.');
    });

    ws.addEventListener('close', () => {
      connected = false;
      connLabel.textContent = 'Disconnected';
      connLabel.style.color = 'var(--danger)';
      setStatus('Connection lost. Reconnecting...');
      setTimeout(connect, 1000);
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'joined') {
        myId = msg.id;
        myRoom = msg.roomCode;
        roomCodeLabel.textContent = myRoom;
        setStatus('Joined room ' + myRoom);
        history.replaceState({}, '', '/?room=' + encodeURIComponent(myRoom));
      }

      if (msg.type === 'roomState' || msg.type === 'state') {
        players = msg.players || players;
        bullets = msg.bullets || bullets;
        updateBoard();
      }

      if (msg.type === 'respawn') {
        const i = players.findIndex(p => p.id === msg.player.id);
        if (i >= 0) players[i] = msg.player;
        else players.push(msg.player);
        if (msg.player.id === myId) flashMessage('Respawned');
      }

      if (msg.type === 'hit') {
        for (let i = 0; i < 10; i++) {
          effects.push({
            type: 'splat',
            x: msg.x,
            y: msg.y,
            vx: (Math.random()-0.5)*3,
            vy: (Math.random()-0.5)*3,
            life: 20 + Math.random()*10,
            color: '#FF5577'
          });
        }
      }

      if (msg.type === 'died') {
        if (msg.victimId === myId) flashMessage('You died');
      }

      if (msg.type === 'playerLeft') {
        players = players.filter(p => p.id !== msg.id);
        updateBoard();
      }

      if (msg.type === 'errorMessage') {
        setStatus(msg.message || 'Server error');
        flashMessage(msg.message || 'Error');
      }
    });
  }

  connect();

  function send(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(data));
  }

  function getName() {
    const n = (nameInput.value || 'Player').trim().slice(0, 16);
    localStorage.setItem('mp_name', n);
    return n || 'Player';
  }

  createBtn.onclick = () => {
    connect();
    send({ type: 'createRoom', name: getName() });
  };

  joinBtn.onclick = () => {
    const code = roomInput.value.trim().toUpperCase();
    if (!code) return setStatus('Enter a room code first.');
    connect();
    send({ type: 'joinRoom', roomCode: code, name: getName() });
  };

  leaveBtn.onclick = () => {
    if (ws) ws.close();
    myId = null;
    myRoom = null;
    players = [];
    bullets = [];
    roomCodeLabel.textContent = '------';
    history.replaceState({}, '', '/');
    flashMessage('Left room');
  };

  copyBtn.onclick = async () => {
    if (!myRoom) return setStatus('No room yet.');
    const url = location.origin + '/?room=' + encodeURIComponent(myRoom);
    try {
      await navigator.clipboard.writeText(url);
      flashMessage('Invite copied');
    } catch {
      setStatus(url);
    }
  };

  document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
  document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  canvas.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', () => mouse.down = true);
  window.addEventListener('mouseup', () => mouse.down = false);

  function me() {
    return players.find(p => p.id === myId);
  }

  function updateBoard() {
    const sorted = [...players].sort((a,b) => (b.kills - a.kills) || (a.deaths - b.deaths));
    scoreboard.innerHTML = sorted.map(p => {
      const isMe = p.id === myId;
      return '<div class="entry">' +
        '<span style="color:' + p.color + ';font-weight:700">' + (isMe ? 'You' : escapeHtml(p.name)) + '</span>' +
        '<span>' + p.kills + ' / ' + p.deaths + ' · ' + p.hp + 'hp</span>' +
      '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&','&')
      .replaceAll('<','<')
      .replaceAll('>','>')
      .replaceAll('"','"');
  }

  function worldToScreen(x, y) {
    return {
      x: x - camera.x + window.innerWidth / 2,
      y: y - camera.y + window.innerHeight / 2
    };
  }

  function screenToWorld(x, y) {
    return {
      x: x + camera.x - window.innerWidth / 2,
      y: y + camera.y - window.innerHeight / 2
    };
  }

  function shoot() {
    const p = me();
    if (!p || !p.alive || !myRoom) return;
    const now = performance.now();
    if (now - lastShot < 180) return;
    lastShot = now;

    const target = screenToWorld(mouse.x, mouse.y);
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const dirx = dx / len;
    const diry = dy / len;

    send({
      type: 'shoot',
      x: p.x + dirx * 24,
      y: p.y + diry * 24,
      vx: dirx * 10,
      vy: diry * 10
    });

    for (let i = 0; i < 8; i++) {
      effects.push({
        type: 'muzzle',
        x: p.x + dirx * 22,
        y: p.y + diry * 22,
        vx: dirx * (1 + Math.random()*2) + (Math.random()-0.5)*2,
        vy: diry * (1 + Math.random()*2) + (Math.random()-0.5)*2,
        life: 10 + Math.random()*6,
        color: '#00F5FF'
      });
    }
  }

  function updateInput() {
    const p = me();
    if (!p || !p.alive) return;

    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;

    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;

    const aim = screenToWorld(mouse.x, mouse.y);
    const angle = Math.atan2(aim.y - p.y, aim.x - p.x);

    send({
      type: 'input',
      mx, my, angle
    });

    if (mouse.down) shoot();
  }

  function drawGrid() {
    const step = 80;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    const startX = -((camera.x - window.innerWidth/2) % step);
    const startY = -((camera.y - window.innerHeight/2) % step);

    for (let x = startX; x < window.innerWidth; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, window.innerHeight);
      ctx.stroke();
    }

    for (let y = startY; y < window.innerHeight; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(window.innerWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldBounds() {
    const a = worldToScreen(0, 0);
    const b = worldToScreen(WORLD.w, WORLD.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  function drawPlayers() {
    for (const p of players) {
      const s = worldToScreen(p.x, p.y);

      ctx.save();
      ctx.translate(s.x, s.y);

      const isMe = p.id === myId;

      ctx.globalAlpha = p.alive ? 1 : 0.35;

      ctx.shadowBlur = 18;
      ctx.shadowColor = p.color;

      // body
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // gun
      ctx.rotate(p.angle || 0);
      ctx.fillStyle = '#dffcff';
      ctx.fillRect(6, -4, 20, 8);

      ctx.restore();

      // hp bar
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(s.x - 22, s.y - 34, 44, 6);
      ctx.fillStyle = p.hp > 40 ? '#57FFA3' : '#FF5577';
      ctx.fillRect(s.x - 22, s.y - 34, 44 * (p.hp / 100), 6);

      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? '#00F5FF' : '#ffffff';
      ctx.fillText(isMe ? 'YOU' : p.name, s.x, s.y - 42);
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      const s = worldToScreen(b.x, b.y);
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#FF00E5';
      ctx.fillStyle = '#FF00E5';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const fx of effects) {
      fx.x += fx.vx;
      fx.y += fx.vy;
      fx.life -= 1;
      const s = worldToScreen(fx.x, fx.y);

      ctx.save();
      ctx.globalAlpha = Math.max(0, fx.life / 18);
      ctx.shadowBlur = 18;
      ctx.shadowColor = fx.color;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, fx.type === 'muzzle' ? 3 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    effects = effects.filter(f => f.life > 0);
  }

  function drawMinHud() {
    const p = me();
    if (!p) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(20, window.innerHeight - 42, 220, 16);
    ctx.fillStyle = p.hp > 40 ? '#57FFA3' : '#FF5577';
    ctx.fillRect(20, window.innerHeight - 42, 220 * (p.hp / 100), 16);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.strokeRect(20, window.innerHeight - 42, 220, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText('HP ' + p.hp, 24, window.innerHeight - 48);
    ctx.restore();
  }

  function loop() {
    requestAnimationFrame(loop);
    updateInput();

    const p = me();
    if (p) {
      camera.x += (p.x - camera.x) * 0.18;
      camera.y += (p.y - camera.y) * 0.18;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawGrid();
    drawWorldBounds();
    drawBullets();
    drawPlayers();
    drawEffects();
    drawMinHud();
  }
  loop();
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      uptime: process.uptime()
    }));
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  safeSend(ws, { type: 'hello', message: 'connected' });

  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'createRoom') {
      removeClientFromRoom(ws);
      createAndJoinRoom(ws, msg.name || 'Player');
      return;
    }

    if (msg.type === 'joinRoom') {
      removeClientFromRoom(ws);
      const code = String(msg.roomCode || '').toUpperCase();
      joinRoom(ws, code, msg.name || 'Player');
      return;
    }

    const info = clients.get(ws);
    if (!info) return;

    const room = rooms.get(info.roomCode);
    if (!room) return;

    const player = room.players[info.id];
    if (!player) return;

    if (msg.type === 'input') {
      if (!player.alive) return;

      const speed = 4;
      const mx = clamp(Number(msg.mx) || 0, -1, 1);
      const my = clamp(Number(msg.my) || 0, -1, 1);

      player.vx = mx * speed;
      player.vy = my * speed;
      player.x = clamp(player.x + player.vx, 18, 1200 - 18);
      player.y = clamp(player.y + player.vy, 18, 800 - 18);
      player.angle = Number(msg.angle) || 0;
      return;
    }

    if (msg.type === 'shoot') {
      if (!player.alive) return;

      room.lastBulletId += 1;
      room.bullets.push({
        id: room.lastBulletId,
        ownerId: player.id,
        x: Number(msg.x) || player.x,
        y: Number(msg.y) || player.y,
        vx: clamp(Number(msg.vx) || 0, -20, 20),
        vy: clamp(Number(msg.vy) || 0, -20, 20),
        life: 70
      });
      return;
    }
  });

  ws.on('close', () => {
    removeClientFromRoom(ws);
  });

  ws.on('error', () => {
    removeClientFromRoom(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});
