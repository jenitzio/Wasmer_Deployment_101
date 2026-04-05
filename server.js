const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ['websocket', 'polling'],
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const BROADCAST_MS = 45;
const ARENA_SIZE = 40;
const HALF_ARENA = ARENA_SIZE / 2;
const PLAYER_SPEED = 0.22;

const players = new Map();

function randomSpawn() {
  return {
    x: (Math.random() - 0.5) * (ARENA_SIZE - 4),
    y: 0.5,
    z: (Math.random() - 0.5) * (ARENA_SIZE - 4)
  };
}

function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Battle Arena</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0b1020;
      font-family: Arial, sans-serif;
    }
    canvas {
      display: block;
    }
    #hud {
      position: fixed;
      top: 12px;
      left: 12px;
      color: white;
      background: rgba(0,0,0,0.35);
      padding: 10px 12px;
      border-radius: 8px;
      z-index: 10;
      font-size: 14px;
      line-height: 1.4;
      backdrop-filter: blur(6px);
    }
  </style>
</head>
<body>
  <div id="hud">
    <div><strong>Battle Arena</strong></div>
    <div>Move: WASD / Arrow Keys</div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    const socket = io();
    const ARENA_SIZE = ${ARENA_SIZE};
    const HALF_ARENA = ARENA_SIZE / 2;
    const PLAYER_SPEED = ${PLAYER_SPEED};

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1020);
    scene.fog = new THREE.Fog(0x0b1020, 20, 70);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 18, 18);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x8090aa, 1.0);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
    dirLight.position.set(12, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 60;
    scene.add(dirLight);

    const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2238,
      metalness: 0.15,
      roughness: 0.85
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(ARENA_SIZE, ARENA_SIZE, 0x67a0ff, 0x2f4368);
    grid.position.y = 0.01;
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x243252 });
    const wallHeight = 2;
    const wallThickness = 0.5;

    function addWall(x, z, w, d) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, wallHeight, d),
        wallMat
      );
      wall.position.set(x, wallHeight / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
    }

    addWall(0, -HALF_ARENA, ARENA_SIZE + wallThickness, wallThickness);
    addWall(0, HALF_ARENA, ARENA_SIZE + wallThickness, wallThickness);
    addWall(-HALF_ARENA, 0, wallThickness, ARENA_SIZE + wallThickness);
    addWall(HALF_ARENA, 0, wallThickness, ARENA_SIZE + wallThickness);

    const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
    const players = new Map();
    let localId = null;
    let localPlayer = null;

    const keyState = {
      KeyW: false, KeyA: false, KeyS: false, KeyD: false,
      ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    };

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function createPlayerMesh(color, isLocal = false) {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: isLocal ? 0x111111 : 0x000000,
        metalness: 0.2,
        roughness: 0.55
      });
      const mesh = new THREE.Mesh(playerGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }

    function ensurePlayer(id, data) {
      if (!players.has(id)) {
        const isLocal = id === localId;
        const mesh = createPlayerMesh(data.color || 0xffffff, isLocal);
        players.set(id, {
          id,
          mesh,
          current: { x: data.x, y: data.y, z: data.z },
          target: { x: data.x, y: data.y, z: data.z },
          color: data.color
        });
      }
      return players.get(id);
    }

    function removePlayer(id) {
      const p = players.get(id);
      if (!p) return;
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      players.delete(id);
    }

    socket.on('connect', () => {
      localId = socket.id;
    });

    socket.on('init', (payload) => {
      localId = payload.id;

      for (const id in payload.players) {
        const p = payload.players[id];
        const player = ensurePlayer(id, p);
        player.current = { x: p.x, y: p.y, z: p.z };
        player.target = { x: p.x, y: p.y, z: p.z };
        player.mesh.position.set(p.x, p.y, p.z);
      }

      localPlayer = players.get(localId) || null;
    });

    socket.on('state', (serverPlayers) => {
      const ids = new Set(Object.keys(serverPlayers));

      for (const id in serverPlayers) {
        const data = serverPlayers[id];
        const player = ensurePlayer(id, data);

        if (id === localId) {
          player.current.y = data.y;
          player.target.y = data.y;
          player.mesh.position.y = data.y;
        } else {
          player.target.x = data.x;
          player.target.y = data.y;
          player.target.z = data.z;
        }
      }

      for (const [id] of players) {
        if (!ids.has(id)) removePlayer(id);
      }

      localPlayer = players.get(localId) || localPlayer;
    });

    socket.on('playerDisconnected', (id) => {
      removePlayer(id);
    });

    socket.on('disconnect', () => {
      console.warn('Disconnected from server');
    });

    window.addEventListener('keydown', (e) => {
      if (e.code in keyState) keyState[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.code in keyState) keyState[e.code] = false;
    });

    function getInputVector() {
      let x = 0;
      let z = 0;

      if (keyState.KeyW || keyState.ArrowUp) z -= 1;
      if (keyState.KeyS || keyState.ArrowDown) z += 1;
      if (keyState.KeyA || keyState.ArrowLeft) x -= 1;
      if (keyState.KeyD || keyState.ArrowRight) x += 1;

      const len = Math.hypot(x, z) || 1;
      return { x: x / len, z: z / len, moving: x !== 0 || z !== 0 };
    }

    function updateLocalPlayer() {
      if (!localPlayer) return;

      const input = getInputVector();
      if (!input.moving) return;

      localPlayer.current.x += input.x * PLAYER_SPEED;
      localPlayer.current.z += input.z * PLAYER_SPEED;

      localPlayer.current.x = clamp(localPlayer.current.x, -HALF_ARENA + 0.75, HALF_ARENA - 0.75);
      localPlayer.current.z = clamp(localPlayer.current.z, -HALF_ARENA + 0.75, HALF_ARENA - 0.75);

      localPlayer.mesh.position.set(
        localPlayer.current.x,
        localPlayer.current.y,
        localPlayer.current.z
      );

      socket.emit('move', {
        x: localPlayer.current.x,
        z: localPlayer.current.z
      });
    }

    function interpolateRemotePlayers() {
      for (const [id, player] of players) {
        if (id === localId) continue;

        player.current.x += (player.target.x - player.current.x) * 0.18;
        player.current.y += (player.target.y - player.current.y) * 0.18;
        player.current.z += (player.target.z - player.current.z) * 0.18;

        player.mesh.position.set(player.current.x, player.current.y, player.current.z);
      }
    }

    function updateCamera() {
      if (!localPlayer) return;
      const desired = new THREE.Vector3(
        localPlayer.mesh.position.x,
        localPlayer.mesh.position.y + 14,
        localPlayer.mesh.position.z + 14
      );
      camera.position.lerp(desired, 0.08);
      camera.lookAt(localPlayer.mesh.position.x, 0.5, localPlayer.mesh.position.z);
    }

    function animate() {
      requestAnimationFrame(animate);
      updateLocalPlayer();
      interpolateRemotePlayers();
      updateCamera();
      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  </script>
</body>
</html>`);
});

io.on('connection', (socket) => {
  const spawn = randomSpawn();
  const player = {
    id: socket.id,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    color: randomColor()
  };

  players.set(socket.id, player);

  socket.emit('init', {
    id: socket.id,
    players: Object.fromEntries(players)
  });

  socket.on('move', (data) => {
    const p = players.get(socket.id);
    if (!p || !data) return;

    const x = Number(data.x);
    const z = Number(data.z);

    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    p.x = clamp(x, -HALF_ARENA + 0.75, HALF_ARENA - 0.75);
    p.z = clamp(z, -HALF_ARENA + 0.75, HALF_ARENA - 0.75);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerDisconnected', socket.id);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

setInterval(() => {
  io.emit('state', Object.fromEntries(players));
}, BROADCAST_MS);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
