const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const rooms = new Map();
const clients = new Map();

function makeId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function createRoom(code) {
  return {
    code,
    players: new Map(),
    bullets: [],
    lastBulletId: 1
  };
}

function serializePlayers(room) {
  const arr = [];
  for (const p of room.players.values()) {
    arr.push({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      a: p.a,
      hp: p.hp,
      color: p.color
    });
  }
  return arr;
}

function broadcastRoom(room, data, exceptWs = null) {
  const raw = JSON.stringify(data);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === WebSocket.OPEN && p.ws !== exceptWs) {
      p.ws.send(raw);
    }
  }
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getRoomByCode(code) {
  return rooms.get(String(code || '').toUpperCase());
}

function randomSpawn() {
  return {
    x: 200 + Math.random() * 800,
    y: 150 + Math.random() * 500
  };
}

function randomColor() {
  const colors = ['#00F5FF', '#FF00E5', '#7CFF6B', '#FFD166', '#8EA8FF'];
  return colors[Math.floor(Math.random() * colors.length)];
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Wasmer Multiplayer Shooter</title>
  <style>
    :root {
      --bg: #0A0A0B;
      --panel: rgba(255,255,255,0.10);
      --panel2: rgba(255,255,255,0.08);
      --line: rgba(255,255,255,0.18);
      --text: #F3F7FA;
      --muted: rgba(255,255,255,0.72);
      --cyan: #00F5FF;
      --magenta: #FF00E5;
      --green: #7CFF6B;
      --red: #FF5A7A;
      --yellow: #FFD166;
      --shadow: 0 18px 60px rgba(0,0,0,0.45);
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at top left, rgba(0,245,255,0.10), transparent 28%),
        radial-gradient(circle at top right, rgba(255,0,229,0.08), transparent 24%),
        linear-gradient(180deg, #111214 0%, #0A0A0B 100%);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, Arial, sans-serif;
    }

    #bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    #game {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      z-index: 1;
    }

    .ui {
      position: fixed;
      z-index: 2;
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08));
      border: 1px solid rgba(255,255,255,0.16);
      box-shadow: var(--shadow);
      border-radius: 18px;
    }

    #menu {
      width: min(420px, calc(100vw - 24px));
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      padding: 18px;
    }

    #hud {
      top: 12px;
      left: 12px;
      right: 12px;
      display: none;
      padding: 10px 12px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin: 0 0 8px 0;
    }

    .sub {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 14px;
      line-height: 1.4;
    }

    .label {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 6px;
      display: block;
    }

    input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      outline: none;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.07);
      color: white;
      font-size: 15px;
      margin-bottom: 12px;
    }

    input::placeholder { color: rgba(255,255,255,0.45); }

    button {
      border: 0;
      outline: 0;
      cursor: pointer;
      color: #071014;
      font-weight: 800;
      padding: 12px 14px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--cyan), #7ff8ff);
      box-shadow: 0 0 24px rgba(0,245,255,0.22);
    }

    button.alt {
      color: white;
      background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.08));
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: none;
    }

    .full { width: 100%; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: white;
      font-size: 14px;
      white-space: nowrap;
    }

    .pill strong { color: var(--cyan); }

    .status {
      position: fixed;
      left: 12px;
      bottom: 12px;
      z-index: 2;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 13px;
      color: white;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.10);
      backdrop-filter: blur(14px);
    }

    .ok { color: var(--green); }
    .bad { color: var(--red); }
    .warn { color: var(--yellow); }

    #help {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2;
      max-width: 340px;
      padding: 10px 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .small {
      font-size: 12px;
      color: var(--muted);
    }

    .error {
      margin-top: 10px;
      color: #ff9db7;
      font-size: 13px;
      min-height: 18px;
    }

    .hidden { display: none !important; }

    @media (max-width: 680px) {
      .split { grid-template-columns: 1fr; }
      #hud {
        flex-direction: column;
        align-items: stretch;
      }
    }
  </style>
