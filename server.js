const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ['websocket', 'polling'],
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 3000;
const TICK_RATE = 45;
const ARENA_SIZE = 40;
const HALF_ARENA = ARENA_SIZE / 2;
const PLAYER_SPEED = 0.18;

const players = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomSpawn() {
  const padding = 3;
  return {
    x: (Math.random() * (ARENA_SIZE - padding * 2)) - (ARENA_SIZE / 2 - padding),
    y: 0.5,
    z: (Math.random() * (ARENA_SIZE - padding * 2)) - (ARENA_SIZE / 2 - padding),
  };
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 80%, 60%)`;
}

io.on('connection', (socket) => {
  try {
    const spawn = randomSpawn();
    const player = {
      id: socket.id,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      rotationY: 0,
      color: randomColor(),
      name: `Player-${socket.id.slice(0, 4)}`,
      lastInputSeq: 0,
    };

    players.set(socket.id, player);

    socket.emit('init', {
      id: socket.id,
      arenaSize: ARENA_SIZE,
      player,
      players: Object.fromEntries(players),
      serverTickRate: TICK_RATE,
      speed: PLAYER_SPEED,
    });

    socket.broadcast.emit('playerJoined', player);

    socket.on('move', (payload = {}) => {
      try {
        const p = players.get(socket.id);
        if (!p) return;

        const x = Number(payload.x);
        const y = Number(payload.y);
        const z = Number(payload.z);
        const rotationY = Number(payload.rotationY);
        const lastInputSeq = Number(payload.lastInputSeq || 0);

        if (
          Number.isNaN(x) ||
          Number.isNaN(y) ||
          Number.isNaN(z) ||
          Number.isNaN(rotationY)
        ) {
          return;
        }

        const boundary = HALF_ARENA - 0.6;

        p.x = clamp(x, -boundary, boundary);
        p.y = 0.5;
        p.z = clamp(z, -boundary, boundary);
        p.rotationY = rotationY;
        p.lastInputSeq = lastInputSeq;
      } catch (err) {
        console.error('Move handler error:', err);
      }
    });

    socket.on('disconnect', () => {
      try {
        players.delete(socket.id);
        io.emit('playerLeft', socket.id);
      } catch (err) {
        console.error('Disconnect handler error:', err);
      }
    });

    socket.on('error', (err) => {
      console.error(`Socket error from ${socket.id}:`, err);
    });
  } catch (err) {
    console.error('Connection setup error:', err);
    socket.disconnect(true);
  }
});

setInterval(() => {
  try {
    const snapshot = {};
    for (const [id, player] of players.entries()) {
      snapshot[id] = {
        id: player.id,
        x: player.x,
        y: player.y,
        z: player.z,
        rotationY: player.rotationY,
        color: player.color,
        name: player.name,
        lastInputSeq: player.lastInputSeq,
      };
    }

    io.emit('state', {
      time: Date.now(),
      players: snapshot,
    });
  } catch (err) {
    console.error('Broadcast error:', err);
  }
}, TICK_RATE);

app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>3D Battle Arena</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #05070d;
      font-family: Inter, Arial, sans-serif;
      color: white;
    }

    #game {
      width: 100%;
      height: 100%;
      display: block;
    }

    .hud {
      position: fixed;
      top: 14px;
      left: 14px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.38);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 12px 14px;
      backdrop-filter: blur(8px);
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
      user-select: none;
    }

    .hud h1 {
      margin: 0 0 8px 0;
      font-size: 16px;
      letter-spacing: 0.04em;
    }

    .hud p {
      margin: 4px 0;
      font-size: 13px;
      opacity: 0.9;
    }

    .crosshair {
      position: fixed;
      left: 50%;
      top: 50%;
      width: 10px;
      height: 10px;
      transform: translate(-50%, -50%);
      z-index: 9;
      pointer-events: none;
    }

    .crosshair::before,
    .crosshair::after {
      content: "";
      position: absolute;
      background: rgba(255,255,255,0.8);
      box-shadow: 0 0 8px rgba(255,255,255,0.35);
    }

    .crosshair::before {
      width: 10px;
      height: 2px;
      top: 4px;
      left: 0;
    }

    .crosshair::after {
      width: 2px;
      height: 10px;
      top: 0;
      left: 4px;
    }

    .status {
      position: fixed;
      right: 14px;
      top: 14px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.38);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
      backdrop-filter: blur(8px);
    }
  </style>
</head>
<body>
  <div class="hud">
    <h1>Battle Arena</h1>
    <p>Move: <strong>WASD</strong></p>
    <p>Camera: auto-follow</p>
    <p>Players sync every 45ms with interpolation</p>
  </div>
  <div class="status" id="status">Connecting...</div>
  <div class="crosshair"></div>
  <canvas id="game"></canvas>

  <script src="/socket.io/socket.io.js"></script>
  <script type="module">
    import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

    const socket = io({
      transports: ['websocket', 'polling']
    });

    const canvas = document.getElementById('game');
    const statusEl = document.getElementById('status');

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.Fog(0x070b14, 20, 70);

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    const clock = new THREE.Clock();

    let arenaSize = 40;
    let myId = null;
    let myPlayer = null;
    let serverStateBuffer = [];
    let sequence = 0;

    const keyState = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false
    };

    const localInputs = [];
    const remotePlayers = new Map();

    const world = {
      floor: null,
      grid: null,
      walls: []
    };

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function createArena(size) {
      const half = size / 2;

      const floorGeo = new THREE.PlaneGeometry(size, size, 1, 1);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x141a24,
        metalness: 0.2,
        roughness: 0.85
      });

      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      world.floor = floor;

      const grid = new THREE.GridHelper(size, size, 0x7dd3fc, 0x334155);
      grid.position.y = 0.01;
      grid.material.opacity = 0.35;
      grid.material.transparent = true;
      scene.add(grid);
      world.grid = grid;

      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.35,
        roughness: 0.7,
        emissive: 0x0b1220,
        emissiveIntensity: 0.25
      });

      const thickness = 0.8;
      const height = 2;

      const wallData = [
        { w: size + thickness * 2, h: height, d: thickness, x: 0, y: height / 2, z: -half - thickness / 2 },
        { w: size + thickness * 2, h: height, d: thickness, x: 0, y: height / 2, z: half + thickness / 2 },
        { w: thickness, h: height, d: size, x: -half - thickness / 2, y: height / 2, z: 0 },
        { w: thickness, h: height, d: size, x: half + thickness / 2, y: height / 2, z: 0 }
      ];

      for (const wall of wallData) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(wall.w, wall.h, wall.d),
          wallMat
        );
        mesh.position.set(wall.x, wall.y, wall.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        world.walls.push(mesh);
      }
    }

    function createLights() {
      const ambient = new THREE.AmbientLight(0xaecbff, 0.4);
      scene.add(ambient);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
      dirLight.position.set(12, 18, 10);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 80;
      dirLight.shadow.camera.left = -30;
      dirLight.shadow.camera.right = 30;
      dirLight.shadow.camera.top = 30;
      dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.bias = -0.0008;
      scene.add(dirLight);

      const rim = new THREE.DirectionalLight(0x60a5fa, 0.5);
      rim.position.set(-10, 8, -12);
      scene.add(rim);
    }

    function createPlayerMesh(color, isLocal = false) {
      const group = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color,
          metalness: 0.3,
          roughness: 0.45,
          emissive: new THREE.Color(color).multiplyScalar(isLocal ? 0.15 : 0.08),
          emissiveIntensity: 1
        })
      );
      body.position.y = 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.18, 0.45),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.1,
          roughness: 0.6
        })
      );
      top.position.set(0, 1.12, 0);
      top.castShadow = true;
      group.add(top);

      const forwardMark = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          metalness: 0.2,
          roughness: 0.8
        })
      );
      forwardMark.position.set(0, 0.65, 0.52);
      group.add(forwardMark);

      scene.add(group);
      return group;
    }

    function addOrUpdateRemotePlayer(data) {
      if (!data || data.id === myId) return;

      let entry = remotePlayers.get(data.id);

      if (!entry) {
        const mesh = createPlayerMesh(data.color || '#ff00ff', false);
        entry = {
          mesh,
          state: {
            x: data.x,
            y: data.y,
            z: data.z,
            rotationY: data.rotationY || 0
          }
        };
        mesh.position.set(data.x, data.y || 0, data.z);
        mesh.rotation.y = data.rotationY || 0;
        remotePlayers.set(data.id, entry);
      }
    }

    function removeRemotePlayer(id) {
      const entry = remotePlayers.get(id);
      if (!entry) return;
      scene.remove(entry.mesh);
      remotePlayers.delete(id);
    }

    function setupLocalPlayer(player) {
      if (myPlayer && myPlayer.mesh) {
        scene.remove(myPlayer.mesh);
      }

      const mesh = createPlayerMesh(player.color, true);
      mesh.position.set(player.x, player.y, player.z);
      mesh.rotation.y = player.rotationY || 0;

      myPlayer = {
        id: player.id,
        mesh,
        position: new THREE.Vector3(player.x, player.y, player.z),
        rotationY: player.rotationY || 0,
        color: player.color,
        speed: 8.2
      };
    }

    function processMovement(delta) {
      if (!myPlayer) return;

      const move = new THREE.Vector3(
        (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0),
        0,
        (keyState.KeyS ? 1 : 0) - (keyState.KeyW ? 1 : 0)
      );

      if (move.lengthSq() <= 0) return;

      move.normalize();

      const scaledSpeed = myPlayer.speed * delta;
      myPlayer.position.x += move.x * scaledSpeed;
      myPlayer.position.z += move.z * scaledSpeed;

      const boundary = arenaSize / 2 - 0.6;
      myPlayer.position.x = clamp(myPlayer.position.x, -boundary, boundary);
      myPlayer.position.z = clamp(myPlayer.position.z, -boundary, boundary);
      myPlayer.position.y = 0.5;

      myPlayer.rotationY = Math.atan2(move.x, move.z);

      myPlayer.mesh.position.copy(myPlayer.position);
      myPlayer.mesh.rotation.y = myPlayer.rotationY;

      const input = {
        seq: ++sequence,
        x: myPlayer.position.x,
        y: myPlayer.position.y,
        z: myPlayer.position.z,
        rotationY: myPlayer.rotationY,
        dt: delta
      };

      localInputs.push(input);

      socket.emit('move', {
        x: input.x,
        y: input.y,
        z: input.z,
        rotationY: input.rotationY,
        lastInputSeq: input.seq
      });
    }

    function reconcileWithServer(serverPlayer) {
      if (!myPlayer || !serverPlayer) return;

      const boundary = arenaSize / 2 - 0.6;

      myPlayer.position.set(
        clamp(serverPlayer.x, -boundary, boundary),
        0.5,
        clamp(serverPlayer.z, -boundary, boundary)
      );
      myPlayer.rotationY = serverPlayer.rotationY || 0;

      while (localInputs.length && localInputs[0].seq <= (serverPlayer.lastInputSeq || 0)) {
        localInputs.shift();
      }

      for (const input of localInputs) {
        myPlayer.position.set(
          clamp(input.x, -boundary, boundary),
          0.5,
          clamp(input.z, -boundary, boundary)
        );
        myPlayer.rotationY = input.rotationY;
      }

      myPlayer.mesh.position.copy(myPlayer.position);
      myPlayer.mesh.rotation.y = myPlayer.rotationY;
    }

    function interpolateRemotePlayers(renderTime) {
      if (serverStateBuffer.length < 2) return;

      while (
        serverStateBuffer.length >= 2 &&
        serverStateBuffer[1].time <= renderTime
      ) {
        serverStateBuffer.shift();
      }

      const older = serverStateBuffer[0];
      const newer = serverStateBuffer[1];

      if (!older || !newer) return;

      const span = newer.time - older.time;
      const t = span > 0 ? (renderTime - older.time) / span : 0;

      for (const [id, entry] of remotePlayers.entries()) {
        const oldState = older.players[id];
        const newState = newer.players[id];

        if (!oldState && !newState) continue;

        const from = oldState || newState;
        const to = newState || oldState;

        entry.mesh.position.set(
          lerp(from.x, to.x, t),
          lerp(from.y ?? 0.5, to.y ?? 0.5, t),
          lerp(from.z, to.z, t)
        );

        entry.mesh.rotation.y = lerp(
          from.rotationY || 0,
          to.rotationY || 0,
          t
        );
      }
    }

    function updateCamera(delta) {
      if (!myPlayer) return;

      const targetOffset = new THREE.Vector3(0, 9, 9);
      const desired = myPlayer.position.clone().add(targetOffset);

      camera.position.lerp(desired, Math.min(1, 6 * delta));
      camera.lookAt(
        myPlayer.position.x,
        myPlayer.position.y + 0.5,
        myPlayer.position.z
      );
    }

    function animate() {
      requestAnimationFrame(animate);

      const delta = Math.min(clock.getDelta(), 0.05);
      processMovement(delta);

      const renderDelay = 100;
      const renderTime = Date.now() - renderDelay;
      interpolateRemotePlayers(renderTime);

      updateCamera(delta);
      renderer.render(scene, camera);
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    window.addEventListener('resize', onResize, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.code in keyState) keyState[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.code in keyState) keyState[e.code] = false;
    });

    socket.on('connect', () => {
      statusEl.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
      statusEl.textContent = 'Disconnected';
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      statusEl.textContent = 'Connection error';
    });

    socket.on('init', (data) => {
      myId = data.id;
      arenaSize = data.arenaSize || 40;

      createArena(arenaSize);
      createLights();

      setupLocalPlayer(data.player);

      const allPlayers = data.players || {};
      for (const id of Object.keys(allPlayers)) {
        if (id !== myId) {
          addOrUpdateRemotePlayer(allPlayers[id]);
        }
      }

      camera.position.set(0, 10, 10);
      camera.lookAt(0, 0, 0);
    });

    socket.on('playerJoined', (player) => {
      addOrUpdateRemotePlayer(player);
    });

    socket.on('playerLeft', (id) => {
      removeRemotePlayer(id);
    });

    socket.on('state', (snapshot) => {
      if (!snapshot || !snapshot.players) return;

      serverStateBuffer.push(snapshot);

      if (serverStateBuffer.length > 20) {
        serverStateBuffer.shift();
      }

      for (const id of Object.keys(snapshot.players)) {
        if (id === myId) continue;
        addOrUpdateRemotePlayer(snapshot.players[id]);
      }

      for (const [id] of remotePlayers.entries()) {
        if (!snapshot.players[id]) {
          removeRemotePlayer(id);
        }
      }

      if (myId && snapshot.players[myId]) {
        reconcileWithServer(snapshot.players[myId]);
      }
    });

    animate();
  </script>
</body>
</html>`);
});

server.listen(PORT, () => {
  console.log(\`Battle Arena server running on port \${PORT}\`);
});
