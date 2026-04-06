const http = require('http');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NEON BLASTER - Server Embedded</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Rajdhani:wght@400;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #050510;
      --panel: rgba(10, 14, 35, 0.78);
      --panel-strong: rgba(8, 10, 24, 0.92);
      --border: rgba(255,255,255,0.08);
      --cyan: #00ffd5;
      --pink: #ff2d7a;
      --red: #ff365f;
      --orange: #ff9b29;
      --yellow: #ffd84d;
      --green: #32ff8a;
      --blue: #49a6ff;
      --purple: #a855ff;
      --text: #eef6ff;
      --muted: #7f8ba8;
    }

    body {
      background: radial-gradient(circle at top, #0d1330 0%, #050510 45%, #030308 100%);
      color: var(--text);
      font-family: 'Orbitron', sans-serif;
      overflow: hidden;
      cursor: none;
      user-select: none;
    }

    canvas {
      display: block;
    }

    .glass {
      background: var(--panel);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      box-shadow: 0 10px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .glass-strong {
      background: var(--panel-strong);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 16px 60px rgba(0,0,0,0.45);
    }

    #gameCanvas {
      position: fixed;
      inset: 0;
      z-index: 1;
    }

    #crosshair {
      position: fixed;
      width: 34px;
      height: 34px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1000;
      display: none;
    }
    #crosshair::before,
    #crosshair::after {
      content: '';
      position: absolute;
      background: var(--red);
      box-shadow: 0 0 10px var(--red);
    }
    #crosshair::before {
      width: 2px;
      height: 100%;
      left: 50%;
      transform: translateX(-50%);
    }
    #crosshair::after {
      width: 100%;
      height: 2px;
      top: 50%;
      transform: translateY(-50%);
    }
    #crosshair .dot {
      position: absolute;
      width: 5px;
      height: 5px;
      background: white;
      border-radius: 50%;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 12px white;
    }

    #hud {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 20;
      display: none;
      padding: 14px 20px;
      justify-content: space-between;
      align-items: flex-start;
      background: linear-gradient(to bottom, rgba(0,0,0,0.45), transparent);
      pointer-events: none;
    }

    .hud-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .hud-label {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 3px;
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
    }

    .hud-value {
      font-size: 26px;
      font-weight: 900;
      text-shadow: 0 0 14px currentColor;
    }

    #scoreDisplay { color: var(--cyan); }
    #waveDisplay { color: var(--orange); }
    #enemyDisplay { color: var(--red); }
    #comboDisplay { color: var(--purple); }

    #healthWrap {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      width: 360px;
      height: 24px;
      border-radius: 999px;
      overflow: hidden;
      z-index: 20;
      display: none;
    }

    #healthBarBg {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.04);
    }

    #healthBar {
      position: absolute;
      inset: 0;
      width: 100%;
      background: linear-gradient(90deg, #14ff7b, #6bffb0);
      transition: width 0.15s linear;
    }

    #healthText {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 11px;
      letter-spacing: 2px;
      font-family: 'Rajdhani', sans-serif;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0,0,0,0.9);
    }

    #weaponPanel {
      position: fixed;
      left: 50%;
      bottom: 54px;
      transform: translateX(-50%);
      display: none;
      gap: 8px;
      z-index: 20;
      pointer-events: none;
    }

    .weaponSlot {
      min-width: 110px;
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 11px;
      text-align: center;
      color: var(--muted);
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
    }

    .weaponSlot.active {
      color: var(--cyan);
      border-color: rgba(0,255,213,0.5);
      box-shadow: 0 0 20px rgba(0,255,213,0.22);
      transform: translateY(-2px);
    }

    .weaponSlot .sub {
      display: block;
      font-family: 'Rajdhani', sans-serif;
      color: var(--orange);
      margin-top: 2px;
      font-size: 11px;
      font-weight: 700;
    }

    #leftInfo {
      position: fixed;
      left: 18px;
      bottom: 18px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 20;
    }

    .leftBox {
      padding: 10px 14px;
      border-radius: 12px;
      min-width: 120px;
      font-size: 12px;
    }

    .leftBox .small {
      display: block;
      color: var(--muted);
      font-family: 'Rajdhani', sans-serif;
      font-size: 10px;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }

    #topCenterBadge {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 16px;
      border-radius: 999px;
      z-index: 25;
      display: none;
      font-family: 'Rajdhani', sans-serif;
      letter-spacing: 3px;
      font-size: 11px;
      font-weight: 700;
    }

    #waveBanner, #bossBanner, #notify {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      z-index: 40;
      pointer-events: none;
      opacity: 0;
      transition: all 0.28s ease;
      text-align: center;
    }

    #waveBanner {
      top: 36%;
      font-size: 56px;
      color: var(--orange);
      text-shadow: 0 0 24px var(--orange);
    }

    #bossBanner {
      top: 18%;
      font-size: 44px;
      color: var(--red);
      text-shadow: 0 0 24px var(--red);
    }

    #notify {
      top: 26%;
      font-size: 22px;
      color: var(--cyan);
      text-shadow: 0 0 18px currentColor;
    }

    .showBanner {
      opacity: 1 !important;
      transform: translateX(-50%) scale(1.04);
    }

    #damageFlash {
      position: fixed;
      inset: 0;
      z-index: 15;
      pointer-events: none;
      opacity: 0;
      background: radial-gradient(circle at center, transparent 30%, rgba(255,0,0,0.28) 100%);
      transition: opacity 0.14s ease;
    }

    #hub {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(circle at 20% 20%, rgba(0,255,213,0.08), transparent 20%),
        radial-gradient(circle at 80% 30%, rgba(168,85,255,0.08), transparent 20%),
        radial-gradient(circle at 50% 80%, rgba(255,45,122,0.08), transparent 20%),
        #050510;
      overflow-y: auto;
      cursor: default;
    }

    #hubParticles {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    .hubInner {
      position: relative;
      z-index: 1;
      width: min(1100px, calc(100% - 40px));
      margin: 0 auto;
      padding: 24px 0 50px;
    }

    .hubHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      gap: 16px;
    }

    .title {
      font-size: clamp(34px, 5vw, 58px);
      font-weight: 900;
      background: linear-gradient(90deg, var(--pink), var(--orange), var(--yellow), var(--cyan), var(--blue), var(--purple));
      background-size: 200% 100%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: titleShift 5s linear infinite;
    }

    @keyframes titleShift {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }

    .currencyRow {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .pill {
      padding: 10px 16px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .statsBar {
      margin-bottom: 16px;
      color: var(--muted);
      font-family: 'Rajdhani', sans-serif;
      font-size: 13px;
      letter-spacing: 1px;
    }

    .tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 18px;
    }

    .tabBtn {
      padding: 10px 18px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      cursor: pointer;
    }

    .tabBtn.active {
      color: var(--cyan);
      border-color: rgba(0,255,213,0.4);
      box-shadow: 0 0 18px rgba(0,255,213,0.16);
    }

    .tabContent { display: none; }
    .tabContent.active { display: block; }

    .sectionCard {
      padding: 22px;
      border-radius: 20px;
      margin-bottom: 18px;
    }

    .sectionTitle {
      font-size: 20px;
      margin-bottom: 18px;
      letter-spacing: 3px;
    }

    .difficultyGrid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }

    .difficultyCard {
      padding: 20px 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      transition: 0.2s ease;
      text-align: center;
    }

    .difficultyCard:hover { transform: translateY(-4px); }
    .difficultyCard.selected {
      border-color: currentColor;
      box-shadow: 0 0 24px color-mix(in srgb, currentColor 28%, transparent);
    }

    .difficultyCard .icon {
      font-size: 38px;
      margin-bottom: 10px;
    }

    .difficultyCard .name {
      font-size: 15px;
      font-weight: 900;
      margin-bottom: 8px;
    }

    .difficultyCard .desc {
      color: var(--muted);
      font-family: 'Rajdhani', sans-serif;
      font-size: 13px;
      line-height: 1.45;
    }

    .bigBtn {
      padding: 18px 36px;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      font-family: 'Orbitron', sans-serif;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 4px;
      color: white;
      background: linear-gradient(90deg, var(--pink), var(--red));
      box-shadow: 0 10px 30px rgba(255,54,95,0.28);
    }

    .bigBtn:hover { filter: brightness(1.08); transform: translateY(-2px); }
    .bigBtn.secondary {
      background: linear-gradient(90deg, #0d6efd, #2cc8ff);
      box-shadow: 0 10px 30px rgba(44,200,255,0.25);
    }

    .bigBtn.gold {
      background: linear-gradient(90deg, #ffae00, #ffd84d);
      color: #111;
      box-shadow: 0 10px 30px rgba(255,174,0,0.28);
    }

    .controlsText {
      margin-top: 18px;
      color: var(--muted);
      font-family: 'Rajdhani', sans-serif;
      line-height: 1.8;
      font-size: 14px;
    }

    .controlsText span {
      color: var(--cyan);
      font-weight: 700;
    }

    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .armoryList, .skillGrid, .chestGrid {
      display: grid;
      gap: 12px;
    }

    .armoryItem, .skillItem, .chestItem {
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
    }

    .armoryItem {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items: center;
    }

    .armoryMeta {
      color: var(--muted);
      font-family: 'Rajdhani', sans-serif;
      font-size: 13px;
      line-height: 1.55;
    }

    .armoryBtns {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .smallBtn {
      padding: 9px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      color: white;
      cursor: pointer;
      font-size: 10px;
      font-family: 'Orbitron', sans-serif;
      min-width: 88px;
    }

    .smallBtn:hover { filter: brightness(1.08); }
    .smallBtn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .skillGrid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .skillMeta, .chestMeta {
      color: var(--muted);
      font-size: 13px;
      font-family: 'Rajdhani', sans-serif;
      line-height: 1.55;
      margin-top: 6px;
    }

    .chestGrid {
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }

    .chestItem.empty {
      opacity: 0.32;
    }

    .modal {
      position: fixed;
      inset: 0;
      display: none;
      z-index: 120;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.55);
      cursor: default;
    }

    .modal.show { display: flex; }

    .modalCard {
      width: min(720px, calc(100% - 28px));
      border-radius: 20px;
      padding: 26px;
    }

    .rewardList {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 16px 0 20px;
    }

    .reward {
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border);
      font-size: 13px;
    }

    #pauseOverlay, #gameOver {
      position: fixed;
      inset: 0;
      display: none;
      z-index: 110;
      background: rgba(5,5,16,0.84);
      backdrop-filter: blur(8px);
      align-items: center;
      justify-content: center;
      cursor: default;
    }

    #pauseOverlay.show, #gameOver.show {
      display: flex;
    }

    .centerPanel {
      width: min(760px, calc(100% - 28px));
      padding: 28px;
      border-radius: 22px;
      text-align: center;
    }

    .centerTitle {
      font-size: 42px;
      font-weight: 900;
      margin-bottom: 12px;
    }

    .goStat {
      font-size: 22px;
      margin-bottom: 8px;
    }

    .buttonRow {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 18px;
    }

    .floatingText {
      position: fixed;
      z-index: 60;
      pointer-events: none;
      font-weight: 900;
      text-shadow: 0 0 14px currentColor;
      animation: floatUp 0.9s ease-out forwards;
    }

    @keyframes floatUp {
      0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -55px) scale(0.9); }
    }

    @media (max-width: 900px) {
      .grid2 { grid-template-columns: 1fr; }
      #weaponPanel { flex-wrap: wrap; width: calc(100% - 20px); justify-content: center; }
      #healthWrap { width: calc(100% - 32px); }
      .armoryItem { grid-template-columns: 1fr; }
      .armoryBtns { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <canvas id="gameCanvas"></canvas>
  <canvas id="hubParticles"></canvas>

  <div id="crosshair"><div class="dot"></div></div>
  <div id="damageFlash"></div>

  <div id="topCenterBadge" class="glass"></div>
  <div id="waveBanner"></div>
  <div id="bossBanner">⚠ BOSS INCOMING ⚠</div>
  <div id="notify"></div>

  <div id="hud">
    <div class="hud-col">
      <div class="hud-label">SCORE</div>
      <div class="hud-value" id="scoreDisplay">0</div>
    </div>
    <div class="hud-col" style="align-items:center;">
      <div class="hud-label">WAVE</div>
      <div class="hud-value" id="waveDisplay">1</div>
    </div>
    <div class="hud-col" style="align-items:center;">
      <div class="hud-label">COMBO</div>
      <div class="hud-value" id="comboDisplay">x1</div>
    </div>
    <div class="hud-col" style="align-items:flex-end;">
      <div class="hud-label">ENEMIES</div>
      <div class="hud-value" id="enemyDisplay">0</div>
    </div>
  </div>

  <div id="weaponPanel">
    <div class="weaponSlot active" id="weapon0">[1] Pistol <span class="sub">∞</span></div>
    <div class="weaponSlot" id="weapon1">[2] SMG <span class="sub" id="ammo1">0</span></div>
    <div class="weaponSlot" id="weapon2">[3] Shotgun <span class="sub" id="ammo2">0</span></div>
    <div class="weaponSlot" id="weapon3">[4] Sniper <span class="sub" id="ammo3">0</span></div>
  </div>

  <div id="leftInfo">
    <div class="leftBox glass">
      <span class="small">GRENADES</span>
      <div id="grenadeText">💣 3</div>
    </div>
    <div class="leftBox glass">
      <span class="small">DASH</span>
      <div id="dashText">READY</div>
    </div>
  </div>

  <div id="healthWrap" class="glass">
    <div id="healthBarBg"></div>
    <div id="healthBar"></div>
    <div id="healthText">HP 100 / 100</div>
  </div>

  <div id="hub">
    <div class="hubInner">
      <div class="hubHeader">
        <div class="title">NEON BLASTER</div>
        <div class="currencyRow">
          <div class="pill glass">💰 <span id="creditsText">0</span></div>
          <div class="pill glass">🔮 <span id="tokensText">0</span></div>
        </div>
      </div>

      <div class="statsBar">
        Games Played: <span id="gamesPlayedText">0</span> |
        Best Score: <span id="bestScoreText">0</span> |
        Best Wave: <span id="bestWaveText">0</span>
      </div>

      <div class="tabs">
        <button class="tabBtn active" data-tab="play">▶ PLAY</button>
        <button class="tabBtn" data-tab="armory">🔧 ARMORY</button>
        <button class="tabBtn" data-tab="skills">🌟 SKILLS</button>
        <button class="tabBtn" data-tab="chests">🎁 CHESTS</button>
      </div>

      <div class="tabContent active" id="tab-play">
        <div class="sectionCard glass-strong">
          <div class="sectionTitle" style="color:var(--orange);">SELECT DIFFICULTY</div>
          <div class="difficultyGrid" id="difficultyGrid"></div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <button id="playBtn" class="bigBtn">▶ DEPLOY</button>
            <button id="resetSaveBtn" class="bigBtn secondary">↺ RESET SAVE</button>
          </div>
          <div class="controlsText">
            <span>WASD</span> Move ·
            <span>MOUSE</span> Aim ·
            <span>CLICK</span> Shoot ·
            <span>1-4</span> Weapons ·
            <span>R</span> Reload ·
            <span>SPACE</span> Dash ·
            <span>E</span> Grenade ·
            <span>ESC</span> Pause
          </div>
        </div>
      </div>

      <div class="tabContent" id="tab-armory">
        <div class="sectionCard glass-strong">
          <div class="sectionTitle" style="color:var(--cyan);">WEAPON UPGRADES</div>
          <div class="armoryList" id="armoryList"></div>
        </div>
      </div>

      <div class="tabContent" id="tab-skills">
        <div class="sectionCard glass-strong">
          <div class="sectionTitle" style="color:var(--purple);">SKILL TREE</div>
          <div style="margin-bottom:14px;color:var(--muted);font-family:'Rajdhani',sans-serif;">
            Available Tokens: <span id="tokenCountLarge" style="color:var(--purple);font-weight:700;">0</span>
          </div>
          <div class="skillGrid" id="skillGrid"></div>
        </div>
      </div>

      <div class="tabContent" id="tab-chests">
        <div class="sectionCard glass-strong">
          <div class="sectionTitle" style="color:var(--yellow);">CHEST INVENTORY</div>
          <div class="chestGrid" id="chestGrid"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="chestModal" class="modal">
    <div class="modalCard glass-strong">
      <div style="font-size:30px;font-weight:900;color:var(--yellow);margin-bottom:10px;">CHEST OPENED</div>
      <div id="chestRewardList" class="rewardList"></div>
      <div class="buttonRow">
        <button id="closeChestBtn" class="bigBtn gold">COLLECT</button>
      </div>
    </div>
  </div>

  <div id="pauseOverlay">
    <div class="centerPanel glass-strong">
      <div class="centerTitle" style="color:var(--cyan);">PAUSED</div>
      <div class="buttonRow">
        <button id="resumeBtn" class="bigBtn secondary">▶ RESUME</button>
        <button id="quitBtn" class="bigBtn">✕ QUIT TO HUB</button>
      </div>
    </div>
  </div>

  <div id="gameOver">
    <div class="centerPanel glass-strong">
      <div class="centerTitle" style="color:var(--red);">GAME OVER</div>
      <div class="goStat" id="goScore">Score: 0</div>
      <div class="goStat" id="goWave">Wave: 1</div>
      <div class="goStat" id="goReward" style="color:var(--yellow);">Rewards: 0</div>
      <div id="goChestRewards" class="rewardList" style="justify-content:center;"></div>
      <div class="buttonRow">
        <button id="returnHubBtn" class="bigBtn">↻ RETURN TO HUB</button>
      </div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const hubParticlesCanvas = document.getElementById('hubParticles');
    const hubParticlesCtx = hubParticlesCanvas.getContext('2d');

    const UI = {
      body: document.body,
      crosshair: document.getElementById('crosshair'),
      damageFlash: document.getElementById('damageFlash'),
      hud: document.getElementById('hud'),
      scoreDisplay: document.getElementById('scoreDisplay'),
      waveDisplay: document.getElementById('waveDisplay'),
      enemyDisplay: document.getElementById('enemyDisplay'),
      comboDisplay: document.getElementById('comboDisplay'),
      weaponPanel: document.getElementById('weaponPanel'),
      healthWrap: document.getElementById('healthWrap'),
      healthBar: document.getElementById('healthBar'),
      healthText: document.getElementById('healthText'),
      leftInfo: document.getElementById('leftInfo'),
      grenadeText: document.getElementById('grenadeText'),
      dashText: document.getElementById('dashText'),
      badge: document.getElementById('topCenterBadge'),
      waveBanner: document.getElementById('waveBanner'),
      bossBanner: document.getElementById('bossBanner'),
      notify: document.getElementById('notify'),
      hub: document.getElementById('hub'),
      creditsText: document.getElementById('creditsText'),
      tokensText: document.getElementById('tokensText'),
      tokenCountLarge: document.getElementById('tokenCountLarge'),
      gamesPlayedText: document.getElementById('gamesPlayedText'),
      bestScoreText: document.getElementById('bestScoreText'),
      bestWaveText: document.getElementById('bestWaveText'),
      difficultyGrid: document.getElementById('difficultyGrid'),
      armoryList: document.getElementById('armoryList'),
      skillGrid: document.getElementById('skillGrid'),
      chestGrid: document.getElementById('chestGrid'),
      chestModal: document.getElementById('chestModal'),
      chestRewardList: document.getElementById('chestRewardList'),
      pauseOverlay: document.getElementById('pauseOverlay'),
      gameOver: document.getElementById('gameOver'),
      goScore: document.getElementById('goScore'),
      goWave: document.getElementById('goWave'),
      goReward: document.getElementById('goReward'),
      goChestRewards: document.getElementById('goChestRewards'),
      ammo1: document.getElementById('ammo1'),
      ammo2: document.getElementById('ammo2'),
      ammo3: document.getElementById('ammo3')
    };

    const SAVE_KEY = 'neon_blaster_server_embedded_save_v1';

    const DIFFICULTIES = {
      easy: {
        label: 'EASY',
        icon: '😊',
        color: '#32ff8a',
        enemyHp: 0.8,
        enemySpeed: 0.9,
        spawnRate: 0.9,
        enemyDamage: 0.8,
        rewards: 0.8,
        desc: 'Forgiving waves and weaker enemies.'
      },
      normal: {
        label: 'NORMAL',
        icon: '😐',
        color: '#00ffd5',
        enemyHp: 1,
        enemySpeed: 1,
        spawnRate: 1,
        enemyDamage: 1,
        rewards: 1,
        desc: 'Balanced survival experience.'
      },
      hard: {
        label: 'HARD',
        icon: '😠',
        color: '#ff9b29',
        enemyHp: 1.35,
        enemySpeed: 1.15,
        spawnRate: 1.2,
        enemyDamage: 1.25,
        rewards: 1.5,
        desc: 'More enemies, faster danger, bigger rewards.'
      },
      nightmare: {
        label: 'NIGHTMARE',
        icon: '💀',
        color: '#ff365f',
        enemyHp: 1.8,
        enemySpeed: 1.3,
        spawnRate: 1.45,
        enemyDamage: 1.55,
        rewards: 2.2,
        desc: 'Serious pressure. Survive if you can.'
      }
    };

    const WEAPON_DEFS = [
      { key:'pistol',  name:'Pistol',  color:'#ffd84d', damage:24, fireRate:16, speed:14, spread:0.03, pellets:1, clip:Infinity, reload:0, pierce:false, explosive:false },
      { key:'smg',     name:'SMG',     color:'#00ffd5', damage:11, fireRate:4,  speed:16, spread:0.12, pellets:1, clip:120,      reload:42, pierce:false, explosive:false },
      { key:'shotgun', name:'Shotgun', color:'#ff9b29', damage:15, fireRate:30, speed:13, spread:0.19, pellets:6, clip:32,       reload:56, pierce:false, explosive:false },
      { key:'sniper',  name:'Sniper',  color:'#ff59d6', damage:95, fireRate:52, speed:24, spread:0.00, pellets:1, clip:15,       reload:70, pierce:true, explosive:false }
    ];

    const ARMORY = {
      pistolDamage:  { label:'Pistol DMG',  costBase:120, max:8 },
      smgDamage:     { label:'SMG DMG',     costBase:150, max:8 },
      shotgunDamage: { label:'Shotgun DMG', costBase:180, max:8 },
      sniperDamage:  { label:'Sniper DMG',  costBase:240, max:8 },
      maxHealth:     { label:'Max Health',  costBase:160, max:8 },
      grenadeCap:    { label:'Grenade Cap', costBase:140, max:6 }
    };

    const SKILLS = {
      vitality:   { name:'Vitality', icon:'❤️', max:5, cost:[1,1,2,2,3], desc:'+20 max HP per level' },
      agility:    { name:'Agility', icon:'👟', max:5, cost:[1,1,2,2,3], desc:'+0.5 move speed per level' },
      marksman:   { name:'Marksman', icon:'🎯', max:5, cost:[1,1,2,2,3], desc:'+10% global gun damage per level' },
      dashCore:   { name:'Dash Core', icon:'💨', max:5, cost:[1,1,2,3,3], desc:'Reduce dash cooldown by 12 frames per level' },
      armor:      { name:'Armor', icon:'🛡️', max:5, cost:[1,2,2,3,3], desc:'Take 8% less damage per level' },
      scavenger:  { name:'Scavenger', icon:'🧲', max:5, cost:[1,1,2,2,3], desc:'Higher powerup drop chance' }
    };

    const CHESTS = {
      bronze:    { icon:'📦', name:'Bronze Chest',    color:'#cd7f32', credits:[100,250], tokens:[0,1] },
      silver:    { icon:'🥈', name:'Silver Chest',    color:'#c0c0c0', credits:[240,520], tokens:[0,2] },
      gold:      { icon:'🥇', name:'Gold Chest',      color:'#ffd84d', credits:[550,1100], tokens:[1,3] },
      legendary: { icon:'💎', name:'Legendary Chest', color:'#ff59d6', credits:[1200,2200], tokens:[2,5] }
    };

    const ENEMY_TYPES = {
      grunt: {
        color:'#ff4e6a',
        radius:15,
        hp:48,
        speed:1.7,
        damage:10,
        score:100
      },
      runner: {
        color:'#ffb029',
        radius:11,
        hp:28,
        speed:3.0,
        damage:8,
        score:140
      },
      tank: {
        color:'#9a5bff',
        radius:24,
        hp:185,
        speed:1.0,
        damage:18,
        score:260
      },
      shooter: {
        color:'#49a6ff',
        radius:15,
        hp:60,
        speed:1.3,
        damage:12,
        score:210,
        ranged:true
      },
      boss: {
        color:'#ff365f',
        radius:42,
        hp:1800,
        speed:0.9,
        damage:26,
        score:1800,
        boss:true,
        ranged:true
      }
    };

    const WORLD = 3200;

    const defaultSave = () => ({
      credits: 500,
      tokens: 3,
      selectedDifficulty: 'normal',
      stats: {
        gamesPlayed: 0,
        bestScore: 0,
        bestWave: 0
      },
      upgrades: {
        pistolDamage: 0,
        smgDamage: 0,
        shotgunDamage: 0,
        sniperDamage: 0,
        maxHealth: 0,
        grenadeCap: 0
      },
      skills: {
        vitality: 0,
        agility: 0,
        marksman: 0,
        dashCore: 0,
        armor: 0,
        scavenger: 0
      },
      chests: {
        bronze: 2,
        silver: 1,
        gold: 0,
        legendary: 0
      }
    });

    function loadSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return defaultSave();
        const parsed = JSON.parse(raw);
        const base = defaultSave();
        return {
          ...base,
          ...parsed,
          stats: { ...base.stats, ...(parsed.stats || {}) },
          upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
          skills: { ...base.skills, ...(parsed.skills || {}) },
          chests: { ...base.chests, ...(parsed.chests || {}) }
        };
      } catch {
        return defaultSave();
      }
    }

    let save = loadSave();

    function writeSave() {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    }

    function resetSave() {
      save = defaultSave();
      writeSave();
      refreshHub();
    }

    function rand(min, max) {
      return Math.random() * (max - min) + min;
    }

    function randint(min, max) {
      return Math.floor(rand(min, max + 1));
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function dist(ax, ay, bx, by) {
      return Math.hypot(ax - bx, ay - by);
    }

    function skillLevel(name) {
      return save.skills[name] || 0;
    }

    function upgradeCost(key) {
      const def = ARMORY[key];
      const level = save.upgrades[key] || 0;
      return Math.floor(def.costBase * (1 + level * 0.6));
    }

    function notify(text, color = 'var(--cyan)', ms = 1200) {
      UI.notify.textContent = text;
      UI.notify.style.color = color;
      UI.notify.classList.add('showBanner');
      clearTimeout(notify._t);
      notify._t = setTimeout(() => UI.notify.classList.remove('showBanner'), ms);
    }

    function damageFlash(op = 0.6) {
      UI.damageFlash.style.opacity = op;
      clearTimeout(damageFlash._t);
      damageFlash._t = setTimeout(() => UI.damageFlash.style.opacity = 0, 120);
    }

    function floatText(text, x, y, color = '#fff', size = 18) {
      const div = document.createElement('div');
      div.className = 'floatingText';
      div.textContent = text;
      div.style.left = x + 'px';
      div.style.top = y + 'px';
      div.style.color = color;
      div.style.fontSize = size + 'px';
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 900);
    }

    const hubParticles = [];
    function initHubParticles() {
      hubParticles.length = 0;
      for (let i = 0; i < 80; i++) {
        hubParticles.push({
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          vx: rand(-0.2, 0.2),
          vy: rand(-0.2, 0.2),
          r: rand(1, 3),
          c: ['#00ffd522','#ff59d622','#49a6ff22','#ffd84d22'][randint(0,3)]
        });
      }
    }

    function resize() {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      hubParticlesCanvas.width = innerWidth;
      hubParticlesCanvas.height = innerHeight;
    }
    addEventListener('resize', () => {
      resize();
      initHubParticles();
    });
    resize();
    initHubParticles();

    function renderHubParticles() {
      hubParticlesCtx.clearRect(0, 0, hubParticlesCanvas.width, hubParticlesCanvas.height);
      for (const p of hubParticles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = hubParticlesCanvas.width;
        if (p.x > hubParticlesCanvas.width) p.x = 0;
        if (p.y < 0) p.y = hubParticlesCanvas.height;
        if (p.y > hubParticlesCanvas.height) p.y = 0;
        hubParticlesCtx.fillStyle = p.c;
        hubParticlesCtx.beginPath();
        hubParticlesCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        hubParticlesCtx.fill();
      }
    }

    function renderDifficultyCards() {
      UI.difficultyGrid.innerHTML = '';
      for (const [key, d] of Object.entries(DIFFICULTIES)) {
        const card = document.createElement('div');
        card.className = 'difficultyCard' + (save.selectedDifficulty === key ? ' selected' : '');
        card.style.color = d.color;
        card.innerHTML = \`
          <div class="icon">\${d.icon}</div>
          <div class="name">\${d.label}</div>
          <div class="desc">\${d.desc}<br><br>Rewards x\${d.rewards}</div>
        \`;
        card.onclick = () => {
          save.selectedDifficulty = key;
          writeSave();
          renderDifficultyCards();
        };
        UI.difficultyGrid.appendChild(card);
      }
    }

    function renderArmory() {
      UI.armoryList.innerHTML = '';
      const rows = [
        ['pistolDamage', 'Pistol damage +5 / level'],
        ['smgDamage', 'SMG damage +3 / level'],
        ['shotgunDamage', 'Shotgun damage +4 / level'],
        ['sniperDamage', 'Sniper damage +16 / level'],
        ['maxHealth', 'Permanent HP +12 / level'],
        ['grenadeCap', 'Max grenades +1 / level']
      ];

      rows.forEach(([key, desc]) => {
        const level = save.upgrades[key];
        const def = ARMORY[key];
        const cost = upgradeCost(key);
        const canBuy = save.credits >= cost && level < def.max;

        const el = document.createElement('div');
        el.className = 'armoryItem';
        el.innerHTML = \`
          <div>
            <div style="font-size:15px;font-weight:800;">\${def.label}</div>
            <div class="armoryMeta">\${desc}<br>Level: \${level} / \${def.max}</div>
          </div>
          <div class="armoryBtns">
            <button class="smallBtn" \${canBuy ? '' : 'disabled'}>
              \${level >= def.max ? 'MAXED' : '💰 ' + cost}
            </button>
          </div>
        \`;

        const btn = el.querySelector('button');
        if (canBuy) {
          btn.onclick = () => {
            save.credits -= cost;
            save.upgrades[key]++;
            writeSave();
            refreshHub();
          };
        }

        UI.armoryList.appendChild(el);
      });
    }

    function renderSkills() {
      UI.skillGrid.innerHTML = '';
      UI.tokenCountLarge.textContent = save.tokens;

      for (const [key, def] of Object.entries(SKILLS)) {
        const lvl = save.skills[key];
        const maxed = lvl >= def.max;
        const cost = maxed ? 0 : def.cost[lvl];
        const canBuy = !maxed && save.tokens >= cost;

        const el = document.createElement('div');
        el.className = 'skillItem';
        el.innerHTML = \`
          <div style="font-size:18px;font-weight:900;">\${def.icon} \${def.name}</div>
          <div class="skillMeta">\${def.desc}<br>Level: \${lvl} / \${def.max}</div>
          <div style="margin-top:10px;">
            <button class="smallBtn" \${canBuy ? '' : 'disabled'}>
              \${maxed ? 'MAXED' : '🔮 ' + cost}
            </button>
          </div>
        \`;
        const btn = el.querySelector('button');
        if (canBuy) {
          btn.onclick = () => {
            save.tokens -= cost;
            save.skills[key]++;
            writeSave();
            refreshHub();
          };
        }
        UI.skillGrid.appendChild(el);
      }
    }

    function renderChests() {
      UI.chestGrid.innerHTML = '';
      for (const [type, def] of Object.entries(CHESTS)) {
        const count = save.chests[type] || 0;
        const el = document.createElement('div');
        el.className = 'chestItem' + (count <= 0 ? ' empty' : '');
        el.innerHTML = \`
          <div style="font-size:24px;font-weight:900;color:\${def.color};">\${def.icon} \${def.name}</div>
          <div class="chestMeta">Owned: x\${count}<br>Credits: \${def.credits[0]}-\${def.credits[1]}<br>Tokens: \${def.tokens[0]}-\${def.tokens[1]}</div>
          <div style="margin-top:10px;">
            <button class="smallBtn" \${count > 0 ? '' : 'disabled'}>OPEN</button>
          </div>
        \`;
        const btn = el.querySelector('button');
        if (count > 0) btn.onclick = () => openChest(type);
        UI.chestGrid.appendChild(el);
      }
    }

    function openChest(type) {
      if ((save.chests[type] || 0) <= 0) return;

      save.chests[type]--;
      const def = CHESTS[type];
      const credits = randint(def.credits[0], def.credits[1]);
      const tokens = randint(def.tokens[0], def.tokens[1]);
      const rewards = [];

      save.credits += credits;
      rewards.push({ text: '💰 +' + credits + ' Credits', color: '#ffd84d' });

      if (tokens > 0) {
        save.tokens += tokens;
        rewards.push({ text: '🔮 +' + tokens + ' Tokens', color: '#a855ff' });
      }

      if (Math.random() < 0.15 && type !== 'legendary') {
        const bonus = type === 'bronze' ? 'bronze' : type === 'silver' ? 'silver' : 'gold';
        save.chests[bonus]++;
        rewards.push({ text: CHESTS[bonus].icon + ' +1 ' + CHESTS[bonus].name, color: CHESTS[bonus].color });
      }

      writeSave();
      refreshHub();

      UI.chestRewardList.innerHTML = '';
      rewards.forEach(r => {
        const item = document.createElement('div');
        item.className = 'reward';
        item.style.color = r.color;
        item.textContent = r.text;
        UI.chestRewardList.appendChild(item);
      });

      UI.chestModal.classList.add('show');
    }

    function refreshHub() {
      UI.creditsText.textContent = save.credits.toLocaleString();
      UI.tokensText.textContent = save.tokens;
      UI.gamesPlayedText.textContent = save.stats.gamesPlayed;
      UI.bestScoreText.textContent = save.stats.bestScore.toLocaleString();
      UI.bestWaveText.textContent = save.stats.bestWave;
      renderDifficultyCards();
      renderArmory();
      renderSkills();
      renderChests();
    }

    document.querySelectorAll('.tabBtn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tabContent').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      };
    });

    document.getElementById('resetSaveBtn').onclick = () => {
      if (confirm('Reset all progress?')) resetSave();
    };
    document.getElementById('closeChestBtn').onclick = () => UI.chestModal.classList.remove('show');
    document.getElementById('resumeBtn').onclick = () => togglePause(false);
    document.getElementById('quitBtn').onclick = () => quitToHub();
    document.getElementById('returnHubBtn').onclick = () => returnToHub();
    document.getElementById('playBtn').onclick = () => startGame();

    const input = {
      keys: {},
      mouseX: innerWidth / 2,
      mouseY: innerHeight / 2,
      down: false
    };

    document.addEventListener('mousemove', e => {
      input.mouseX = e.clientX;
      input.mouseY = e.clientY;
      UI.crosshair.style.left = e.clientX + 'px';
      UI.crosshair.style.top = e.clientY + 'px';
    });

    document.addEventListener('mousedown', e => {
      if (e.button === 0 && state.mode === 'game' && !state.paused) input.down = true;
    });

    document.addEventListener('mouseup', e => {
      if (e.button === 0) input.down = false;
    });

    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      input.keys[k] = true;

      if (state.mode === 'game') {
        if (['w','a','s','d','r','e',' '].includes(k)) e.preventDefault();

        if (k === 'escape') {
          e.preventDefault();
          togglePause();
          return;
        }

        if (state.paused) return;

        if (k === '1') setWeapon(0);
        if (k === '2') setWeapon(1);
        if (k === '3') setWeapon(2);
        if (k === '4') setWeapon(3);

        if (k === 'r') startReload();
        if (k === 'e') throwGrenade();
        if (e.code === 'Space') dash();
      }
    });

    document.addEventListener('keyup', e => {
      input.keys[e.key.toLowerCase()] = false;
    });

    const state = {
      mode: 'hub',
      paused: false,
      cameraX: WORLD / 2,
      cameraY: WORLD / 2,
      score: 0,
      wave: 1,
      combo: 0,
      comboTimer: 0,
      difficulty: DIFFICULTIES.normal,
      waveCount: 0,
      waveSpawned: 0,
      waveTarget: 0,
      waveCooldown: 0,
      bossSpawned: false,
      worldShake: 0,
      gameTime: 0
    };

    const player = {
      x: WORLD / 2,
      y: WORLD / 2,
      radius: 18,
      angle: 0,
      speed: 4.2,
      hp: 100,
      maxHp: 100,
      weaponIndex: 0,
      shootCooldown: 0,
      reloadTime: 0,
      reloading: false,
      dashCooldown: 0,
      dashTimer: 0,
      dashing: false,
      dashAngle: 0,
      invincible: 0,
      grenades: 3,
      maxGrenades: 3
    };

    let weapons = [];
    let bullets = [];
    let enemies = [];
    let particles = [];
    let powerups = [];
    let enemyBullets = [];
    let grenades = [];

    function buildWeapons() {
      weapons = WEAPON_DEFS.map(w => ({ ...w, ammo: w.clip, maxAmmo: w.clip }));

      weapons[0].damage += save.upgrades.pistolDamage * 5;
      weapons[1].damage += save.upgrades.smgDamage * 3;
      weapons[2].damage += save.upgrades.shotgunDamage * 4;
      weapons[3].damage += save.upgrades.sniperDamage * 16;
    }

    function currentWeapon() {
      return weapons[player.weaponIndex];
    }

    function setWeapon(i) {
      if (i < 0 || i >= weapons.length) return;
      if (i !== 0 && weapons[i].ammo <= 0) return;
      player.weaponIndex = i;
      player.reloading = false;
      player.reloadTime = 0;
      updateWeaponUI();
    }

    function updateWeaponUI() {
      for (let i = 0; i < 4; i++) {
        document.getElementById('weapon' + i).classList.toggle('active', i === player.weaponIndex);
      }
      UI.ammo1.textContent = weapons[1] ? weapons[1].ammo : 0;
      UI.ammo2.textContent = weapons[2] ? weapons[2].ammo : 0;
      UI.ammo3.textContent = weapons[3] ? weapons[3].ammo : 0;
    }

    function showGameUI() {
      UI.hub.style.display = 'none';
      UI.hud.style.display = 'flex';
      UI.weaponPanel.style.display = 'flex';
      UI.healthWrap.style.display = 'block';
      UI.leftInfo.style.display = 'flex';
      UI.badge.style.display = 'block';
      UI.crosshair.style.display = 'block';
      document.body.style.cursor = 'none';
    }

    function showHubUI() {
      UI.hub.style.display = 'flex';
      UI.hud.style.display = 'none';
      UI.weaponPanel.style.display = 'none';
      UI.healthWrap.style.display = 'none';
      UI.leftInfo.style.display = 'none';
      UI.badge.style.display = 'none';
      UI.crosshair.style.display = 'none';
      document.body.style.cursor = 'default';
      UI.pauseOverlay.classList.remove('show');
      UI.gameOver.classList.remove('show');
      UI.damageFlash.style.opacity = 0;
      input.down = false;
    }

    function startGame() {
      state.mode = 'game';
      state.paused = false;
      state.score = 0;
      state.wave = 1;
      state.combo = 0;
      state.comboTimer = 0;
      state.waveCooldown = 0;
      state.gameTime = 0;
      state.bossSpawned = false;
      state.difficulty = DIFFICULTIES[save.selectedDifficulty] || DIFFICULTIES.normal;
      state.cameraX = WORLD / 2;
      state.cameraY = WORLD / 2;

      buildWeapons();
      bullets = [];
      enemies = [];
      particles = [];
      powerups = [];
      enemyBullets = [];
      grenades = [];

      player.x = WORLD / 2;
      player.y = WORLD / 2;
      player.speed = 4.2 + skillLevel('agility') * 0.5;
      player.maxHp = 100 + save.upgrades.maxHealth * 12 + skillLevel('vitality') * 20;
      player.hp = player.maxHp;
      player.weaponIndex = 0;
      player.shootCooldown = 0;
      player.reloading = false;
      player.reloadTime = 0;
      player.dashCooldown = 0;
      player.dashing = false;
      player.dashTimer = 0;
      player.invincible = 45;
      player.maxGrenades = 3 + save.upgrades.grenadeCap;
      player.grenades = player.maxGrenades;

      UI.badge.textContent = state.difficulty.label;
      UI.badge.style.color = state.difficulty.color;
      UI.badge.style.borderColor = state.difficulty.color + '66';

      showGameUI();
      updateWeaponUI();
      startWave();
    }

    function startWave() {
      state.waveTarget = Math.floor((8 + state.wave * 4) * state.difficulty.spawnRate);
      state.waveSpawned = 0;
      state.bossSpawned = false;
      state.waveCooldown = 0;
      UI.waveBanner.innerHTML = 'WAVE ' + state.wave;
      UI.waveBanner.classList.add('showBanner');
      setTimeout(() => UI.waveBanner.classList.remove('showBanner'), 1200);
    }

    function endGame() {
      state.mode = 'gameover';
      const rewardCredits = Math.floor(state.score * 0.012 * state.difficulty.rewards);
      const rewardTokens = Math.floor(state.wave / 4);
      const chestRewards = [];

      save.credits += rewardCredits;
      save.tokens += rewardTokens;
      save.stats.gamesPlayed++;

      if (state.score > save.stats.bestScore) save.stats.bestScore = state.score;
      if (state.wave > save.stats.bestWave) save.stats.bestWave = state.wave;

      if (state.wave >= 3) { save.chests.bronze++; chestRewards.push('bronze'); }
      if (state.wave >= 6) { save.chests.silver++; chestRewards.push('silver'); }
      if (state.wave >= 10) { save.chests.gold++; chestRewards.push('gold'); }
      if (state.wave >= 15) { save.chests.legendary++; chestRewards.push('legendary'); }

      writeSave();
      refreshHub();

      UI.goScore.textContent = 'Score: ' + state.score.toLocaleString();
      UI.goWave.textContent = 'Wave: ' + state.wave;
      UI.goReward.textContent = 'Rewards: 💰 ' + rewardCredits + '   🔮 ' + rewardTokens;
      UI.goChestRewards.innerHTML = '';
      chestRewards.forEach(type => {
        const el = document.createElement('div');
        el.className = 'reward';
        el.style.color = CHESTS[type].color;
        el.textContent = CHESTS[type].icon + ' +1 ' + CHESTS[type].name;
        UI.goChestRewards.appendChild(el);
      });

      UI.gameOver.classList.add('show');
      input.down = false;
    }

    function returnToHub() {
      state.mode = 'hub';
      showHubUI();
      refreshHub();
    }

    function quitToHub() {
      state.mode = 'hub';
      state.paused = false;
      showHubUI();
      refreshHub();
    }

    function togglePause(force) {
      if (state.mode !== 'game') return;
      state.paused = typeof force === 'boolean' ? force : !state.paused;
      UI.pauseOverlay.classList.toggle('show', state.paused);
      if (state.paused) {
        UI.crosshair.style.display = 'none';
        document.body.style.cursor = 'default';
        input.down = false;
      } else {
        UI.crosshair.style.display = 'block';
        document.body.style.cursor = 'none';
      }
    }

    function startReload() {
      const w = currentWeapon();
      if (!w || player.weaponIndex === 0 || player.reloading) return;
      if (w.ammo >= w.maxAmmo) return;
      player.reloading = true;
      player.reloadTime = w.reload;
      notify('RELOADING...', 'var(--orange)', 700);
    }

    function updateReload() {
      if (!player.reloading) return;
      player.reloadTime--;
      if (player.reloadTime <= 0) {
        player.reloading = false;
        currentWeapon().ammo = currentWeapon().maxAmmo;
        updateWeaponUI();
        notify('RELOADED', 'var(--orange)', 500);
      }
    }

    function dash() {
      if (player.dashing) return;
      if (player.dashCooldown > 0) return;

      let dx = 0;
      let dy = 0;
      if (input.keys['w']) dy -= 1;
      if (input.keys['s']) dy += 1;
      if (input.keys['a']) dx -= 1;
      if (input.keys['d']) dx += 1;

      if (dx === 0 && dy === 0) {
        dx = Math.cos(player.angle);
        dy = Math.sin(player.angle);
      }

      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      player.dashing = true;
      player.dashTimer = 8;
      player.dashAngle = Math.atan2(dy, dx);
      player.dashCooldown = Math.max(18, 90 - skillLevel('dashCore') * 12);
      player.invincible = Math.max(player.invincible, 10);
      notify('DASH', 'var(--cyan)', 400);
    }

    function throwGrenade() {
      if (player.grenades <= 0) return;
      player.grenades--;
      const tx = input.mouseX + state.cameraX - canvas.width / 2;
      const ty = input.mouseY + state.cameraY - canvas.height / 2;
      const a = Math.atan2(ty - player.y, tx - player.x);
      grenades.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(a) * 7,
        vy: Math.sin(a) * 7,
        timer: 52,
        radius: 120
      });
      UI.grenadeText.textContent = '💣 ' + player.grenades;
    }

    function makeExplosion(x, y, radius, damage) {
      state.worldShake = 8;
      for (let i = 0; i < 28; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(1.5, 6);
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: randint(18, 34),
          max: 34,
          color: ['#ff9b29','#ffd84d','#ff365f'][randint(0,2)],
          size: rand(2, 6)
        });
      }
      enemies.forEach(e => {
        if (dist(x, y, e.x, e.y) < radius) {
          e.hp -= damage;
          e.hit = 6;
          const s = worldToScreen(e.x, e.y);
          floatText('-' + Math.round(damage), s.x, s.y - 18, '#ffd84d', 16);
        }
      });
    }

    function dropPowerup(x, y) {
      const chance = 0.18 + skillLevel('scavenger') * 0.04;
      if (Math.random() > chance) return;

      const types = ['heal','ammo-smg','ammo-shotgun','ammo-sniper','grenade'];
      const type = types[randint(0, types.length - 1)];
      const map = {
        'heal': { color:'#32ff8a', label:'+HP' },
        'ammo-smg': { color:'#00ffd5', label:'+SMG' },
        'ammo-shotgun': { color:'#ff9b29', label:'+SG' },
        'ammo-sniper': { color:'#ff59d6', label:'+SN' },
        'grenade': { color:'#ffd84d', label:'+G' }
      };

      powerups.push({
        x, y,
        type,
        radius: 14,
        life: 520,
        bob: Math.random() * Math.PI * 2,
        ...map[type]
      });
    }

    function killEnemy(index) {
      const e = enemies[index];
      state.score += Math.floor(e.score * Math.max(1, state.combo));
      state.combo++;
      state.comboTimer = 120;

      dropPowerup(e.x, e.y);

      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(1, 4);
        particles.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: randint(16, 28),
          max: 28,
          color: e.color,
          size: rand(2, 5)
        });
      }

      enemies.splice(index, 1);
    }

    function fire() {
      if (player.reloading) return;
      const w = currentWeapon();
      if (player.shootCooldown > 0) return;

      if (player.weaponIndex !== 0 && w.ammo <= 0) {
        startReload();
        return;
      }

      const tx = input.mouseX + state.cameraX - canvas.width / 2;
      const ty = input.mouseY + state.cameraY - canvas.height / 2;
      const baseAngle = Math.atan2(ty - player.y, tx - player.x);
      const marksmanMult = 1 + skillLevel('marksman') * 0.10;

      player.shootCooldown = w.fireRate;

      if (player.weaponIndex !== 0) {
        w.ammo--;
        if (w.ammo <= 0) startReload();
      }

      for (let i = 0; i < w.pellets; i++) {
        const ang = baseAngle + rand(-w.spread, w.spread);
        bullets.push({
          x: player.x + Math.cos(baseAngle) * 20,
          y: player.y + Math.sin(baseAngle) * 20,
          vx: Math.cos(ang) * w.speed,
          vy: Math.sin(ang) * w.speed,
          damage: w.damage * marksmanMult,
          color: w.color,
          size: player.weaponIndex === 2 ? 4 : 3,
          life: 90,
          pierce: w.pierce
        });
      }

      state.worldShake = Math.max(state.worldShake, player.weaponIndex === 2 ? 5 : 2);
      updateWeaponUI();
    }

    function spawnEnemy() {
      const types = state.wave < 3
        ? ['grunt','runner']
        : state.wave < 6
        ? ['grunt','runner','tank']
        : ['grunt','runner','tank','shooter'];

      const type = types[randint(0, types.length - 1)];
      const def = ENEMY_TYPES[type];
      const ang = rand(0, Math.PI * 2);
      const distSpawn = rand(560, 840);

      const hpScale = state.difficulty.enemyHp;
      const spScale = state.difficulty.enemySpeed;
      const dmgScale = state.difficulty.enemyDamage;

      const x = clamp(player.x + Math.cos(ang) * distSpawn, 40, WORLD - 40);
      const y = clamp(player.y + Math.sin(ang) * distSpawn, 40, WORLD - 40);

      enemies.push({
        x, y,
        type,
        color: def.color,
        radius: def.radius,
        hp: (def.hp + state.wave * 9) * hpScale,
        maxHp: (def.hp + state.wave * 9) * hpScale,
        speed: (def.speed + state.wave * 0.03) * spScale,
        damage: def.damage * dmgScale,
        score: def.score,
        ranged: !!def.ranged,
        shotCd: randint(40, 90),
        hit: 0
      });
    }

    function spawnBoss() {
      const def = ENEMY_TYPES.boss;
      const ang = rand(0, Math.PI * 2);
      enemies.push({
        x: clamp(player.x + Math.cos(ang) * 780, 60, WORLD - 60),
        y: clamp(player.y + Math.sin(ang) * 780, 60, WORLD - 60),
        type: 'boss',
        color: def.color,
        radius: def.radius,
        hp: (def.hp + state.wave * 150) * state.difficulty.enemyHp,
        maxHp: (def.hp + state.wave * 150) * state.difficulty.enemyHp,
        speed: def.speed * state.difficulty.enemySpeed,
        damage: def.damage * state.difficulty.enemyDamage,
        score: def.score,
        ranged: true,
        shotCd: 28,
        hit: 0,
        boss: true
      });
      UI.bossBanner.classList.add('showBanner');
      setTimeout(() => UI.bossBanner.classList.remove('showBanner'), 1500);
    }

    function updateGame() {
      if (state.mode !== 'game' || state.paused) return;

      state.gameTime++;

      if (player.shootCooldown > 0) player.shootCooldown--;
      if (player.dashCooldown > 0) player.dashCooldown--;
      if (player.invincible > 0) player.invincible--;
      if (state.comboTimer > 0) state.comboTimer--;
      else state.combo = 0;

      updateReload();

      let mx = 0, my = 0;
      if (input.keys['w']) my -= 1;
      if (input.keys['s']) my += 1;
      if (input.keys['a']) mx -= 1;
      if (input.keys['d']) mx += 1;

      const worldMouseX = input.mouseX + state.cameraX - canvas.width / 2;
      const worldMouseY = input.mouseY + state.cameraY - canvas.height / 2;
      player.angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);

      if (player.dashing) {
        player.dashTimer--;
        player.x += Math.cos(player.dashAngle) * 16;
        player.y += Math.sin(player.dashAngle) * 16;
        if (player.dashTimer <= 0) player.dashing = false;
      } else {
        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my) || 1;
          player.x += (mx / len) * player.speed;
          player.y += (my / len) * player.speed;
        }
      }

      player.x = clamp(player.x, player.radius, WORLD - player.radius);
      player.y = clamp(player.y, player.radius, WORLD - player.radius);

      state.cameraX += (player.x - state.cameraX) * 0.1;
      state.cameraY += (player.y - state.cameraY) * 0.1;

      if (input.down) fire();

      if (state.waveSpawned < state.waveTarget) {
        if (state.gameTime % Math.max(10, Math.floor(30 / state.difficulty.spawnRate)) === 0) {
          spawnEnemy();
          state.waveSpawned++;
        }
      } else if (state.wave % 5 === 0 && !state.bossSpawned && enemies.length <= Math.floor(state.waveTarget * 0.5)) {
        spawnBoss();
        state.bossSpawned = true;
      } else if (enemies.length === 0) {
        state.waveCooldown++;
        if (state.waveCooldown > 70) {
          state.wave++;
          player.grenades = Math.min(player.maxGrenades, player.grenades + 1);
          startWave();
        }
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;

        let remove = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD;

        for (let j = enemies.length - 1; j >= 0 && !remove; j--) {
          const e = enemies[j];
          if (dist(b.x, b.y, e.x, e.y) < e.radius + b.size) {
            e.hp -= b.damage;
            e.hit = 5;
            const s = worldToScreen(e.x, e.y);
            floatText('-' + Math.round(b.damage), s.x, s.y - 16, b.color, 15);
            if (e.hp <= 0) killEnemy(j);
            if (!b.pierce) remove = true;
          }
        }

        if (remove) bullets.splice(i, 1);
      }

      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;

        if (dist(b.x, b.y, player.x, player.y) < player.radius + b.size && player.invincible <= 0) {
          const reduction = 1 - skillLevel('armor') * 0.08;
          const dmg = Math.max(1, b.damage * reduction);
          player.hp -= dmg;
          player.invincible = 18;
          damageFlash(0.45);
          floatText('-' + Math.round(dmg), input.mouseX, input.mouseY - 60, '#ff5f7f', 18);
          enemyBullets.splice(i, 1);
          continue;
        }

        if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > WORLD + 20 || b.y > WORLD + 20) {
          enemyBullets.splice(i, 1);
        }
      }

      for (let i = grenades.length - 1; i >= 0; i--) {
        const g = grenades[i];
        g.x += g.vx;
        g.y += g.vy;
        g.vx *= 0.97;
        g.vy *= 0.97;
        g.timer--;
        if (g.timer <= 0) {
          makeExplosion(g.x, g.y, g.radius, 110 + state.wave * 4);
          grenades.splice(i, 1);
        }
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.hit > 0) e.hit--;

        const ang = Math.atan2(player.y - e.y, player.x - e.x);
        const d = dist(e.x, e.y, player.x, player.y);

        if (e.ranged && !e.boss) {
          if (d > 240) {
            e.x += Math.cos(ang) * e.speed;
            e.y += Math.sin(ang) * e.speed;
          } else if (d < 180) {
            e.x -= Math.cos(ang) * e.speed * 0.6;
            e.y -= Math.sin(ang) * e.speed * 0.6;
          }

          e.shotCd--;
          if (e.shotCd <= 0) {
            e.shotCd = randint(60, 90);
            enemyBullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 5.8,
              vy: Math.sin(ang) * 5.8,
              damage: e.damage,
              size: 4,
              color: '#ff6b6b',
              life: 120
            });
          }
        } else if (e.boss) {
          e.x += Math.cos(ang) * e.speed;
          e.y += Math.sin(ang) * e.speed;
          e.shotCd--;
          if (e.shotCd <= 0) {
            e.shotCd = 34;
            for (let k = 0; k < 10; k++) {
              const a = (Math.PI * 2 / 10) * k + state.gameTime * 0.03;
              enemyBullets.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 5,
                vy: Math.sin(a) * 5,
                damage: e.damage,
                size: 5,
                color: '#ff365f',
                life: 120
              });
            }
          }
        } else {
          e.x += Math.cos(ang) * e.speed;
          e.y += Math.sin(ang) * e.speed;
        }

        e.x = clamp(e.x, e.radius, WORLD - e.radius);
        e.y = clamp(e.y, e.radius, WORLD - e.radius);

        if (dist(e.x, e.y, player.x, player.y) < e.radius + player.radius && player.invincible <= 0) {
          const reduction = 1 - skillLevel('armor') * 0.08;
          const dmg = Math.max(1, e.damage * reduction);
          player.hp -= dmg;
          player.invincible = 20;
          damageFlash(0.55);
          state.worldShake = 5;
        }
      }

      for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.life--;
        p.bob += 0.05;

        if (dist(p.x, p.y, player.x, player.y) < player.radius + p.radius + 12) {
          if (p.type === 'heal') {
            player.hp = Math.min(player.maxHp, player.hp + 34);
            notify('+34 HP', '#32ff8a', 700);
          }
          if (p.type === 'ammo-smg') {
            weapons[1].ammo = Math.min(weapons[1].maxAmmo, weapons[1].ammo + 40);
            notify('+40 SMG', '#00ffd5', 700);
          }
          if (p.type === 'ammo-shotgun') {
            weapons[2].ammo = Math.min(weapons[2].maxAmmo, weapons[2].ammo + 10);
            notify('+10 SHOTGUN', '#ff9b29', 700);
          }
          if (p.type === 'ammo-sniper') {
            weapons[3].ammo = Math.min(weapons[3].maxAmmo, weapons[3].ammo + 5);
            notify('+5 SNIPER', '#ff59d6', 700);
          }
          if (p.type === 'grenade') {
            player.grenades = Math.min(player.maxGrenades, player.grenades + 1);
            notify('+1 GRENADE', '#ffd84d', 700);
          }
          updateWeaponUI();
          powerups.splice(i, 1);
          continue;
        }

        if (p.life <= 0) powerups.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }

      if (player.hp <= 0) {
        player.hp = 0;
        endGame();
      }

      UI.scoreDisplay.textContent = state.score.toLocaleString();
      UI.waveDisplay.textContent = state.wave;
      UI.enemyDisplay.textContent = enemies.length;
      UI.comboDisplay.textContent = 'x' + Math.max(1, state.combo);
      UI.grenadeText.textContent = '💣 ' + player.grenades;
      UI.dashText.textContent = player.dashCooldown > 0 ? 'CD ' + player.dashCooldown : 'READY';

      const hpPct = player.hp / player.maxHp;
      UI.healthBar.style.width = Math.max(0, hpPct * 100) + '%';
      UI.healthText.textContent = 'HP ' + Math.round(player.hp) + ' / ' + player.maxHp;
      UI.healthBar.style.background =
        hpPct > 0.5 ? 'linear-gradient(90deg,#14ff7b,#6bffb0)'
        : hpPct > 0.25 ? 'linear-gradient(90deg,#ffb029,#ffd84d)'
        : 'linear-gradient(90deg,#ff365f,#ff6a7f)';
    }

    function worldToScreen(x, y) {
      return {
        x: x - state.cameraX + canvas.width / 2,
        y: y - state.cameraY + canvas.height / 2
      };
    }

    function renderGame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const shakeX = state.worldShake > 0 ? rand(-state.worldShake, state.worldShake) : 0;
      const shakeY = state.worldShake > 0 ? rand(-state.worldShake, state.worldShake) : 0;
      if (state.worldShake > 0) state.worldShake *= 0.84;
      if (state.worldShake < 0.25) state.worldShake = 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      const bg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width * 0.8);
      bg.addColorStop(0, '#0d1330');
      bg.addColorStop(1, '#050510');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grid = 80;
      ctx.strokeStyle = 'rgba(80,120,255,0.08)';
      ctx.lineWidth = 1;
      const ox = -((state.cameraX - canvas.width / 2) % grid);
      const oy = -((state.cameraY - canvas.height / 2) % grid);
      for (let x = ox; x < canvas.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = oy; y < canvas.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      const borderTL = worldToScreen(0,0);
      const borderBR = worldToScreen(WORLD,WORLD);
      ctx.strokeStyle = 'rgba(255,54,95,0.16)';
      ctx.lineWidth = 3;
      ctx.strokeRect(borderTL.x, borderTL.y, borderBR.x - borderTL.x, borderBR.y - borderTL.y);

      for (const p of particles) {
        const s = worldToScreen(p.x, p.y);
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const p of powerups) {
        const s = worldToScreen(p.x, p.y + Math.sin(p.bob) * 6);
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 28);
        grad.addColorStop(0, p.color + '66');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#081018';
        ctx.font = 'bold 10px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, s.x, s.y);
      }

      for (const b of bullets) {
        const s = worldToScreen(b.x, b.y);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, b.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const b of enemyBullets) {
        const s = worldToScreen(b.x, b.y);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, b.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const g of grenades) {
        const s = worldToScreen(g.x, g.y);
        ctx.fillStyle = '#ffd84d';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff9b29';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12, 0, Math.PI * 2 * (g.timer / 52));
        ctx.stroke();
      }

      for (const e of enemies) {
        const s = worldToScreen(e.x, e.y);
        ctx.save();
        ctx.translate(s.x, s.y);

        ctx.shadowColor = e.hit > 0 ? '#fff' : e.color;
        ctx.shadowBlur = e.hit > 0 ? 22 : 10;
        ctx.fillStyle = e.hit > 0 ? '#fff' : e.color;

        if (e.type === 'runner') {
          ctx.beginPath();
          ctx.moveTo(e.radius, 0);
          ctx.lineTo(-e.radius, e.radius * 0.75);
          ctx.lineTo(-e.radius, -e.radius * 0.75);
          ctx.closePath();
          ctx.fill();
        } else if (e.type === 'tank') {
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i;
            const x = Math.cos(a) * e.radius;
            const y = Math.sin(a) * e.radius;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        } else if (e.type === 'boss') {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = Math.PI * 2 / 10 * i - Math.PI / 2;
            const r = i % 2 === 0 ? e.radius : e.radius * 0.55;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
        ctx.shadowBlur = 0;

        if (e.hp < e.maxHp) {
          const w = Math.max(34, e.radius * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(s.x - w/2, s.y - e.radius - 14, w, 4);
          ctx.fillStyle = e.type === 'boss' ? '#ffd84d' : '#32ff8a';
          ctx.fillRect(s.x - w/2, s.y - e.radius - 14, w * (e.hp / e.maxHp), 4);
        }
      }

      const p = worldToScreen(player.x, player.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(player.angle);

      if (player.invincible > 0 && Math.floor(state.gameTime / 3) % 2 === 0) {
        ctx.globalAlpha = 0.65;
      }

      ctx.shadowColor = '#00ffd5';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#00d9ff';
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a6efff';
      ctx.fillRect(player.radius - 2, -4, 18, 8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    function loop() {
      requestAnimationFrame(loop);
      if (state.mode === 'hub') {
        renderHubParticles();
      } else if (state.mode === 'game') {
        updateGame();
        renderGame();
      } else if (state.mode === 'gameover') {
        renderGame();
      }
    }

    refreshHub();
    showHubUI();
    loop();
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`NEON BLASTER server running at http://localhost:${PORT}`);});