</head>
<body>
  <canvas id="bg"></canvas>
  <canvas id="game"></canvas>

  <div id="menu" class="ui">
    <h1 class="title">Multiplayer Shooter</h1>
    <div class="sub">
      Create a room or join with a room code. Open this in two tabs to test quickly.
    </div>

    <label class="label">Your name</label>
    <input id="nameInput" maxlength="16" placeholder="Player name" />

    <div class="split">
      <button id="createBtn">Create Room</button>
      <button id="quickBtn" class="alt">Quick Join Link</button>
    </div>

    <div style="height:10px"></div>

    <label class="label">Room code</label>
    <input id="roomInput" maxlength="8" placeholder="Enter room code" style="text-transform:uppercase" />

    <button id="joinBtn" class="full">Join Room</button>
    <div id="errorText" class="error"></div>
  </div>

  <div id="hud" class="ui">
    <div class="row">
      <div class="pill">Room: <strong id="roomCode">-</strong></div>
      <div class="pill">You: <span id="playerName">-</span></div>
      <div class="pill">HP: <strong id="hpText">100</strong></div>
      <div class="pill">Players: <strong id="playersText">1</strong></div>
    </div>
    <div class="row">
      <button id="copyBtn" class="alt">Copy Invite</button>
      <button id="leaveBtn" class="alt">Leave</button>
    </div>
  </div>

  <div id="status" class="status">Status: <span id="statusText" class="warn">Connecting...</span></div>

  <div id="help" class="ui hidden">
    <div><strong>Controls</strong></div>
    <div>WASD / Arrows = move</div>
    <div>Mouse = aim</div>
    <div>Click = shoot</div>
  </div>

  <script>
    (() => {
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const WS_URL = wsProtocol + '//' + location.host + '/ws';

      const menu = document.getElementById('menu');
      const hud = document.getElementById('hud');
      const help = document.getElementById('help');
      const statusText = document.getElementById('statusText');
      const errorText = document.getElementById('errorText');

      const nameInput = document.getElementById('nameInput');
      const roomInput = document.getElementById('roomInput');
      const createBtn = document.getElementById('createBtn');
      const joinBtn = document.getElementById('joinBtn');
      const quickBtn = document.getElementById('quickBtn');
      const copyBtn = document.getElementById('copyBtn');
      const leaveBtn = document.getElementById('leaveBtn');

      const roomCodeEl = document.getElementById('roomCode');
      const playerNameEl = document.getElementById('playerName');
      const hpText = document.getElementById('hpText');
      const playersText = document.getElementById('playersText');

      const game = document.getElementById('game');
      const g = game.getContext('2d');
      const bg = document.getElementById('bg');
      const bgc = bg.getContext('2d');

      const state = {
        ws: null,
        connected: false,
        joined: false,
        me: null,
        roomCode: '',
        players: new Map(),
        bullets: [],
        impacts: [],
        flashes: [],
        keys: {},
        mouse: { x: 0, y: 0, down: false },
        worldW: 1400,
        worldH: 900,
        camera: { x: 0, y: 0 },
        lastShotAt: 0,
        shotCooldown: 140,
        lastSendAt: 0,
        sendRate: 1000 / 20,
        bgParticles: []
      };

      function setStatus(text, cls) {
        statusText.textContent = text;
        statusText.className = cls || '';
      }

      function showError(msg) {
        errorText.textContent = msg || '';
      }

      function resize() {
        game.width = innerWidth;
        game.height = innerHeight;
        bg.width = innerWidth;
        bg.height = innerHeight;
      }
      addEventListener('resize', resize);
      resize();

      function initBg() {
        state.bgParticles = [];
        for (let i = 0; i < 42; i++) {
          state.bgParticles.push({
            x: Math.random() * bg.width,
            y: Math.random() * bg.height,
            r: 1 + Math.random() * 2.5,
            vx: -0.2 + Math.random() * 0.4,
            vy: -0.2 + Math.random() * 0.4,
            a: 0.08 + Math.random() * 0.12
          });
        }
      }
      initBg();
      addEventListener('resize', initBg);

      function drawBg() {
        bgc.clearRect(0, 0, bg.width, bg.height);
        for (const p of state.bgParticles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -10) p.x = bg.width + 10;
          if (p.x > bg.width + 10) p.x = -10;
          if (p.y < -10) p.y = bg.height + 10;
          if (p.y > bg.height + 10) p.y = -10;
          bgc.beginPath();
          bgc.fillStyle = 'rgba(255,255,255,' + p.a + ')';
          bgc.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          bgc.fill();
        }
      }

      function connect() {
        setStatus('Connecting...', 'warn');
        const ws = new WebSocket(WS_URL);
        state.ws = ws;

        ws.addEventListener('open', () => {
          state.connected = true;
          setStatus('Connected', 'ok');
        });

        ws.addEventListener('close', () => {
          state.connected = false;
          state.joined = false;
          state.me = null;
          state.players.clear();
          setStatus('Disconnected', 'bad');
          hud.style.display = 'none';
          menu.classList.remove('hidden');
          help.classList.add('hidden');
          setTimeout(() => {
            if (!state.connected) connect();
          }, 1500);
        });

        ws.addEventListener('message', (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }

          if (msg.type === 'hello') {
            setStatus('Connected', 'ok');
          }

          if (msg.type === 'error') {
            showError(msg.message || 'Unknown error');
            return;
          }

          if (msg.type === 'roomCreated') {
            state.roomCode = msg.roomCode;
            roomInput.value = msg.roomCode;
            joinRoom(msg.roomCode);
          }

          if (msg.type === 'joined') {
            showError('');
            state.joined = true;
            state.roomCode = msg.roomCode;
            state.me = msg.playerId;
            roomCodeEl.textContent = msg.roomCode;
            playerNameEl.textContent = msg.name;
            hpText.textContent = '100';
            menu.classList.add('hidden');
            hud.style.display = 'flex';
            help.classList.remove('hidden');

            state.players.clear();
            for (const p of msg.players || []) {
              state.players.set(p.id, { ...p });
            }
            playersText.textContent = String(state.players.size);
            history.replaceState({}, '', '?room=' + encodeURIComponent(msg.roomCode));
          }

          if (msg.type === 'state') {
            state.players.clear();
            for (const p of msg.players || []) {
              state.players.set(p.id, { ...p });
            }
            state.bullets = msg.bullets || [];
            if (state.me && state.players.has(state.me)) {
              hpText.textContent = String(state.players.get(state.me).hp);
            }
            playersText.textContent = String(state.players.size);
          }

          if (msg.type === 'playerJoined') {
            state.players.set(msg.player.id, msg.player);
            playersText.textContent = String(state.players.size);
          }

          if (msg.type === 'playerLeft') {
            state.players.delete(msg.playerId);
            playersText.textContent = String(state.players.size);
          }

          if (msg.type === 'playerUpdate') {
            const p = state.players.get(msg.player.id) || {};
            state.players.set(msg.player.id, { ...p, ...msg.player });
            if (msg.player.id === state.me) {
              hpText.textContent = String(msg.player.hp);
            }
          }

          if (msg.type === 'bulletFired') {
            state.bullets.push(msg.bullet);
            state.flashes.push({
              x: msg.bullet.x,
              y: msg.bullet.y,
              life: 0.08,
              max: 0.08
            });
          }

          if (msg.type === 'bulletRemoved') {
            state.bullets = state.bullets.filter(b => b.id !== msg.bulletId);
            if (typeof msg.x === 'number' && typeof msg.y === 'number') {
              state.impacts.push({
                x: msg.x,
                y: msg.y,
                life: 0.25,
                max: 0.25,
                color: msg.color || '#00F5FF'
              });
            }
          }

          if (msg.type === 'leftRoom') {
            state.joined = false;
            state.roomCode = '';
            state.me = null;
            state.players.clear();
            state.bullets = [];
            hud.style.display = 'none';
            menu.classList.remove('hidden');
            help.classList.add('hidden');
            history.replaceState({}, '', location.pathname);
          }
        });
      }

      function send(msg) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(JSON.stringify(msg));
        }
      }

      function getName() {
        const v = (nameInput.value || '').trim().slice(0, 16);
        return v || 'Player';
      }

      function createRoom() {
        if (!state.connected) return showError('Not connected yet.');
        const name = getName();
        localStorage.setItem('mp_name', name);
        send({ type: 'createRoom', name });
      }

      function joinRoom(code) {
        if (!state.connected) return showError('Not connected yet.');
        code = String(code || '').trim().toUpperCase();
        if (!code) return showError('Please enter a room code.');
        const name = getName();
        localStorage.setItem('mp_name', name);
        send({ type: 'joinRoom', roomCode: code, name });
      }

      function leaveRoom() {
        send({ type: 'leaveRoom' });
      }

      createBtn.addEventListener('click', createRoom);
      joinBtn.addEventListener('click', () => joinRoom(roomInput.value));
      leaveBtn.addEventListener('click', leaveRoom);
      roomInput.addEventListener('input', () => {
        roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      });

      quickBtn.addEventListener('click', async () => {
        const params = new URLSearchParams(location.search);
        const existing = params.get('room') || roomInput.value.trim().toUpperCase();
        if (existing) {
          const url = location.origin + location.pathname + '?room=' + encodeURIComponent(existing);
          try {
            await navigator.clipboard.writeText(url);
            showError('Invite link copied.');
          } catch {
            showError(url);
          }
        } else {
          showError('Create or enter a room first.');
        }
      });

      copyBtn.addEventListener('click', async () => {
        if (!state.roomCode) return;
        const url = location.origin + location.pathname + '?room=' + encodeURIComponent(state.roomCode);
        try {
          await navigator.clipboard.writeText(url);
          showError('Invite link copied.');
        } catch {
          showError(url);
        }
      });

      const savedName = localStorage.getItem('mp_name');
      if (savedName) nameInput.value = savedName;

      const autoRoom = new URLSearchParams(location.search).get('room');
      if (autoRoom) roomInput.value = autoRoom.toUpperCase();

      addEventListener('keydown', e => {
        state.keys[e.key.toLowerCase()] = true;
      });

      addEventListener('keyup', e => {
        state.keys[e.key.toLowerCase()] = false;
      });

      game.addEventListener('mousemove', e => {
        state.mouse.x = e.clientX;
        state.mouse.y = e.clientY;
      });

      game.addEventListener('mousedown', () => state.mouse.down = true);
      addEventListener('mouseup', () => state.mouse.down = false);

      function worldToScreen(x, y) {
        return {
          x: x - state.camera.x,
          y: y - state.camera.y
        };
      }

      function screenToWorld(x, y) {
        return {
          x: x + state.camera.x,
          y: y + state.camera.y
        };
      }

      function updateLocal(now, dt) {
        if (!state.joined || !state.me) return;
        const me = state.players.get(state.me);
        if (!me) return;

        let dx = 0, dy = 0;
        if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
        if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
        if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
        if (state.keys['d'] || state.keys['arrowright']) dx += 1;

        const len = Math.hypot(dx, dy) || 1;
        if (dx || dy) {
          dx /= len;
          dy /= len;
        }

        const speed = 260;
        me.x += dx * speed * dt;
        me.y += dy * speed * dt;
        me.x = Math.max(20, Math.min(state.worldW - 20, me.x));
        me.y = Math.max(20, Math.min(state.worldH - 20, me.y));

        const mw = screenToWorld(state.mouse.x, state.mouse.y);
        me.a = Math.atan2(mw.y - me.y, mw.x - me.x);

        state.camera.x = me.x - game.width / 2;
        state.camera.y = me.y - game.height / 2;
        state.camera.x = Math.max(0, Math.min(state.worldW - game.width, state.camera.x));
        state.camera.y = Math.max(0, Math.min(state.worldH - game.height, state.camera.y));

        if (now - state.lastSendAt >= state.sendRate) {
          state.lastSendAt = now;
          send({
            type: 'input',
            x: me.x,
            y: me.y,
            a: me.a
          });
        }

        if (state.mouse.down && now - state.lastShotAt >= state.shotCooldown && me.hp > 0) {
          state.lastShotAt = now;
          send({
            type: 'shoot',
            x: me.x,
            y: me.y,
            a: me.a
          });
          state.flashes.push({ x: me.x + Math.cos(me.a) * 22, y: me.y + Math.sin(me.a) * 22, life: 0.06, max: 0.06 });
        }

        for (let i = state.impacts.length - 1; i >= 0; i--) {
          state.impacts[i].life -= dt;
          if (state.impacts[i].life <= 0) state.impacts.splice(i, 1);
        }
        for (let i = state.flashes.length - 1; i >= 0; i--) {
          state.flashes[i].life -= dt;
          if (state.flashes[i].life <= 0) state.flashes.splice(i, 1);
        }
      }

      function drawGrid() {
        const size = 80;
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.lineWidth = 1;
        const startX = - (state.camera.x % size);
        const startY = - (state.camera.y % size);

        for (let x = startX; x < game.width; x += size) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, game.height);
          g.stroke();
        }
        for (let y = startY; y < game.height; y += size) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(game.width, y);
          g.stroke();
        }
      }

      function drawWorldBounds() {
        const tl = worldToScreen(0, 0);
        g.strokeStyle = 'rgba(0,245,255,0.18)';
        g.lineWidth = 2;
        g.strokeRect(tl.x, tl.y, state.worldW, state.worldH);
      }

      function drawPlayer(p, isMe) {
        const s = worldToScreen(p.x, p.y);

        g.save();
        g.translate(s.x, s.y);
        g.rotate(p.a || 0);

        g.shadowBlur = 16;
        g.shadowColor = p.color || '#00F5FF';
        g.fillStyle = p.color || '#00F5FF';
        g.beginPath();
        g.arc(0, 0, 16, 0, Math.PI * 2);
        g.fill();

        g.fillStyle = '#d9fbff';
        g.fillRect(8, -4, 20, 8);

        g.restore();

        g.fillStyle = 'rgba(0,0,0,0.38)';
        g.fillRect(s.x - 22, s.y - 30, 44, 6);
        g.fillStyle = '#7CFF6B';
        g.fillRect(s.x - 22, s.y - 30, Math.max(0, (p.hp / 100) * 44), 6);

        g.fillStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.85)';
        g.font = '12px Inter, sans-serif';
        g.textAlign = 'center';
        g.fillText(p.name || 'Player', s.x, s.y - 38);
      }

      function drawBullets() {
        for (const b of state.bullets) {
          const s = worldToScreen(b.x, b.y);
          g.shadowBlur = 12;
          g.shadowColor = '#FF00E5';
          g.fillStyle = '#FF00E5';
          g.beginPath();
          g.arc(s.x, s.y, 4, 0, Math.PI * 2);
          g.fill();
        }
        g.shadowBlur = 0;
      }

      function drawFx() {
        for (const f of state.flashes) {
          const s = worldToScreen(f.x, f.y);
          const a = f.life / f.max;
          g.save();
          g.globalAlpha = a;
          g.fillStyle = '#FFD166';
          g.shadowBlur = 20;
          g.shadowColor = '#FFD166';
          g.beginPath();
          g.arc(s.x, s.y, 10 + (1 - a) * 8, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }

        for (const im of state.impacts) {
          const s = worldToScreen(im.x, im.y);
          const a = im.life / im.max;
          g.save();
          g.globalAlpha = a;
          g.fillStyle = im.color || '#00F5FF';
          for (let i = 0; i < 5; i++) {
            const ang = (Math.PI * 2 * i) / 5;
            g.beginPath();
            g.arc(s.x + Math.cos(ang) * (10 * (1 - a)), s.y + Math.sin(ang) * (10 * (1 - a)), 2.5, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
      }

      function render() {
        g.clearRect(0, 0, game.width, game.height);
        drawGrid();
        drawWorldBounds();
        drawBullets();

        for (const p of state.players.values()) {
          drawPlayer(p, p.id === state.me);
        }

        drawFx();
      }

      let last = performance.now();
      function loop(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        drawBg();
        updateLocal(now, dt);
        render();
        requestAnimationFrame(loop);
      }

      connect();
      requestAnimationFrame(loop);

      if (autoRoom) {
        setTimeout(() => {
          if (state.connected) joinRoom(autoRoom);
        }, 500);
      }
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

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
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

function removePlayerFromRoom(client) {
  if (!client || !client.roomCode || !client.playerId) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  room.players.delete(client.playerId);
  broadcastRoom(room, { type: 'playerLeft', playerId: client.playerId });

  if (room.players.size === 0) {
    rooms.delete(client.roomCode);
  }
}

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  const client = {
    id: clientId,
    ws,
    roomCode: null,
    playerId: null
  };
  clients.set(ws, client);

  send(ws, { type: 'hello', clientId });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'createRoom') {
      let code;
      do { code = makeId(6); } while (rooms.has(code));
      rooms.set(code, createRoom(code));
      send(ws, { type: 'roomCreated', roomCode: code });
      return;
    }

    if (msg.type === 'joinRoom') {
      const roomCode = String(msg.roomCode || '').toUpperCase();
      const name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
      const room = getRoomByCode(roomCode);

      if (!room) {
        send(ws, { type: 'error', message: 'Room not found.' });
        return;
      }

      if (client.roomCode) {
        removePlayerFromRoom(client);
      }

      const spawn = randomSpawn();
      const playerId = crypto.randomUUID();
      const player = {
        id: playerId,
        ws,
        name,
        x: spawn.x,
        y: spawn.y,
        a: 0,
        hp: 100,
        color: randomColor()
      };

      client.roomCode = roomCode;
      client.playerId = playerId;
      room.players.set(playerId, player);

      send(ws, {
        type: 'joined',
        roomCode,
        playerId,
        name,
        players: serializePlayers(room)
      });

      broadcastRoom(room, {
        type: 'playerJoined',
        player: {
          id: player.id,
          name: player.name,
          x: player.x,
          y: player.y,
          a: player.a,
          hp: player.hp,
          color: player.color
        }
      }, ws);

      send(ws, {
        type: 'state',
        players: serializePlayers(room),
        bullets: room.bullets
      });

      return;
    }

    if (msg.type === 'leaveRoom') {
      removePlayerFromRoom(client);
      client.roomCode = null;
      client.playerId = null;
      send(ws, { type: 'leftRoom' });
      return;
    }

    if (!client.roomCode || !client.playerId) return;
    const room = rooms.get(client.roomCode);
    if (!room) return;
    const player = room.players.get(client.playerId);
    if (!player) return;

    if (msg.type === 'input') {
      player.x = clamp(Number(msg.x) || player.x, 20, 1380);
      player.y = clamp(Number(msg.y) || player.y, 20, 880);
      player.a = Number(msg.a) || 0;

      broadcastRoom(room, {
        type: 'playerUpdate',
        player: {
          id: player.id,
          x: player.x,
          y: player.y,
          a: player.a,
          hp: player.hp,
          color: player.color,
          name: player.name
        }
      }, ws);
      return;
    }

    if (msg.type === 'shoot') {
      if (player.hp <= 0) return;

      const a = Number(msg.a) || 0;
      const bullet = {
        id: room.lastBulletId++,
        ownerId: player.id,
        x: clamp(Number(msg.x) || player.x, 20, 1380),
        y: clamp(Number(msg.y) || player.y, 20, 880),
        vx: Math.cos(a) * 720,
        vy: Math.sin(a) * 720,
        ttl: 1.2
      };
      room.bullets.push(bullet);
      broadcastRoom(room, { type: 'bulletFired', bullet });
      return;
    }
  });

  ws.on('close', () => {
    removePlayerFromRoom(client);
    clients.delete(ws);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    const dt = 1 / 30;

    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const b = room.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;

      let removed = false;

      if (b.x < 0 || b.y < 0 || b.x > 1400 || b.y > 900 || b.ttl <= 0) {
        broadcastRoom(room, {
          type: 'bulletRemoved',
          bulletId: b.id,
          x: b.x,
          y: b.y,
          color: '#00F5FF'
        });
        room.bullets.splice(i, 1);
        continue;
      }

      for (const p of room.players.values()) {
        if (p.id === b.ownerId || p.hp <= 0) continue;
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 18) {
          p.hp = Math.max(0, p.hp - 20);

          broadcastRoom(room, {
            type: 'playerUpdate',
            player: {
              id: p.id,
              x: p.x,
              y: p.y,
              a: p.a,
              hp: p.hp,
              color: p.color,
              name: p.name
            }
          });

          broadcastRoom(room, {
            type: 'bulletRemoved',
            bulletId: b.id,
            x: b.x,
            y: b.y,
            color: '#FF00E5'
          });

          room.bullets.splice(i, 1);
          removed = true;

          if (p.hp <= 0) {
            setTimeout(() => {
              const currentRoom = rooms.get(room.code);
              if (!currentRoom) return;
              const rp = currentRoom.players.get(p.id);
              if (!rp) return;
              const spawn = randomSpawn();
              rp.x = spawn.x;
              rp.y = spawn.y;
              rp.hp = 100;
              broadcastRoom(currentRoom, {
                type: 'playerUpdate',
                player: {
                  id: rp.id,
                  x: rp.x,
                  y: rp.y,
                  a: rp.a,
                  hp: rp.hp,
                  color: rp.color,
                  name: rp.name
                }
              });
            }, 1800);
          }

          break;
        }
      }

      if (removed) continue;
    }

    const players = serializePlayers(room);
    const bullets = room.bullets.map(b => ({
      id: b.id,
      ownerId: b.ownerId,
      x: b.x,
      y: b.y
    }));

    broadcastRoom(room, {
      type: 'state',
      players,
      bullets
    });
  }
}, 1000 / 15);

server.listen(PORT, HOST, () => {
  console.log(\`Server listening on http://\${HOST}:\${PORT}\`);
});