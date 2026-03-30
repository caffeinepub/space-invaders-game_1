import { useCallback, useEffect, useRef } from "react";

// ─── Constants ─────────────────────────────────────────────────────────────
const CW = 800;
const CH = 700;
const HUD_H = 55;
const ALIEN_COLS = 11;
const ALIEN_ROWS = 5;
const ALIEN_W = 36;
const ALIEN_H = 28;
const ALIEN_SX = 60;
const ALIEN_SY = 48;
const ALIEN_START_X = 44;
const ALIEN_START_Y = HUD_H + 45;
const PLAYER_Y = CH - 60;
const PLAYER_W = 40;
const SHIELD_COUNT = 4;
const SHIELD_PX = 5;
const SHIELD_COLS_N = 12;
const SHIELD_ROWS_N = 8;
const UFO_Y = HUD_H + 18;
const BULLET_SPEED = 11;
const ALIEN_BULLET_SPEED = 3.5;
const PLAYER_SPEED = 5;

// ─── Types ──────────────────────────────────────────────────────────────────
type Screen = "START" | "PLAYING" | "GAME_OVER";

interface Alien {
  x: number;
  y: number;
  alive: boolean;
  type: 0 | 1 | 2; // 0=squid(top), 1=octopus(mid), 2=crab(bot)
}

interface Bullet {
  x: number;
  y: number;
  active: boolean;
}

interface AlienBullet {
  x: number;
  y: number;
  active: boolean;
  zigzag: number;
}

interface Shield {
  x: number;
  y: number;
  pixels: boolean[][];
}

interface UFO {
  x: number;
  y: number;
  active: boolean;
  dir: 1 | -1;
  pts: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  offset: number;
}

interface GameState {
  screen: Screen;
  score: number;
  hiScore: number;
  lives: number;
  wave: number;
  aliens: Alien[];
  alienDir: 1 | -1;
  alienSpeed: number;
  alienDropPending: boolean;
  alienFrameTimer: number;
  alienFrame: number;
  alienMoveTimer: number;
  alienShootTimer: number;
  alienShootInterval: number;
  playerX: number;
  playerInvincible: boolean;
  playerInvTimer: number;
  playerVisible: boolean;
  playerFlashTimer: number;
  playerBullets: Bullet[];
  alienBullets: AlienBullet[];
  shields: Shield[];
  ufo: UFO;
  ufoTimer: number;
  ufoNextSpawn: number;
  particles: Particle[];
  popups: Popup[];
  stars: Star[];
  waveClearTimer: number;
  showWaveClear: boolean;
  startAlienY: number;
}

// ─── Sound System ───────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
let ufoSoundInterval: ReturnType<typeof setInterval> | null = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext!
    )();
  }
}

function playShoot() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.linearRampToValueAtTime(440, now + 0.1);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.1);
  osc.start(now);
  osc.stop(now + 0.11);
}

function playAlienDeath() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * 0.25, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.6;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.35, now);
  src.start(now);
  const osc = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc.connect(g2);
  g2.connect(ctx.destination);
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(55, now + 0.25);
  g2.gain.setValueAtTime(0.18, now);
  g2.gain.linearRampToValueAtTime(0, now + 0.25);
  osc.start(now);
  osc.stop(now + 0.26);
}

function playPlayerDeath() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.linearRampToValueAtTime(55, now + 0.8);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.8);
  osc.start(now);
  osc.stop(now + 0.82);
}

function playUFODeath() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.linearRampToValueAtTime(900, now + 0.4);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.4);
  osc.start(now);
  osc.stop(now + 0.42);
}

function playGameOver() {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const notes = [440, 392, 349, 311, 262, 220];
  for (let i = 0; i < notes.length; i++) {
    const freq = notes[i];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now + i * 0.22);
    gain.gain.setValueAtTime(0.15, now + i * 0.22);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.22 + 0.2);
    osc.start(now + i * 0.22);
    osc.stop(now + i * 0.22 + 0.21);
  }
}

function startUFOSound() {
  stopUFOSound();
  let toggle = false;
  ufoSoundInterval = setInterval(() => {
    if (!audioCtx) return;
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(toggle ? 180 : 280, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.16);
    toggle = !toggle;
  }, 200);
}

