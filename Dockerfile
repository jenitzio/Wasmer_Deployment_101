FROM node:20-alpine

WORKDIR /app

RUN npm init -y && npm install ws

RUN cat > /app/server.js <<'EOF'
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const clients = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[(Math.random() * chars.length) | 0];
  return code;
}

function randomSpawn() {
  return {
    x: 120 + Math.random() * 960,
    y: 120 + Math.random() * 560
  };
}

function createRoom() {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  const room = {
    code,
    players: new Map(),
    bullets: [],
    lastBulletId: 1
  };
  rooms.set(code, room);
  return room;
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function roomState(room) {
  return {
    type: 'state',
    roomCode: room.code,
    players: Array.from(room.players.values()),
    bullets: room.bullets
  };
}

function broadcastRoom(room, obj) {
  for (const player of room.players.values()) {
    const ws = clients.get(player.id);
    if (ws) safeSend(ws, obj);
  }
}

function broadcastState(room) {
  const state = roomState(room);
  broadcastRoom(room, state);
}

function cleanupRoomIfEmpty(room) {
  if (room.players.size === 0) rooms.delete(room.code);
}

function removePlayer(playerId) {
  const ws = clients.get(playerId);
  clients.delete(playerId);

  for (const room of rooms.values()) {
    if (room.players.has(playerId)) {
      room.players.delete(playerId);
      broadcastRoom(room, { type: 'player_left', id: playerId });
      broadcastState(room);
      cleanupRoomIfEmpty(room);
      break;
    }
  }
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>Wasmer Multiplayer Shooter</title>
<style>
  :root{
    --bg:#0A0A0B;
    --panel:rgba(255,255,255,.09);
    --panel2:rgba(255,255,255,.06);
    --border:rgba(255,255,255,.16);
    --text:#F3F7FA;
    --muted:#A8B3C2;
    --cyan:#00F5FF;
    --magenta:#FF00E5;
    --green:#4CFF88;
    --red:#FF5A7A;
    --yellow:#FFD166;
  }
  *{box-sizing:border-box}
  html,body{
    margin:0;
    width:100%;
    height:100%;
    background:radial-gradient(circle at top, #13131a 0%, var(--bg) 55%);
    color:var(--text);
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    overflow:hidden;
  }
  #app{
    position:fixed;
    inset:0;
  }
  canvas{
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    display:block;
  }
  .hud{
    position:fixed;
    left:16px;
    right:16px;
    top:16px;
    display:flex;
    gap:12px;
    justify-content:space-between;
    align-items:flex-start;
    pointer-events:none;
  }
  .panel{
    pointer-events:auto;
    background:var(--panel);
    border:1px solid var(--border);
    backdrop-filter: blur(18px) saturate(180%);
    -webkit-backdrop-filter: blur(18px) saturate(180%);
    box-shadow:0 8px 32px rgba(0,0,0,.28);
    border-radius:18px;
    padding:12px 14px;
  }
  .leftCol,.rightCol{
    display:flex;
    gap:12px;
    align-items:flex-start;
  }
  .stack{display:flex;flex-direction:column;gap:10px}
  .title{
    font-size:14px;
    font-weight:700;
    letter-spacing:.08em;
    text-transform:uppercase;
    color:var(--cyan);
    text-shadow:0 0 12px rgba(0,245,255,.25);
    margin-bottom:8px;
  }
  .muted{color:var(--muted);font-size:13px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input,button{
    border:none;
    outline:none;
    border-radius:12px;
    padding:10px 12px;
    font-size:14px;
  }
  input{
    background:rgba(255,255,255,.08);
    color:var(--text);
    border:1px solid rgba(255,255,255,.1);
    min-width:130px;
  }
  button{
    cursor:pointer;
    color:#001317;
    background:linear-gradient(135deg,var(--cyan),#8efbff);
    font-weight:700;
  }
  button.alt{
    color:var(--text);
    background:rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.12);
  }
  button.mag{
    color:white;
    background:linear-gradient(135deg,var(--magenta),#ff6bf1);
  }
  .pill{
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding:8px 10px;
    border-radius:999px;
    background:var(--panel2);
    border:1px solid rgba(255,255,255,.08);
    font-size:13px;
  }
  .dot{
    width:10px;
    height:10px;
    border-radius:50%;
    background:#666;
    box-shadow:0 0 10px rgba(255,255,255,.15);
  }
  .dot.ok{background:var(--green); box-shadow:0 0 14px rgba(76,255,136,.55)}
  .dot.bad{background:var(--red); box-shadow:0 0 14px rgba(255,90,122,.45)}
  .gameInfo{
    position:fixed;
    left:16px;
    bottom:16px;
    display:flex;
    gap:12px;
    flex-wrap:wrap;
  }
  .banner{
    position:fixed;
    left:50%;
    transform:translateX(-50%);
    top:16px;
    padding:10px 16px;
    border-radius:999px;
    background:rgba(0,245,255,.12);
    border:1px solid rgba(0,245,255,.28);
    color:var(--text);
    backdrop-filter: blur(14px);
    font-size:14px;
    display:none;
  }
  .centerCard{
    position:fixed;
    left:50%;
    top:50%;
    transform:translate(-50%,-50%);
    width:min(92vw,460px);
    padding:18px;
  }
  .hidden{display:none !important}
  .kbd{
    padding:3px 7px;
    border-radius:8px;
    background:rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.1);
    font-size:12px;
    color:var(--muted);
  }
  .sep{height:1px;background:rgba(255,255,255,.08);margin:10px 0}
  .small{font-size:12px}
  .hpbar{
    width:140px;height:10px;border-radius:999px;overflow:hidden;
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);
  }
  .hpfill{height:100%;background:linear-gradient(90deg,var(--green),#b2ffcb);width:100%}
  @media (max-width: 760px){
    .hud{flex-direction:column;align-items:stretch}
    .leftCol,.rightCol{justify-content:space-between}
  }
</style>
</head>
<body>
<div id="app">
  <canvas id="game"></canvas>

  <div id="banner" class="banner"></div>

  <div class="hud">
    <div class="leftCol">
      <div class="panel stack" id="connectPanel">
        <div class="title">Lobby</div>
        <div class="row">
          <input id="nameInput" maxlength="16" placeholder="Your name" />
        </div>
        <div class="row">
          <button id="createBtn">Create Room</button>
        </div>
        <div class="row">
          <input id="roomInput" maxlength="6" placeholder="Room code" />
          <button id="joinBtn" class="mag">Join</button>
        </div>
        <div class="muted small">Open in two tabs or share the room code with friends.</div>
      </div>

      <div class="panel stack hidden" id="roomPanel">
        <div class="title">Room</div>
        <div class="row">
          <div class="pill">Code: <strong id="roomCodeText">------</strong></div>
          <button id="copyBtn" class="alt">Copy Code</button>
        </div>
        <div class="row">
          <button id="leaveBtn" class="alt">Leave Room</button>
        </div>
      </div>
    </div>

    <div class="rightCol">
      <div class="panel stack">
        <div class="row">
          <div class="pill"><span id="statusDot" class="dot bad"></span><span id="statusText">Disconnected</span></div>
          <div class="pill">Players: <strong id="playersCount">0</strong></div>
        </div>
        <div class="row">
          <div class="pill">HP</div>
          <div class="hpbar"><div class="hpfill" id="hpFill"></div></div>
          <div class="pill"><strong id="hpText">100</strong></div>
        </div>
      </div>
    </div>
  </div>

  <div class="gameInfo">
    <div class="panel small muted">
      Move: <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span>
      &nbsp; Aim: <span class="kbd">Mouse</span>
      &nbsp; Shoot: <span class="kbd">Click</span>
    </div>
  </div>
</div>

<script>
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const copyBtn = document.getElementById('copyBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const roomCodeText = document.getElementById('roomCodeText');
  const roomPanel = document.getElementById('roomPanel');
  const connectPanel = document.getElementById('connectPanel');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const playersCount = document.getElementById('playersCount');
  const hpFill = document.getElementById('hpFill');
  const hpText = document.getElementById('hpText');
  const banner = document.getElementById('banner');

  let W = innerWidth;
  let H = innerHeight;
  let dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
  function resize() {
    W = innerWidth; H = innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize, { passive:true });
  resize();

  let ws = null;
  let connected = false;
  let myId = null;
  let roomCode = null;
  let myName = localStorage.getItem('mp_name') || ('Player' + Math.floor(Math.random()*999));
  nameInput.value = myName;

  const state = {
    players: new Map(),
    bullets: [],
    impacts: [],
    muzzle: [],
    stars: Array.from({length:70}, () => ({
      x: Math.random()*1200,
      y: Math.random()*800,
      r: Math.random()*2+0.5,
      s: Math.random()*0.3+0.05
    }))
  };

  const me = {
    x: 300, y: 250, r: 16, angle: 0,
    speed: 240, hp: 100, alive: true,
    color: '#00F5FF'
  };

  const keys = new Set();
  let mouseX = W/2, mouseY = H/2, mouseDown = false;
  let lastShot = 0;

  function toast(msg) {
    banner.textContent = msg;
    banner.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => banner.style.display = 'none', 1700);
  }

  function setStatus(ok, text) {
    connected = ok;
    statusDot.className = 'dot ' + (ok ? 'ok' : 'bad');
    statusText.textContent = text;
  }

  function updateHud() {
    playersCount.textContent = String(state.players.size);
    const hp = state.players.get(myId)?.hp ?? me.hp ?? 100;
    hpText.textContent = String(Math.max(0, Math.round(hp)));
    hpFill.style.width = Math.max(0, Math.min(100, hp)) + '%';
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }

  function connectSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      setStatus(true, 'Connected');
    };

    ws.onclose = () => {
      setStatus(false, 'Disconnected');
      roomCode = null;
      roomPanel.classList.add('hidden');
      connectPanel.classList.remove('hidden');
    };

    ws.onerror = () => {
      setStatus(false, 'Socket Error');
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'welcome') {
        myId = msg.id;
        return;
      }

      if (msg.type === 'room_created') {
        roomCode = msg.roomCode;
        roomCodeText.textContent = roomCode;
        roomPanel.classList.remove('hidden');
        connectPanel.classList.add('hidden');
        toast('Room created: ' + roomCode);
        return;
      }

      if (msg.type === 'joined') {
        roomCode = msg.roomCode;
        roomCodeText.textContent = roomCode;
        roomPanel.classList.remove('hidden');
        connectPanel.classList.add('hidden');
        toast('Joined room ' + roomCode);
        return;
      }

      if (msg.type === 'error') {
        toast(msg.message || 'Error');
        return;
      }

      if (msg.type === 'state') {
        state.players.clear();
        for (const p of msg.players) {
          state.players.set(p.id, p);
          if (p.id === myId) {
            me.x = p.x;
            me.y = p.y;
            me.hp = p.hp;
            me.alive = p.alive;
            me.angle = p.angle || me.angle;
          }
        }
        state.bullets = msg.bullets || [];
        updateHud();
        return;
      }

      if (msg.type === 'player_left') {
        state.players.delete(msg.id);
        updateHud();
      }
    };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  createBtn.onclick = () => {
    myName = (nameInput.value || 'Player').trim().slice(0,16) || 'Player';
    localStorage.setItem('mp_name', myName);
    connectSocket();
    const wait = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        send({ type:'create_room', name: myName });
      } else {
        setTimeout(wait, 80);
      }
    };
    wait();
  };

  joinBtn.onclick = () => {
    const code = (roomInput.value || '').trim().toUpperCase();
    if (!code) return toast('Enter a room code');
    myName = (nameInput.value || 'Player').trim().slice(0,16) || 'Player';
    localStorage.setItem('mp_name', myName);
    connectSocket();
    const wait = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        send({ type:'join_room', roomCode: code, name: myName });
      } else {
        setTimeout(wait, 80);
      }
    };
    wait();
  };

  copyBtn.onclick = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      toast('Copied: ' + roomCode);
    } catch {
      toast('Room code: ' + roomCode);
    }
  };

  leaveBtn.onclick = () => {
    if (ws) ws.close();
    state.players.clear();
    state.bullets = [];
    updateHud();
    toast('Left room');
  };

  addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive:true });
  addEventListener('mousedown', () => mouseDown = true);
  addEventListener('mouseup', () => mouseDown = false);

  function spawnMuzzle(x,y,a,color) {
    for (let i=0;i<6;i++) {
      state.muzzle.push({
        x,y,
        vx: Math.cos(a)*(90+Math.random()*90) + (Math.random()-0.5)*50,
        vy: Math.sin(a)*(90+Math.random()*90) + (Math.random()-0.5)*50,
        life: 0.08 + Math.random()*0.08,
        t: 0,
        color
      });
    }
  }

  function spawnImpact(x,y,color) {
    for (let i=0;i<8;i++) {
      state.impacts.push({
        x,y,
        vx:(Math.random()-0.5)*180,
        vy:(Math.random()-0.5)*180,
        life:0.25 + Math.random()*0.35,
        t:0,
        color
      });
    }
  }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  let lastTime = performance.now();
  let netAccum = 0;

  function update(dt) {
    for (const s of state.stars) {
      s.y += s.s * 20 * dt;
      if (s.y > 900) s.y = -10;
    }

    const dx = mouseX - me.x;
    const dy = mouseY - me.y;
    me.angle = Math.atan2(dy, dx);

    let mx = 0, my = 0;
    if (keys.has('w')) my -= 1;
    if (keys.has('s')) my += 1;
    if (keys.has('a')) mx -= 1;
    if (keys.has('d')) mx += 1;
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;

    if (me.alive) {
      me.x = clamp(me.x + mx * me.speed * dt, 24, 1176);
      me.y = clamp(me.y + my * me.speed * dt, 24, 776);
    }

    if (mouseDown && roomCode && connected && me.alive) {
      const now = performance.now();
      if (now - lastShot > 160) {
        lastShot = now;
        spawnMuzzle(me.x + Math.cos(me.angle)*18, me.y + Math.sin(me.angle)*18, me.angle, '#00F5FF');
        send({ type:'shoot', angle: me.angle });
      }
    }

    netAccum += dt;
    if (netAccum >= 1/20 && roomCode && connected) {
      netAccum = 0;
      send({
        type:'move',
        x: me.x,
        y: me.y,
        angle: me.angle
      });
    }

    for (let i = state.muzzle.length - 1; i >= 0; i--) {
      const p = state.muzzle[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t >= p.life) state.muzzle.splice(i,1);
    }

    for (let i = state.impacts.length - 1; i >= 0; i--) {
      const p = state.impacts[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.t >= p.life) state.impacts.splice(i,1);
    }

    // local bullet impact prediction visuals
    for (const b of state.bullets) {
      if (b.x < 10 || b.y < 10 || b.x > 1190 || b.y > 790) {
        if (!b._hitFX) {
          b._hitFX = true;
          spawnImpact(b.x, b.y, b.color || '#FF00E5');
        }
      }
    }

    updateHud();
  }

  function worldToScreen(x, y) {
    const cx = me.x - W / 2;
    const cy = me.y - H / 2;
    return { x: x - cx, y: y - cy };
  }

  function drawGrid() {
    const cx = me.x - W / 2;
    const cy = me.y - H / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;

    const grid = 64;
    const startX = -((cx % grid) + grid) % grid;
    const startY = -((cy % grid) + grid) % grid;

    for (let x = startX; x < W; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = startY; y < H; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorldBounds() {
    const corners = [
      worldToScreen(0,0),
      worldToScreen(1200,0),
      worldToScreen(1200,800),
      worldToScreen(0,800)
    ];
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(p, isMe) {
    const s = worldToScreen(p.x, p.y);
    const color = isMe ? '#00F5FF' : '#FF00E5';

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(p.angle || 0);

    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(8, -4, 20, 8);

    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText((p.name || 'Player') + (isMe ? ' (You)' : ''), s.x, s.y - 24);

    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(s.x - 18, s.y + 22, 36, 5);
    ctx.fillStyle = p.hp > 35 ? '#4CFF88' : '#FF5A7A';
    ctx.fillRect(s.x - 18, s.y + 22, Math.max(0, 36 * (p.hp/100)), 5);
    ctx.restore();
  }

  function drawBullets() {
    for (const b of state.bullets) {
      const s = worldToScreen(b.x, b.y);
      ctx.save();
      ctx.fillStyle = b.color || '#FFD166';
      ctx.shadowBlur = 12;
      ctx.shadowColor = b.color || '#FFD166';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(list, size) {
    for (const p of list) {
      const s = worldToScreen(p.x, p.y);
      const a = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0,0,W,H);

    // ambient stars
    ctx.save();
    for (const st of state.stars) {
      const sx = (st.x - me.x * 0.08 + W * 0.5) % (W + 20);
      const sy = (st.y - me.y * 0.08 + H * 0.5) % (H + 20);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#8cecff';
      ctx.beginPath();
      ctx.arc(sx, sy, st.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    drawGrid();
    drawWorldBounds();
    drawBullets();

    for (const p of state.players.values()) {
      if (p.alive) drawPlayer(p, p.id === myId);
    }

    drawParticles(state.muzzle, 2.5);
    drawParticles(state.impacts, 3.5);
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // auto-fill room code from URL
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) roomInput.value = roomParam.toUpperCase();

  connectSocket();
})();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});

function spawnPlayer(id, name) {
  const sp = randomSpawn();
  return {
    id,
    name: (name || 'Player').slice(0, 16),
    x: sp.x,
    y: sp.y,
    angle: 0,
    hp: 100,
    alive: true
  };
}

function getPlayerRoom(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function stepBullets() {
  for (const room of rooms.values()) {
    const next = [];
    for (const b of room.bullets) {
      b.x += b.vx * 0.05;
      b.y += b.vy * 0.05;
      b.life -= 0.05;

      let hit = false;

      if (b.x < 0 || b.y < 0 || b.x > 1200 || b.y > 800 || b.life <= 0) {
        hit = true;
      }

      if (!hit) {
        for (const p of room.players.values()) {
          if (!p.alive || p.id === b.ownerId) continue;
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          if (dx * dx + dy * dy <= 20 * 20) {
            p.hp -= 20;
            if (p.hp <= 0) {
              p.hp = 0;
              p.alive = false;
              setTimeout(() => {
                const r = rooms.get(room.code);
                if (!r) return;
                const target = r.players.get(p.id);
                if (!target) return;
                const sp = randomSpawn();
                target.x = sp.x;
                target.y = sp.y;
                target.hp = 100;
                target.alive = true;
                broadcastState(r);
              }, 2000);
            }
            hit = true;
            break;
          }
        }
      }

      if (!hit) next.push(b);
    }
    room.bullets = next;
  }

  for (const room of rooms.values()) {
    if (room.players.size > 0) broadcastState(room);
  }
}

setInterval(stepBullets, 50);

wss.on('connection', (ws) => {
  const id = makeId();
  clients.set(id, ws);
  safeSend(ws, { type: 'welcome', id });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'create_room') {
      const room = createRoom();
      const player = spawnPlayer(id, msg.name);
      room.players.set(id, player);
      safeSend(ws, { type: 'room_created', roomCode: room.code });
      safeSend(ws, { type: 'joined', roomCode: room.code });
      broadcastState(room);
      return;
    }

    if (msg.type === 'join_room') {
      const code = String(msg.roomCode || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        safeSend(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.players.has(id)) {
        safeSend(ws, { type: 'joined', roomCode: room.code });
        broadcastState(room);
        return;
      }
      const player = spawnPlayer(id, msg.name);
      room.players.set(id, player);
      safeSend(ws, { type: 'joined', roomCode: room.code });
      broadcastState(room);
      return;
    }

    const room = getPlayerRoom(id);
    if (!room) return;
    const player = room.players.get(id);
    if (!player) return;

    if (msg.type === 'move') {
      player.x = Math.max(16, Math.min(1184, Number(msg.x) || player.x));
      player.y = Math.max(16, Math.min(784, Number(msg.y) || player.y));
      player.angle = Number(msg.angle) || 0;
      return;
    }

    if (msg.type === 'shoot') {
      if (!player.alive) return;
      const angle = Number(msg.angle) || 0;
      room.bullets.push({
        id: room.lastBulletId++,
        ownerId: id,
        x: player.x + Math.cos(angle) * 22,
        y: player.y + Math.sin(angle) * 22,
        vx: Math.cos(angle) * 540,
        vy: Math.sin(angle) * 540,
        life: 1.6,
        color: player.id === id ? '#FFD166' : '#FF00E5'
      });
      return;
    }
  });

  ws.on('close', () => {
    removePlayer(id);
  });

  ws.on('error', () => {
    removePlayer(id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on port', PORT);
});
EOF

EXPOSE 3000

CMD ["node", "/app/server.js"]