function stopUFOSound() {
  if (ufoSoundInterval) {
    clearInterval(ufoSoundInterval);
    ufoSoundInterval = null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function createShields(): Shield[] {
  const shieldW = SHIELD_COLS_N * SHIELD_PX;
  const spacing = (CW - SHIELD_COUNT * shieldW) / (SHIELD_COUNT + 1);
  const shields: Shield[] = [];
  for (let i = 0; i < SHIELD_COUNT; i++) {
    const sx = spacing + i * (shieldW + spacing);
    const sy = PLAYER_Y - 110;
    const pixels: boolean[][] = Array.from({ length: SHIELD_ROWS_N }, (_, r) =>
      Array.from({ length: SHIELD_COLS_N }, (__, c) => {
        if (r < 3 && (c < 2 || c >= SHIELD_COLS_N - 2)) return false;
        if (r >= SHIELD_ROWS_N - 2 && c >= 4 && c <= 7) return false;
        return true;
      }),
    );
    shields.push({ x: sx, y: sy, pixels });
  }
  return shields;
}

function createAliens(startAlienY: number): Alien[] {
  const aliens: Alien[] = [];
  for (let row = 0; row < ALIEN_ROWS; row++) {
    for (let col = 0; col < ALIEN_COLS; col++) {
      const type: 0 | 1 | 2 = row === 0 ? 0 : row <= 2 ? 1 : 2;
      aliens.push({
        x: ALIEN_START_X + col * ALIEN_SX,
        y: startAlienY + row * ALIEN_SY,
        alive: true,
        type,
      });
    }
  }
  return aliens;
}

function createStars(): Star[] {
  return Array.from({ length: 120 }, () => ({
    x: Math.random() * CW,
    y: Math.random() * CH,
    r: Math.random() * 1.5 + 0.4,
    base: Math.random() * 0.5 + 0.3,
    speed: Math.random() * 0.025 + 0.005,
    offset: Math.random() * Math.PI * 2,
  }));
}

function createInitialState(): GameState {
  return {
    screen: "START",
    score: 0,
    hiScore: Number.parseInt(
      localStorage.getItem("spaceInvaders_highScore") || "0",
    ),
    lives: 3,
    wave: 1,
    aliens: createAliens(ALIEN_START_Y),
    alienDir: 1,
    alienSpeed: 1.5,
    alienDropPending: false,
    alienFrameTimer: 0,
    alienFrame: 0,
    alienMoveTimer: 0,
    alienShootTimer: 0,
    alienShootInterval: 1500,
    playerX: CW / 2,
    playerInvincible: false,
    playerInvTimer: 0,
    playerVisible: true,
    playerFlashTimer: 0,
    playerBullets: [],
    alienBullets: [],
    shields: createShields(),
    ufo: { x: -200, y: UFO_Y, active: false, dir: 1, pts: 100, speed: 2 },
    ufoTimer: 0,
    ufoNextSpawn: 15000 + Math.random() * 10000,
    particles: [],
    popups: [],
    stars: createStars(),
    waveClearTimer: 0,
    showWaveClear: false,
    startAlienY: ALIEN_START_Y,
  };
}

function resetForNewGame(gs: GameState): void {
  gs.score = 0;
  gs.lives = 3;
  gs.wave = 1;
  gs.alienDir = 1;
  gs.alienSpeed = 1.5;
  gs.alienDropPending = false;
  gs.alienFrameTimer = 0;
  gs.alienFrame = 0;
  gs.alienMoveTimer = 0;
  gs.alienShootTimer = 0;
  gs.alienShootInterval = 1500;
  gs.playerX = CW / 2;
  gs.playerInvincible = false;
  gs.playerInvTimer = 0;
  gs.playerVisible = true;
  gs.playerFlashTimer = 0;
  gs.playerBullets = [];
  gs.alienBullets = [];
  gs.shields = createShields();
  gs.ufo = { x: -200, y: UFO_Y, active: false, dir: 1, pts: 100, speed: 2 };
  gs.ufoTimer = 0;
  gs.ufoNextSpawn = 15000 + Math.random() * 10000;
  gs.particles = [];
  gs.popups = [];
  gs.waveClearTimer = 0;
  gs.showWaveClear = false;
  gs.startAlienY = ALIEN_START_Y;
  gs.aliens = createAliens(ALIEN_START_Y);
}

function resetWave(gs: GameState): void {
  gs.wave++;
  gs.alienDir = 1;
  gs.alienDropPending = false;
  gs.alienFrameTimer = 0;
  gs.alienFrame = 0;
  gs.alienMoveTimer = 0;
  gs.alienShootTimer = 0;
  gs.playerBullets = [];
  gs.alienBullets = [];
  gs.startAlienY = ALIEN_START_Y;
  gs.aliens = createAliens(ALIEN_START_Y);
  // Increase difficulty
  gs.alienSpeed = Math.min(1.5 + gs.wave * 0.4, 6);
  gs.alienShootInterval = Math.max(400, 1500 - gs.wave * 150);
}

function getAlienPoints(type: 0 | 1 | 2): number {
  return type === 0 ? 40 : type === 1 ? 20 : 10;
}

function aliveAliens(gs: GameState): Alien[] {
  return gs.aliens.filter((a) => a.alive);
}

function addExplosion(
  gs: GameState,
  x: number,
  y: number,
  color: string,
  count = 8,
) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3;
    gs.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 35 + Math.random() * 20,
      maxLife: 55,
      color,
      size: 1.5 + Math.random() * 2,
    });
  }
}

function addPopup(gs: GameState, x: number, y: number, text: string) {
  gs.popups.push({ x, y, text, life: 70, maxLife: 70 });
}

function shieldHit(shield: Shield, bx: number, by: number): boolean {
  const lx = bx - shield.x;
  const ly = by - shield.y;
  const col = Math.floor(lx / SHIELD_PX);
  const row = Math.floor(ly / SHIELD_PX);
  if (row < 0 || row >= SHIELD_ROWS_N || col < 0 || col >= SHIELD_COLS_N)
    return false;
  if (shield.pixels[row][col]) {
    shield.pixels[row][col] = false;
    // Erode neighboring pixels too (sometimes)
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];
    for (const [nr, nc] of neighbors) {
      if (
        nr >= 0 &&
        nr < SHIELD_ROWS_N &&
        nc >= 0 &&
        nc < SHIELD_COLS_N &&
        Math.random() < 0.4
      ) {
        shield.pixels[nr][nc] = false;
      }
    }
    return true;
  }
  return false;
}

// ─── Draw Helpers ────────────────────────────────────────────────────────────
function drawAlien(ctx: CanvasRenderingContext2D, alien: Alien, frame: number) {
  const { x, y, type } = alien;
  const f = frame % 2;
  ctx.shadowBlur = 8;

  if (type === 2) {
    // Crab - magenta
    ctx.fillStyle = "#FF4FD1";
    ctx.shadowColor = "#FF9BE8";
    if (f === 0) {
      ctx.fillRect(x + 6, y, 8, 4);
      ctx.fillRect(x + 2, y + 4, 16, 4);
      ctx.fillRect(x, y + 8, 20, 6);
      ctx.fillRect(x + 4, y + 14, 4, 4);
      ctx.fillRect(x + 12, y + 14, 4, 4);
      ctx.fillRect(x, y + 12, 4, 4);
      ctx.fillRect(x + 16, y + 12, 4, 4);
      // eyes
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 4, y + 10, 3, 3);
      ctx.fillRect(x + 13, y + 10, 3, 3);
    } else {
      ctx.fillRect(x + 6, y, 8, 4);
      ctx.fillRect(x + 2, y + 4, 16, 4);
      ctx.fillRect(x, y + 8, 20, 6);
      ctx.fillRect(x + 2, y + 14, 4, 4);
      ctx.fillRect(x + 14, y + 14, 4, 4);
      ctx.fillRect(x + 2, y + 8, 2, 6);
      ctx.fillRect(x + 16, y + 8, 2, 6);
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 4, y + 10, 3, 3);
      ctx.fillRect(x + 13, y + 10, 3, 3);
    }
  } else if (type === 1) {
    // Octopus - green
    ctx.fillStyle = "#38FF6F";
    ctx.shadowColor = "#A6FFD0";
    if (f === 0) {
      ctx.fillRect(x + 6, y, 8, 4);
      ctx.fillRect(x + 2, y + 4, 16, 4);
      ctx.fillRect(x, y + 8, 20, 6);
      ctx.fillRect(x + 2, y + 14, 4, 4);
      ctx.fillRect(x + 14, y + 14, 4, 4);
      ctx.fillRect(x, y + 14, 2, 4);
      ctx.fillRect(x + 18, y + 14, 2, 4);
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 4, y + 10, 3, 3);
      ctx.fillRect(x + 13, y + 10, 3, 3);
    } else {
      ctx.fillRect(x + 6, y, 8, 4);
      ctx.fillRect(x + 2, y + 4, 16, 4);
      ctx.fillRect(x, y + 8, 20, 6);
      ctx.fillRect(x + 0, y + 14, 4, 4);
      ctx.fillRect(x + 16, y + 14, 4, 4);
      ctx.fillRect(x + 4, y + 18, 2, 3);
      ctx.fillRect(x + 14, y + 18, 2, 3);
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 4, y + 10, 3, 3);
      ctx.fillRect(x + 13, y + 10, 3, 3);
    }
  } else {
    // Squid - cyan
    ctx.fillStyle = "#40F3FF";
    ctx.shadowColor = "#40F3FF";
    if (f === 0) {
      ctx.fillRect(x + 8, y, 4, 4);
      ctx.fillRect(x + 4, y + 4, 12, 4);
      ctx.fillRect(x + 2, y + 8, 16, 6);
      ctx.fillRect(x + 2, y + 14, 4, 4);
      ctx.fillRect(x + 14, y + 14, 4, 4);
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 5, y + 10, 3, 3);
      ctx.fillRect(x + 12, y + 10, 3, 3);
    } else {
      ctx.fillRect(x + 8, y, 4, 4);
      ctx.fillRect(x + 4, y + 4, 12, 4);
      ctx.fillRect(x + 2, y + 8, 16, 6);
      ctx.fillRect(x + 4, y + 14, 4, 4);
      ctx.fillRect(x + 12, y + 14, 4, 4);
      ctx.fillRect(x, y + 10, 3, 3);
      ctx.fillRect(x + 17, y + 10, 3, 3);
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.fillRect(x + 5, y + 10, 3, 3);
      ctx.fillRect(x + 12, y + 10, 3, 3);
    }
  }
  ctx.shadowBlur = 0;
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = "#40F3FF";
  ctx.shadowColor = "#40F3FF";
  ctx.shadowBlur = 14;
  // base
  ctx.fillRect(x - PLAYER_W / 2, PLAYER_Y + 12, PLAYER_W, 8);
  // cockpit
  ctx.fillRect(x - 5, PLAYER_Y + 4, 10, 12);
  // nose
  ctx.fillRect(x - 2, PLAYER_Y, 4, 6);
  // left wing
  ctx.beginPath();
  ctx.moveTo(x - PLAYER_W / 2, PLAYER_Y + 20);
  ctx.lineTo(x - PLAYER_W / 2 - 6, PLAYER_Y + 20);
  ctx.lineTo(x - PLAYER_W / 2, PLAYER_Y + 12);
  ctx.fill();
  // right wing
  ctx.beginPath();
  ctx.moveTo(x + PLAYER_W / 2, PLAYER_Y + 20);
  ctx.lineTo(x + PLAYER_W / 2 + 6, PLAYER_Y + 20);
  ctx.lineTo(x + PLAYER_W / 2, PLAYER_Y + 12);
  ctx.fill();
  // engine glow
  ctx.fillStyle = "#FFE95A";
  ctx.shadowColor = "#FFE95A";
  ctx.shadowBlur = 10;
  ctx.fillRect(x - 5, PLAYER_Y + 20, 10, 3);
  ctx.shadowBlur = 0;
}

function drawUFO(ctx: CanvasRenderingContext2D, ufo: UFO) {
  ctx.shadowColor = "#FF4A4A";
  ctx.shadowBlur = 18;
  // hull
  ctx.fillStyle = "#FF4A4A";
  ctx.beginPath();
  ctx.ellipse(ufo.x, ufo.y, 30, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // dome
  ctx.fillStyle = "#FF9BE8";
  ctx.shadowColor = "#FF9BE8";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(ufo.x, ufo.y - 7, 16, 9, 0, Math.PI, 0);
  ctx.fill();
  // lights
  ctx.fillStyle = "#FFE95A";
  ctx.shadowColor = "#FFE95A";
  ctx.shadowBlur = 6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(ufo.x + i * 10, ufo.y + 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawShield(ctx: CanvasRenderingContext2D, shield: Shield) {
  ctx.shadowBlur = 0;
  for (let r = 0; r < SHIELD_ROWS_N; r++) {
    for (let c = 0; c < SHIELD_COLS_N; c++) {
      if (shield.pixels[r][c]) {
        ctx.fillStyle = "#36FF7A";
        ctx.fillRect(
          shield.x + c * SHIELD_PX,
          shield.y + r * SHIELD_PX,
          SHIELD_PX - 1,
          SHIELD_PX - 1,
        );
      }
    }
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  hiScore: number,
  lives: number,
  wave: number,
) {
  // Background bar
  ctx.fillStyle = "rgba(7, 10, 20, 0.85)";
  ctx.fillRect(0, 0, CW, HUD_H);
  ctx.strokeStyle = "#1A2136";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H);
  ctx.lineTo(CW, HUD_H);
  ctx.stroke();

  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textBaseline = "middle";

  // Score
  ctx.fillStyle = "#A8ADBE";
  ctx.shadowBlur = 0;
  ctx.fillText("SCORE", 16, 18);
  ctx.fillStyle = "#36FF7A";
  ctx.shadowColor = "#36FF7A";
  ctx.shadowBlur = 8;
  ctx.fillText(score.toString().padStart(5, "0"), 16, 38);

  // Hi-score
  ctx.fillStyle = "#A8ADBE";
  ctx.shadowBlur = 0;
  const hiTxt = "HI-SCORE";
  const hiW = ctx.measureText(hiTxt).width;
  ctx.fillText(hiTxt, CW / 2 - hiW / 2, 18);
  ctx.fillStyle = "#FFE95A";
  ctx.shadowColor = "#FFE95A";
  ctx.shadowBlur = 8;
  const hiValTxt = hiScore.toString().padStart(5, "0");
  const hiValW = ctx.measureText(hiValTxt).width;
  ctx.fillText(hiValTxt, CW / 2 - hiValW / 2, 38);

  // Wave
  ctx.fillStyle = "#A8ADBE";
  ctx.shadowBlur = 0;
  ctx.fillText(`WAVE ${wave}`, CW - 200, 18);

  // Lives
  ctx.fillStyle = "#FF4FD1";
  ctx.shadowColor = "#FF4FD1";
  ctx.shadowBlur = 8;
  let heartsX = CW - 200;
  for (let i = 0; i < lives; i++) {
    ctx.fillText("\u2665", heartsX + i * 22, 38);
  }
  ctx.shadowBlur = 0;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function SpaceInvaders() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState>(createInitialState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const canShootRef = useRef(true);
  const shootCooldownRef = useRef(0);

  const handleRestart = useCallback(() => {
    const gs = gsRef.current;
    resetForNewGame(gs);
    gs.screen = "PLAYING";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // ── Main Loop ──────────────────────────────────────────────────────────
    const loop = (ts: number) => {
      const dt = Math.min(ts - lastTRef.current, 50);
      lastTRef.current = ts;
      const gs = gsRef.current;

      // ── Background ────────────────────────────────────────────────────
      ctx.fillStyle = "#070A14";
      ctx.fillRect(0, 0, CW, CH);

      // Faint grid
      ctx.strokeStyle = "rgba(26, 33, 54, 0.4)";
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < CW; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, CH);
        ctx.stroke();
      }
      for (let gy = 0; gy < CH; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(CW, gy);
        ctx.stroke();
      }

      // Stars
      for (const s of gs.stars) {
        const op = s.base + Math.sin(ts * s.speed + s.offset) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.05, Math.min(1, op))})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (gs.screen === "START") {
        drawStart(ctx, gs, ts);
      } else if (gs.screen === "PLAYING") {
        updateGame(gs, dt, ts);
        drawGame(ctx, gs, ts);
      } else if (gs.screen === "GAME_OVER") {
        drawGame(ctx, gs, ts);
        drawGameOver(ctx, gs, ts);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Key Handlers ────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        ensureAudio();
        const gs = gsRef.current;
        if (gs.screen === "START") {
          resetForNewGame(gs);
          gs.screen = "PLAYING";
        } else if (gs.screen === "PLAYING" && canShootRef.current) {
          const active = gs.playerBullets.filter((b) => b.active);
          if (active.length < 3) {
            gs.playerBullets.push({
              x: gs.playerX,
              y: PLAYER_Y,
              active: true,
            });
            playShoot();
            canShootRef.current = false;
            shootCooldownRef.current = 150;
          }
        }
      }
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)
      ) {
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      if (e.code === "Space") canShootRef.current = true;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // ── Update Logic (inside closure, but called from loop) ──────────────────
  function updateGame(gs: GameState, dt: number, _ts: number) {
    // Shoot cooldown
    if (shootCooldownRef.current > 0) {
      shootCooldownRef.current -= dt;
      if (shootCooldownRef.current <= 0) {
        canShootRef.current = true;
        shootCooldownRef.current = 0;
      }
    }

    // Wave clear countdown
    if (gs.showWaveClear) {
      gs.waveClearTimer -= dt;
      if (gs.waveClearTimer <= 0) {
        gs.showWaveClear = false;
        resetWave(gs);
      }
      // Still update particles/popups but pause game logic
      updateParticles(gs, dt);
      return;
    }

    // Player movement
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("KeyA")) {
      gs.playerX = Math.max(PLAYER_W / 2 + 10, gs.playerX - PLAYER_SPEED);
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("KeyD")) {
      gs.playerX = Math.min(CW - PLAYER_W / 2 - 10, gs.playerX + PLAYER_SPEED);
    }

    // Player invincibility
    if (gs.playerInvincible) {
      gs.playerInvTimer -= dt;
      gs.playerFlashTimer += dt;
      if (gs.playerFlashTimer >= 100) {
        gs.playerVisible = !gs.playerVisible;
        gs.playerFlashTimer = 0;
      }
      if (gs.playerInvTimer <= 0) {
        gs.playerInvincible = false;
        gs.playerVisible = true;
        gs.playerFlashTimer = 0;
      }
    }

    // Alien frame animation
    gs.alienFrameTimer += dt;
    if (gs.alienFrameTimer >= 500) {
      gs.alienFrame = (gs.alienFrame + 1) % 2;
      gs.alienFrameTimer = 0;
    }

    // Alien movement
    const alive = aliveAliens(gs);
    if (alive.length === 0) {
      // Wave clear!
      stopUFOSound();
      gs.ufo.active = false;
      gs.showWaveClear = true;
      gs.waveClearTimer = 2500;
      return;
    }

    const speedMultiplier =
      1 + (1 - alive.length / (ALIEN_COLS * ALIEN_ROWS)) * 3;
    const effectiveSpeed = gs.alienSpeed * speedMultiplier;

    gs.alienMoveTimer += dt;
    const moveInterval = Math.max(16, 80 - effectiveSpeed * 8);
    if (gs.alienMoveTimer >= moveInterval) {
      gs.alienMoveTimer = 0;

      if (gs.alienDropPending) {
        gs.alienDropPending = false;
        for (const a of gs.aliens) {
          if (a.alive) a.y += 20;
        }
        gs.alienDir = gs.alienDir === 1 ? -1 : 1;
      } else {
        let hitWall = false;
        for (const a of gs.aliens) {
          if (a.alive) {
            a.x += gs.alienDir * effectiveSpeed;
            if (a.x <= 10 || a.x >= CW - 10 - ALIEN_W) hitWall = true;
          }
        }
        if (hitWall) gs.alienDropPending = true;
      }
    }

    // Check if any alien reached the player
    for (const a of alive) {
      if (a.y + ALIEN_H >= PLAYER_Y && !gs.playerInvincible) {
        hitPlayer(gs);
        break;
      }
    }

    // Alien shooting
    gs.alienShootTimer += dt;
    const shootInterval =
      gs.alienShootInterval *
      (0.5 + (alive.length / (ALIEN_COLS * ALIEN_ROWS)) * 0.5);
    if (gs.alienShootTimer >= shootInterval) {
      gs.alienShootTimer = 0;
      // Get bottom-most alien in random column
      const columns: Map<number, Alien> = new Map();
      for (const a of alive) {
        const col = Math.round((a.x - ALIEN_START_X) / ALIEN_SX);
        const existing = columns.get(col);
        if (!existing || a.y > existing.y) columns.set(col, a);
      }
      const shooters = Array.from(columns.values());
      if (shooters.length > 0) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        gs.alienBullets.push({
          x: shooter.x + ALIEN_W / 2,
          y: shooter.y + ALIEN_H,
          active: true,
          zigzag: 0,
        });
      }
    }

    // UFO spawning
    gs.ufoTimer += dt;
    if (!gs.ufo.active && gs.ufoTimer >= gs.ufoNextSpawn) {
      gs.ufoTimer = 0;
      gs.ufoNextSpawn = 15000 + Math.random() * 10000;
      gs.ufo.active = true;
      gs.ufo.dir = Math.random() > 0.5 ? 1 : -1;
      gs.ufo.x = gs.ufo.dir === 1 ? -40 : CW + 40;
      gs.ufo.speed = 1.5 + Math.random() * 1.5;
      const ptOptions = [50, 100, 150, 200, 300];
      gs.ufo.pts = ptOptions[Math.floor(Math.random() * ptOptions.length)];
      startUFOSound();
    }

    if (gs.ufo.active) {
      gs.ufo.x += gs.ufo.dir * gs.ufo.speed;
      if (gs.ufo.x > CW + 60 || gs.ufo.x < -60) {
        gs.ufo.active = false;
        stopUFOSound();
      }
    }

    // Update player bullets
    for (const b of gs.playerBullets) {
      if (!b.active) continue;
      b.y -= BULLET_SPEED;
      if (b.y < HUD_H) {
        b.active = false;
        continue;
      }

      // vs aliens
      let hit = false;
      for (const a of gs.aliens) {
        if (!a.alive) continue;
        if (
          b.x >= a.x &&
          b.x <= a.x + ALIEN_W &&
          b.y >= a.y &&
          b.y <= a.y + ALIEN_H
        ) {
          a.alive = false;
          b.active = false;
          const pts = getAlienPoints(a.type);
          gs.score += pts;
          if (gs.score > gs.hiScore) {
            gs.hiScore = gs.score;
            localStorage.setItem("spaceInvaders_highScore", String(gs.hiScore));
          }
          addExplosion(
            gs,
            a.x + ALIEN_W / 2,
            a.y + ALIEN_H / 2,
            a.type === 2 ? "#FF4FD1" : a.type === 1 ? "#38FF6F" : "#40F3FF",
          );
          addPopup(gs, a.x + ALIEN_W / 2, a.y, `+${pts}`);
          playAlienDeath();
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // vs UFO
      if (
        gs.ufo.active &&
        Math.abs(b.x - gs.ufo.x) < 32 &&
        Math.abs(b.y - gs.ufo.y) < 14
      ) {
        gs.ufo.active = false;
        stopUFOSound();
        b.active = false;
        gs.score += gs.ufo.pts;
        if (gs.score > gs.hiScore) {
          gs.hiScore = gs.score;
          localStorage.setItem("spaceInvaders_highScore", String(gs.hiScore));
        }
        addExplosion(gs, gs.ufo.x, gs.ufo.y, "#FF4A4A", 12);
        addPopup(gs, gs.ufo.x, gs.ufo.y - 20, `+${gs.ufo.pts}`);
        playUFODeath();
        continue;
      }

      // vs shields
      for (const shield of gs.shields) {
        if (
          b.x >= shield.x &&
          b.x <= shield.x + SHIELD_COLS_N * SHIELD_PX &&
          b.y >= shield.y &&
          b.y <= shield.y + SHIELD_ROWS_N * SHIELD_PX
        ) {
          if (shieldHit(shield, b.x, b.y)) {
            b.active = false;
            break;
          }
        }
      }
    }
    gs.playerBullets = gs.playerBullets.filter((b) => b.active);

    // Update alien bullets
    for (const b of gs.alienBullets) {
      if (!b.active) continue;
      b.y += ALIEN_BULLET_SPEED;
      b.zigzag += 0.2;
      if (b.y > CH) {
        b.active = false;
        continue;
      }

      // vs player
      if (
        !gs.playerInvincible &&
        gs.playerVisible &&
        Math.abs(b.x - gs.playerX) < PLAYER_W / 2 + 2 &&
        b.y >= PLAYER_Y &&
        b.y <= PLAYER_Y + 24
      ) {
        b.active = false;
        hitPlayer(gs);
        continue;
      }

      // vs shields
      for (const shield of gs.shields) {
        if (
          b.x >= shield.x &&
          b.x <= shield.x + SHIELD_COLS_N * SHIELD_PX &&
          b.y >= shield.y &&
          b.y <= shield.y + SHIELD_ROWS_N * SHIELD_PX
        ) {
          if (shieldHit(shield, b.x, b.y)) {
            b.active = false;
            break;
          }
        }
      }
    }
    gs.alienBullets = gs.alienBullets.filter((b) => b.active);

    updateParticles(gs, dt);
  }

  function hitPlayer(gs: GameState) {
    gs.lives--;
    addExplosion(gs, gs.playerX, PLAYER_Y + 10, "#40F3FF", 12);
    playPlayerDeath();
    if (gs.lives <= 0) {
      gs.screen = "GAME_OVER";
      stopUFOSound();
      playGameOver();
    } else {
      gs.playerInvincible = true;
      gs.playerInvTimer = 2000;
      gs.playerFlashTimer = 0;
    }
  }

  function updateParticles(gs: GameState, dt: number) {
    for (const p of gs.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= dt * 0.05;
    }
    gs.particles = gs.particles.filter((p) => p.life > 0);

    for (const pop of gs.popups) {
      pop.y -= 0.5;
      pop.life -= dt * 0.05;
    }
    gs.popups = gs.popups.filter((p) => p.life > 0);
  }

  // ── Draw Game ──────────────────────────────────────────────────────────
  function drawGame(ctx: CanvasRenderingContext2D, gs: GameState, ts: number) {
    // Shields
    for (const shield of gs.shields) {
      drawShield(ctx, shield);
    }

    // Aliens
    for (const a of gs.aliens) {
      if (a.alive) drawAlien(ctx, a, gs.alienFrame);
    }

    // UFO
    if (gs.ufo.active) drawUFO(ctx, gs.ufo);

    // Player bullets
    for (const b of gs.playerBullets) {
      if (!b.active) continue;
      ctx.fillStyle = "#36FF7A";
      ctx.shadowColor = "#36FF7A";
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x - 2, b.y - 10, 4, 12);
      ctx.shadowBlur = 0;
    }

    // Alien bullets (zigzag)
    for (const b of gs.alienBullets) {
      if (!b.active) continue;
      const zx = Math.sin(b.zigzag) * 4;
      ctx.fillStyle = "#FF4A4A";
      ctx.shadowColor = "#FF4A4A";
      ctx.shadowBlur = 6;
      ctx.fillRect(b.x + zx - 2, b.y - 6, 4, 10);
      ctx.shadowBlur = 0;
    }

    // Player
    if (gs.playerVisible) {
      drawPlayer(ctx, gs.playerX);
    }

    // Ground line
    ctx.strokeStyle = "#36FF7A";
    ctx.shadowColor = "#36FF7A";
    ctx.shadowBlur = 4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, PLAYER_Y + 26);
    ctx.lineTo(CW, PLAYER_Y + 26);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Particles
    for (const p of gs.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // Score popups
    for (const pop of gs.popups) {
      const a = Math.max(0, pop.life / pop.maxLife);
      ctx.globalAlpha = a;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = "#FFE95A";
      ctx.shadowColor = "#FFE95A";
      ctx.shadowBlur = 6;
      ctx.textBaseline = "middle";
      ctx.fillText(
        pop.text,
        pop.x - ctx.measureText(pop.text).width / 2,
        pop.y,
      );
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // Wave clear overlay
    if (gs.showWaveClear) {
      const blink = Math.floor(ts / 200) % 2 === 0;
      if (blink) {
        ctx.fillStyle = "rgba(7,10,20,0.6)";
        ctx.fillRect(0, HUD_H, CW, CH - HUD_H);
        ctx.font = '24px "Press Start 2P", monospace';
        ctx.fillStyle = "#36FF7A";
        ctx.shadowColor = "#A6FFD0";
        ctx.shadowBlur = 20;
        ctx.textBaseline = "middle";
        const txt = "WAVE CLEAR!";
        ctx.fillText(txt, CW / 2 - ctx.measureText(txt).width / 2, CH / 2);
        ctx.shadowBlur = 0;
      }
    }

    drawHUD(ctx, gs.score, gs.hiScore, gs.lives, gs.wave);
  }

  // ── Start Screen ───────────────────────────────────────────────────────
  function drawStart(ctx: CanvasRenderingContext2D, gs: GameState, ts: number) {
    // Title
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#36FF7A";
    ctx.shadowColor = "#A6FFD0";
    ctx.shadowBlur = 24;
    const title = "SPACE INVADERS";
    ctx.fillText(title, CW / 2 - ctx.measureText(title).width / 2, 130);
    ctx.shadowBlur = 0;

    // Animated demo aliens marching
    const marchOffset = Math.sin(ts * 0.0015) * 60;
    const demoTypes: Array<0 | 1 | 2> = [2, 1, 0];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        const dAlien: Alien = {
          x: 80 + col * 75 + marchOffset,
          y: 200 + row * 55,
          alive: true,
          type: demoTypes[row],
        };
        drawAlien(ctx, dAlien, gs.alienFrame);
      }
    }

    // Score table
    ctx.font = '8px "Press Start 2P", monospace';
    const table: Array<{ type: 0 | 1 | 2; pts: string }> = [
      { type: 0, pts: "= 40 PTS" },
      { type: 1, pts: "= 20 PTS" },
      { type: 2, pts: "= 10 PTS" },
    ];
    for (let i = 0; i < table.length; i++) {
      const { type, pts } = table[i];
      const ty = 400 + i * 38;
      drawAlien(ctx, { x: CW / 2 - 130, y: ty, alive: true, type }, 0);
      ctx.fillStyle = "#E8EAF2";
      ctx.shadowBlur = 0;
      ctx.fillText(pts, CW / 2 - 85, ty + 12);
    }

    // UFO mystery
    drawUFO(ctx, {
      x: CW / 2 + 80,
      y: 412,
      active: true,
      dir: 1,
      pts: 0,
      speed: 0,
    });
    ctx.fillStyle = "#E8EAF2";
    ctx.shadowBlur = 0;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("= ??? PTS", CW / 2 - 85 + 165, 424);

    // Controls
    ctx.fillStyle = "#A8ADBE";
    ctx.font = '8px "Press Start 2P", monospace';
    const c1 = "\u2190 \u2192  MOVE     SPACE  SHOOT";
    ctx.fillText(c1, CW / 2 - ctx.measureText(c1).width / 2, 550);

    // Hi-score
    ctx.fillStyle = "#FFE95A";
    ctx.shadowColor = "#FFE95A";
    ctx.shadowBlur = 6;
    ctx.font = '8px "Press Start 2P", monospace';
    const hs = `HI-SCORE: ${gs.hiScore.toString().padStart(5, "0")}`;
    ctx.fillText(hs, CW / 2 - ctx.measureText(hs).width / 2, 590);
    ctx.shadowBlur = 0;

    // Blink press space
    if (Math.floor(ts / 500) % 2 === 0) {
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = "#36FF7A";
      ctx.shadowColor = "#36FF7A";
      ctx.shadowBlur = 12;
      const ps = "PRESS SPACE TO START";
      ctx.fillText(ps, CW / 2 - ctx.measureText(ps).width / 2, 638);
      ctx.shadowBlur = 0;
    }

    // Footer
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = "rgba(168,173,190,0.5)";
    ctx.shadowBlur = 0;
    const footer = `\u00A9 ${new Date().getFullYear()}. Built with love using caffeine.ai`;
    ctx.fillText(footer, CW / 2 - ctx.measureText(footer).width / 2, CH - 10);
  }

  // ── Game Over Screen ───────────────────────────────────────────────────
  function drawGameOver(
    ctx: CanvasRenderingContext2D,
    gs: GameState,
    ts: number,
  ) {
    // Dark overlay
    ctx.fillStyle = "rgba(5,6,19,0.82)";
    ctx.fillRect(0, HUD_H, CW, CH - HUD_H);

    // Panel
    ctx.fillStyle = "rgba(10,11,26,0.95)";
    ctx.strokeStyle = "#FF4FD1";
    ctx.lineWidth = 2;
    const panelX = CW / 2 - 240;
    const panelY = CH / 2 - 160;
    ctx.fillRect(panelX, panelY, 480, 320);
    ctx.strokeRect(panelX, panelY, 480, 320);
    ctx.shadowColor = "#FF4FD1";
    ctx.shadowBlur = 12;
    ctx.strokeRect(panelX, panelY, 480, 320);
    ctx.shadowBlur = 0;

    // GAME OVER
    ctx.font = '30px "Press Start 2P", monospace';
    ctx.fillStyle = "#FF4FD1";
    ctx.shadowColor = "#FF9BE8";
    ctx.shadowBlur = 22;
    ctx.textBaseline = "middle";
    const go = "GAME OVER";
    ctx.fillText(go, CW / 2 - ctx.measureText(go).width / 2, panelY + 60);
    ctx.shadowBlur = 0;

    // Score
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillStyle = "#E8EAF2";
    const scTxt = `SCORE: ${gs.score.toString().padStart(5, "0")}`;
    ctx.fillText(
      scTxt,
      CW / 2 - ctx.measureText(scTxt).width / 2,
      panelY + 120,
    );

    // Hi-score
    ctx.fillStyle = "#FFE95A";
    ctx.shadowColor = "#FFE95A";
    ctx.shadowBlur = 8;
    const hiTxt = `HI-SCORE: ${gs.hiScore.toString().padStart(5, "0")}`;
    ctx.fillText(
      hiTxt,
      CW / 2 - ctx.measureText(hiTxt).width / 2,
      panelY + 155,
    );
    ctx.shadowBlur = 0;

    // Wave reached
    ctx.fillStyle = "#A8ADBE";
    ctx.font = '9px "Press Start 2P", monospace';
    const waveTxt = `WAVE ${gs.wave} REACHED`;
    ctx.fillText(
      waveTxt,
      CW / 2 - ctx.measureText(waveTxt).width / 2,
      panelY + 190,
    );

    // INSERT COIN blink
    if (Math.floor(ts / 600) % 2 === 0) {
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = "#A8ADBE";
      const ic = "INSERT COIN";
      ctx.fillText(ic, CW / 2 - ctx.measureText(ic).width / 2, panelY + 228);
    }

    // Restart button
    const btnW = 220;
    const btnH = 40;
    const btnX = CW / 2 - btnW / 2;
    const btnY = panelY + 255;
    ctx.fillStyle = "#36FF7A";
    ctx.shadowColor = "#36FF7A";
    ctx.shadowBlur = 14;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.shadowBlur = 0;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = "#070A14";
    const rb = "RESTART";
    ctx.fillText(rb, CW / 2 - ctx.measureText(rb).width / 2, btnY + btnH / 2);
  }

  // Canvas click handler for restart
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const gs = gsRef.current;
      if (gs.screen !== "GAME_OVER") return;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const scaleX = CW / rect.width;
      const scaleY = CH / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const panelY = CH / 2 - 160;
      const btnW = 220;
      const btnH = 40;
      const btnX = CW / 2 - btnW / 2;
      const btnY = panelY + 255;
      if (cx >= btnX && cx <= btnX + btnW && cy >= btnY && cy <= btnY + btnH) {
        ensureAudio();
        handleRestart();
      }
    },
    [handleRestart],
  );

  // Also handle Space on game over
  useEffect(() => {
    const onSpace = (e: KeyboardEvent) => {
      if (e.code === "Space" && gsRef.current.screen === "GAME_OVER") {
        e.preventDefault();
        ensureAudio();
        handleRestart();
      }
    };
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [handleRestart]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#050613",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        onClick={handleCanvasClick}
        onKeyDown={
          handleCanvasClick as unknown as React.KeyboardEventHandler<HTMLCanvasElement>
        }
        data-ocid="game.canvas_target"
        style={{
          display: "block",
          maxWidth: "100vw",
          maxHeight: "100vh",
          objectFit: "contain",
          cursor: gsRef.current.screen === "GAME_OVER" ? "pointer" : "default",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
