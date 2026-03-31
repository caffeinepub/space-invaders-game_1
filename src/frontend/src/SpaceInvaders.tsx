import { useCallback, useEffect, useRef } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const CW = 800;
const CH = 700;
const HUD_H = 55;
const ALIEN_COLS = 11;
const ALIEN_ROWS = 5;
const ALIEN_W = 44;
const ALIEN_H = 32;
const ALIEN_SX = 60;
const ALIEN_SY = 52;
const ALIEN_START_X = 60;
const ALIEN_START_Y = HUD_H + 55;
const PLAYER_Y = CH - 58;
const PLAYER_W = 48;
const PLAYER_H = 28;
const SHIELD_COUNT = 4;
const SHIELD_COLS_N = 14;
const SHIELD_ROWS_N = 9;
const SHIELD_PX = 5;
const UFO_Y = HUD_H + 20;
const BULLET_SPEED = 13;
const ALIEN_BULLET_SPEED_BASE = 3.2;
const PLAYER_SPEED = 5;

// ─── Types ──────────────────────────────────────────────────────────────────
type Screen = "START" | "PLAYING" | "GAME_OVER";

interface Alien {
  x: number;
  y: number;
  alive: boolean;
  type: 0 | 1 | 2;
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
  frame: number;
}

interface ShieldPixel {
  alive: boolean;
}

interface Shield {
  x: number;
  y: number;
  pixels: ShieldPixel[][];
}

interface UFO {
  x: number;
  active: boolean;
  dir: 1 | -1;
  pts: number;
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
  phase: number;
  speed: number;
}

interface GameState {
  screen: Screen;
  score: number;
  hiScore: number;
  lives: number;
  wave: number;
  tick: number;
  // Aliens
  aliens: Alien[];
  alienDir: 1 | -1;
  alienStep: number;
  alienMarchTick: number;
  alienMarchPhase: number;
  alienBulletCooldown: number;
  alienBullets: AlienBullet[];
  // Player
  playerX: number;
  playerAlive: boolean;
  playerRespawnTick: number;
  bullet: Bullet;
  // Shields
  shields: Shield[];
  // UFO
  ufo: UFO;
  ufoCooldown: number;
  // Effects
  particles: Particle[];
  popups: Popup[];
  flashTick: number;
  stars: Star[];
  // Audio
  marchNote: number;
  // Blinking for start/gameover
  blinkTick: number;
  // Wave transition
  waveBannerTick: number;
}

// ─── Shield template ────────────────────────────────────────────────────────
function makeShieldPixels(): ShieldPixel[][] {
  const rows: ShieldPixel[][] = [];
  for (let r = 0; r < SHIELD_ROWS_N; r++) {
    const row: ShieldPixel[] = [];
    for (let c = 0; c < SHIELD_COLS_N; c++) {
      // Cut out corners to make classic arch shape
      let alive = true;
      if (r >= SHIELD_ROWS_N - 3 && c >= 3 && c <= SHIELD_COLS_N - 4)
        alive = false; // inner notch
      if (r === 0 && (c === 0 || c === SHIELD_COLS_N - 1)) alive = false;
      if (r <= 1 && (c === 0 || c === SHIELD_COLS_N - 1)) alive = false;
      row.push({ alive });
    }
    rows.push(row);
  }
  return rows;
}

function makeShields(): Shield[] {
  const shields: Shield[] = [];
  const spacing = CW / (SHIELD_COUNT + 1);
  const sy = PLAYER_Y - 110;
  for (let i = 0; i < SHIELD_COUNT; i++) {
    const sx = spacing * (i + 1) - (SHIELD_COLS_N * SHIELD_PX) / 2;
    shields.push({ x: sx, y: sy, pixels: makeShieldPixels() });
  }
  return shields;
}

function makeAliens(): Alien[] {
  const aliens: Alien[] = [];
  for (let r = 0; r < ALIEN_ROWS; r++) {
    const type = r === 0 ? 0 : r <= 2 ? 2 : 1; // squid top, octopus mid, crab bottom
    for (let c = 0; c < ALIEN_COLS; c++) {
      aliens.push({
        x: ALIEN_START_X + c * ALIEN_SX,
        y: ALIEN_START_Y + r * ALIEN_SY,
        alive: true,
        type: type as 0 | 1 | 2,
      });
    }
  }
  return aliens;
}

function initialState(): GameState {
  const hiScore = Number.parseInt(localStorage.getItem("si_hi") ?? "0", 10);
  const stars: Star[] = [];
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: Math.random() * CW,
      y: Math.random() * CH,
      r: Math.random() * 1.4 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.04 + 0.01,
    });
  }
  return {
    screen: "START",
    score: 0,
    hiScore,
    lives: 3,
    wave: 1,
    tick: 0,
    aliens: makeAliens(),
    alienDir: 1,
    alienStep: 0,
    alienMarchTick: 0,
    alienMarchPhase: 0,
    alienBulletCooldown: 90,
    alienBullets: [],
    playerX: CW / 2,
    playerAlive: true,
    playerRespawnTick: 0,
    bullet: { x: 0, y: 0, active: false },
    shields: makeShields(),
    ufo: { x: -80, active: false, dir: 1, pts: 100 },
    ufoCooldown: 600 + Math.floor(Math.random() * 400),
    particles: [],
    popups: [],
    flashTick: 0,
    stars,
    marchNote: 0,
    blinkTick: 0,
    waveBannerTick: 0,
  };
}

// ─── Audio ───────────────────────────────────────────────────────────────────
function createAudio(): AudioContext | null {
  try {
    return new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext | null,
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  vol = 0.18,
) {
  if (!ctx) return;
  try {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    g.connect(ctx.destination);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch {}
}

function playNoise(ctx: AudioContext | null, duration: number, vol = 0.15) {
  if (!ctx) return;
  try {
    const bufSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  } catch {}
}

const MARCH_FREQS = [160, 130, 100, 80];

function playMarch(ctx: AudioContext | null, note: number) {
  playTone(ctx, MARCH_FREQS[note % 4], 0.12, "square", 0.12);
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────
function drawAlien(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: 0 | 1 | 2,
  frame: number,
) {
  const cx = x + ALIEN_W / 2;
  const cy = y + ALIEN_H / 2;
  ctx.save();

  if (type === 0) {
    // Squid — top row, magenta
    ctx.fillStyle = "#ff55ff";
    // Body (round)
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - 6, cy - 5, 3, 3);
    ctx.fillRect(cx + 3, cy - 5, 3, 3);
    // Antennae
    ctx.fillStyle = "#ff55ff";
    ctx.fillRect(cx - 9, cy - 14, 2, 5);
    ctx.fillRect(cx + 7, cy - 14, 2, 5);
    ctx.fillRect(cx - 12, cy - 18, 3, 4);
    ctx.fillRect(cx + 9, cy - 18, 3, 4);
    // Tentacles
    if (frame === 0) {
      ctx.fillRect(cx - 13, cy + 5, 3, 5);
      ctx.fillRect(cx - 7, cy + 5, 3, 5);
      ctx.fillRect(cx + 4, cy + 5, 3, 5);
      ctx.fillRect(cx + 10, cy + 5, 3, 5);
    } else {
      ctx.fillRect(cx - 14, cy + 4, 3, 6);
      ctx.fillRect(cx - 6, cy + 6, 3, 4);
      ctx.fillRect(cx + 3, cy + 6, 3, 4);
      ctx.fillRect(cx + 11, cy + 4, 3, 6);
    }
  } else if (type === 1) {
    // Crab — bottom rows, cyan
    ctx.fillStyle = "#44ffff";
    // Body
    ctx.fillRect(cx - 14, cy - 6, 28, 14);
    ctx.fillRect(cx - 10, cy - 11, 20, 7);
    // Claws
    if (frame === 0) {
      ctx.fillRect(cx - 20, cy - 3, 8, 10);
      ctx.fillRect(cx + 12, cy - 3, 8, 10);
    } else {
      ctx.fillRect(cx - 22, cy - 8, 8, 10);
      ctx.fillRect(cx + 14, cy - 8, 8, 10);
    }
    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - 7, cy - 9, 3, 4);
    ctx.fillRect(cx + 4, cy - 9, 3, 4);
    // Legs
    ctx.fillStyle = "#44ffff";
    ctx.fillRect(cx - 12, cy + 7, 3, 6);
    ctx.fillRect(cx - 4, cy + 7, 3, 6);
    ctx.fillRect(cx + 1, cy + 7, 3, 6);
    ctx.fillRect(cx + 9, cy + 7, 3, 6);
  } else {
    // Octopus — mid rows, yellow-green
    ctx.fillStyle = "#aaff44";
    // Head dome
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 12, Math.PI, 0);
    ctx.fill();
    // Body
    ctx.fillRect(cx - 12, cy - 4, 24, 10);
    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - 7, cy - 8, 4, 4);
    ctx.fillRect(cx + 3, cy - 8, 4, 4);
    // Tentacles
    ctx.fillStyle = "#aaff44";
    if (frame === 0) {
      ctx.fillRect(cx - 14, cy + 5, 4, 7);
      ctx.fillRect(cx - 6, cy + 5, 4, 7);
      ctx.fillRect(cx + 2, cy + 5, 4, 7);
      ctx.fillRect(cx + 10, cy + 5, 4, 7);
    } else {
      ctx.fillRect(cx - 15, cy + 7, 4, 7);
      ctx.fillRect(cx - 5, cy + 3, 4, 7);
      ctx.fillRect(cx + 1, cy + 3, 4, 7);
      ctx.fillRect(cx + 11, cy + 7, 4, 7);
    }
  }
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  alive: boolean,
  tick: number,
) {
  if (!alive) return;
  const px = x - PLAYER_W / 2;
  ctx.save();
  // Flicker when spawning
  const alpha = 1;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#33ff33";
  // Body
  ctx.fillRect(px + 4, PLAYER_Y + 8, PLAYER_W - 8, 18);
  // Cannon
  ctx.fillRect(px + PLAYER_W / 2 - 3, PLAYER_Y, 6, 12);
  // Wings
  ctx.fillRect(px, PLAYER_Y + 14, 12, 12);
  ctx.fillRect(px + PLAYER_W - 12, PLAYER_Y + 14, 12, 12);
  // Detail
  ctx.fillStyle = "#00aa00";
  ctx.fillRect(px + 8, PLAYER_Y + 10, PLAYER_W - 16, 8);
  ctx.restore();
  void tick;
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(b.x - 2, b.y - 9, 4, 10);
}

function drawAlienBullet(ctx: CanvasRenderingContext2D, b: AlienBullet) {
  ctx.fillStyle = "#ff4444";
  const zx = Math.sin(b.frame * 0.4) * 3;
  ctx.fillRect(b.x + zx - 2, b.y - 8, 4, 10);
}

function drawShields(ctx: CanvasRenderingContext2D, shields: Shield[]) {
  ctx.fillStyle = "#33ff44";
  for (const sh of shields) {
    for (let r = 0; r < SHIELD_ROWS_N; r++) {
      for (let c = 0; c < SHIELD_COLS_N; c++) {
        if (sh.pixels[r][c].alive) {
          ctx.fillRect(
            sh.x + c * SHIELD_PX,
            sh.y + r * SHIELD_PX,
            SHIELD_PX - 1,
            SHIELD_PX - 1,
          );
        }
      }
    }
  }
}

function drawUFO(ctx: CanvasRenderingContext2D, ufo: UFO) {
  if (!ufo.active) return;
  ctx.save();
  ctx.fillStyle = "#ff2222";
  // Saucer body
  ctx.beginPath();
  ctx.ellipse(ufo.x, UFO_Y + 8, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Dome
  ctx.fillStyle = "#ff8888";
  ctx.beginPath();
  ctx.ellipse(ufo.x, UFO_Y + 4, 14, 8, 0, Math.PI, 0);
  ctx.fill();
  // Windows
  ctx.fillStyle = "#fff";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(ufo.x + i * 8, UFO_Y + 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPopups(ctx: CanvasRenderingContext2D, popups: Popup[]) {
  for (const p of popups) {
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'GeistMono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  score: number,
  hiScore: number,
  wave: number,
  lives: number,
  playerX: number,
) {
  // Background
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, CW, HUD_H);
  // Separator line
  ctx.strokeStyle = "#33ff44";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H - 1);
  ctx.lineTo(CW, HUD_H - 1);
  ctx.stroke();
  // Score
  ctx.fillStyle = "#aaffaa";
  ctx.font = "12px 'GeistMono', monospace";
  ctx.textAlign = "left";
  ctx.fillText("SCORE", 20, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'GeistMono', monospace";
  ctx.fillText(String(score).padStart(6, "0"), 20, 42);
  // Hi-score
  ctx.fillStyle = "#aaffaa";
  ctx.font = "12px 'GeistMono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("HI-SCORE", CW / 2, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'GeistMono', monospace";
  ctx.fillText(String(hiScore).padStart(6, "0"), CW / 2, 42);
  // Wave
  ctx.fillStyle = "#aaffaa";
  ctx.font = "12px 'GeistMono', monospace";
  ctx.textAlign = "right";
  ctx.fillText("WAVE", CW - 20, 18);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'GeistMono', monospace";
  ctx.fillText(String(wave), CW - 20, 42);
  // Lives
  ctx.fillStyle = "#33ff33";
  for (let i = 0; i < lives; i++) {
    const lx = 22 + i * 36;
    const ly = HUD_H - 12;
    // mini ship
    ctx.fillRect(lx - 8, ly + 2, 16, 7);
    ctx.fillRect(lx - 2, ly - 2, 4, 5);
  }
  void playerX;
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], tick: number) {
  for (const s of stars) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(tick * s.speed + s.phase));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Collision helpers ────────────────────────────────────────────────────────
function bulletHitsShields(
  bx: number,
  by: number,
  shields: Shield[],
  isAlien: boolean,
): boolean {
  for (const sh of shields) {
    for (let r = 0; r < SHIELD_ROWS_N; r++) {
      for (let c = 0; c < SHIELD_COLS_N; c++) {
        if (!sh.pixels[r][c].alive) continue;
        const px = sh.x + c * SHIELD_PX;
        const py = sh.y + r * SHIELD_PX;
        if (
          bx >= px &&
          bx <= px + SHIELD_PX &&
          by >= py &&
          by <= py + SHIELD_PX
        ) {
          sh.pixels[r][c].alive = false;
          // Crater effect — destroy neighbours
          const spread = isAlien ? 1 : 1;
          for (let dr = -spread; dr <= spread; dr++) {
            for (let dc = -spread; dc <= spread; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (
                nr >= 0 &&
                nr < SHIELD_ROWS_N &&
                nc >= 0 &&
                nc < SHIELD_COLS_N
              ) {
                if (Math.random() < 0.6) sh.pixels[nr][nc].alive = false;
              }
            }
          }
          return true;
        }
      }
    }
  }
  return false;
}

function spawnExplosion(
  particles: Particle[],
  x: number,
  y: number,
  color: string,
  count = 12,
) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color,
      size: Math.random() * 4 + 2,
    });
  }
}

// ─── Wave speed ──────────────────────────────────────────────────────────────
function alienMarchInterval(aliveCount: number, wave: number): number {
  const base = Math.max(4, 60 - wave * 5);
  const factor = Math.max(0.1, aliveCount / (ALIEN_COLS * ALIEN_ROWS));
  return Math.max(4, Math.floor(base * factor));
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function SpaceInvaders() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState>(initialState());
  const keysRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const startGame = useCallback((gs: GameState) => {
    const hi = gs.hiScore;
    const stars = gs.stars;
    const next = initialState();
    next.screen = "PLAYING";
    next.hiScore = hi;
    next.stars = stars;
    return next;
  }, []);

  const nextWave = useCallback((gs: GameState) => {
    gs.wave++;
    gs.aliens = makeAliens();
    gs.alienDir = 1;
    gs.alienStep = 0;
    gs.alienMarchTick = 0;
    gs.alienBullets = [];
    gs.bullet.active = false;
    gs.ufo.active = false;
    gs.ufoCooldown = 500 + Math.floor(Math.random() * 400);
    gs.waveBannerTick = 120;
  }, []);

  const loop = useCallback(() => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    gs.tick++;
    gs.blinkTick++;

    // ── Input on start/gameover ──────────────────────────────────────────────
    if (gs.screen === "START" && keysRef.current.has(" ")) {
      keysRef.current.delete(" ");
      gsRef.current = startGame(gs);
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    if (gs.screen === "GAME_OVER" && keysRef.current.has(" ")) {
      keysRef.current.delete(" ");
      gsRef.current = startGame(gs);
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // ── Game logic ───────────────────────────────────────────────────────────
    if (gs.screen === "PLAYING") {
      // Wave banner countdown
      if (gs.waveBannerTick > 0) {
        gs.waveBannerTick--;
      }

      const aliveAliens = gs.aliens.filter((a) => a.alive);
      const aliveCount = aliveAliens.length;

      // Player movement
      if (gs.playerAlive) {
        if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) {
          gs.playerX = Math.max(PLAYER_W / 2 + 4, gs.playerX - PLAYER_SPEED);
        }
        if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) {
          gs.playerX = Math.min(
            CW - PLAYER_W / 2 - 4,
            gs.playerX + PLAYER_SPEED,
          );
        }
        // Shoot
        if (keysRef.current.has(" ") && !gs.bullet.active) {
          keysRef.current.delete(" ");
          gs.bullet = { x: gs.playerX, y: PLAYER_Y, active: true };
          playTone(audioRef.current, 880, 0.08, "square", 0.15);
        }
      }

      // Player bullet movement
      if (gs.bullet.active) {
        gs.bullet.y -= BULLET_SPEED;
        if (gs.bullet.y < HUD_H) {
          gs.bullet.active = false;
        } else {
          // Hit shield
          if (bulletHitsShields(gs.bullet.x, gs.bullet.y, gs.shields, false)) {
            gs.bullet.active = false;
          } else {
            // Hit alien
            let hit = false;
            for (const alien of gs.aliens) {
              if (!alien.alive) continue;
              if (
                gs.bullet.x >= alien.x - 4 &&
                gs.bullet.x <= alien.x + ALIEN_W + 4 &&
                gs.bullet.y >= alien.y - 4 &&
                gs.bullet.y <= alien.y + ALIEN_H + 4
              ) {
                alien.alive = false;
                gs.bullet.active = false;
                const pts = alien.type === 0 ? 30 : alien.type === 1 ? 10 : 20;
                gs.score += pts;
                if (gs.score > gs.hiScore) {
                  gs.hiScore = gs.score;
                  localStorage.setItem("si_hi", String(gs.hiScore));
                }
                spawnExplosion(
                  gs.particles,
                  alien.x + ALIEN_W / 2,
                  alien.y + ALIEN_H / 2,
                  alien.type === 0
                    ? "#ff88ff"
                    : alien.type === 1
                      ? "#88ffff"
                      : "#aaff44",
                  14,
                );
                gs.popups.push({
                  x: alien.x + ALIEN_W / 2,
                  y: alien.y,
                  text: `+${pts}`,
                  life: 1,
                  maxLife: 1,
                });
                playNoise(audioRef.current, 0.18, 0.2);
                hit = true;
                break;
              }
            }
            // Hit UFO
            if (!hit && gs.ufo.active) {
              if (
                Math.abs(gs.bullet.x - gs.ufo.x) < 28 &&
                Math.abs(gs.bullet.y - UFO_Y) < 14
              ) {
                gs.ufo.active = false;
                gs.bullet.active = false;
                gs.score += gs.ufo.pts;
                if (gs.score > gs.hiScore) {
                  gs.hiScore = gs.score;
                  localStorage.setItem("si_hi", String(gs.hiScore));
                }
                spawnExplosion(gs.particles, gs.ufo.x, UFO_Y, "#ff4444", 18);
                gs.popups.push({
                  x: gs.ufo.x,
                  y: UFO_Y - 10,
                  text: `+${gs.ufo.pts}`,
                  life: 1,
                  maxLife: 1,
                });
                playTone(audioRef.current, 440, 0.5, "sawtooth", 0.25);
              }
            }
          }
        }
      }

      // Alien marching
      gs.alienMarchTick++;
      const marchInterval = alienMarchInterval(aliveCount, gs.wave);
      if (gs.alienMarchTick >= marchInterval) {
        gs.alienMarchTick = 0;
        gs.alienMarchPhase = (gs.alienMarchPhase + 1) % 2;
        // Play march sound
        gs.marchNote = (gs.marchNote + 1) % 4;
        playMarch(audioRef.current, gs.marchNote);

        // Check if grid needs to drop
        let dropDown = false;
        const step = 6 + Math.min(gs.wave * 0.5, 4);
        for (const alien of aliveAliens) {
          if (gs.alienDir === 1 && alien.x + ALIEN_W >= CW - 8) {
            dropDown = true;
            break;
          }
          if (gs.alienDir === -1 && alien.x <= 8) {
            dropDown = true;
            break;
          }
        }
        if (dropDown) {
          for (const alien of gs.aliens) {
            alien.y += 18;
          }
          gs.alienDir = gs.alienDir === 1 ? -1 : 1;
        } else {
          for (const alien of gs.aliens) {
            alien.x += gs.alienDir * step;
          }
        }
      }

      // Check aliens reached bottom
      for (const alien of aliveAliens) {
        if (alien.y + ALIEN_H >= PLAYER_Y - 10) {
          // Game over
          gs.screen = "GAME_OVER";
          playNoise(audioRef.current, 1.0, 0.3);
          break;
        }
      }

      // Alien bullet fire
      const bulletSpeed = ALIEN_BULLET_SPEED_BASE + gs.wave * 0.3;
      gs.alienBulletCooldown--;
      if (gs.alienBulletCooldown <= 0 && aliveCount > 0) {
        const cooldownBase = Math.max(20, 70 - gs.wave * 6);
        gs.alienBulletCooldown = cooldownBase + Math.floor(Math.random() * 30);
        // Pick random alive alien from bottom row of each column
        const cols: Record<number, Alien> = {};
        for (const alien of aliveAliens) {
          const col = Math.round((alien.x - ALIEN_START_X) / ALIEN_SX);
          if (!cols[col] || alien.y > cols[col].y) cols[col] = alien;
        }
        const candidates = Object.values(cols);
        if (candidates.length > 0) {
          const shooter =
            candidates[Math.floor(Math.random() * candidates.length)];
          gs.alienBullets.push({
            x: shooter.x + ALIEN_W / 2,
            y: shooter.y + ALIEN_H,
            active: true,
            zigzag: 0,
            frame: 0,
          });
        }
      }

      // Move alien bullets
      for (const ab of gs.alienBullets) {
        if (!ab.active) continue;
        ab.y += bulletSpeed;
        ab.frame++;
        if (ab.y > CH) {
          ab.active = false;
          continue;
        }
        // Hit shield
        if (bulletHitsShields(ab.x, ab.y, gs.shields, true)) {
          ab.active = false;
          continue;
        }
        // Hit player
        if (
          gs.playerAlive &&
          Math.abs(ab.x - gs.playerX) < PLAYER_W / 2 + 4 &&
          ab.y >= PLAYER_Y - 4 &&
          ab.y <= PLAYER_Y + PLAYER_H + 4
        ) {
          ab.active = false;
          gs.lives--;
          gs.flashTick = 30;
          spawnExplosion(
            gs.particles,
            gs.playerX,
            PLAYER_Y + PLAYER_H / 2,
            "#33ff33",
            20,
          );
          playNoise(audioRef.current, 0.6, 0.3);
          if (gs.lives <= 0) {
            gs.playerAlive = false;
            gs.screen = "GAME_OVER";
          } else {
            gs.playerAlive = false;
            gs.playerRespawnTick = 90;
          }
        }
      }
      gs.alienBullets = gs.alienBullets.filter((b) => b.active);

      // Player respawn
      if (!gs.playerAlive && gs.screen === "PLAYING") {
        gs.playerRespawnTick--;
        if (gs.playerRespawnTick <= 0) {
          gs.playerAlive = true;
          gs.playerX = CW / 2;
        }
      }

      // UFO logic
      gs.ufoCooldown--;
      if (gs.ufoCooldown <= 0 && !gs.ufo.active) {
        gs.ufo.active = true;
        gs.ufo.dir = Math.random() < 0.5 ? 1 : -1;
        gs.ufo.x = gs.ufo.dir === 1 ? -40 : CW + 40;
        gs.ufo.pts = [50, 100, 150, 200, 250, 300][
          Math.floor(Math.random() * 6)
        ];
        gs.ufoCooldown = 600 + Math.floor(Math.random() * 500);
      }
      if (gs.ufo.active) {
        gs.ufo.x += gs.ufo.dir * 2.5;
        // UFO sound
        if (gs.tick % 10 === 0) {
          playTone(
            audioRef.current,
            gs.tick % 20 === 0 ? 220 : 280,
            0.09,
            "sawtooth",
            0.07,
          );
        }
        if (gs.ufo.x > CW + 60 || gs.ufo.x < -60) {
          gs.ufo.active = false;
        }
      }

      // Particles
      for (const p of gs.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.025;
      }
      gs.particles = gs.particles.filter((p) => p.life > 0);

      // Popups
      for (const p of gs.popups) {
        p.y -= 1;
        p.life -= 0.025;
      }
      gs.popups = gs.popups.filter((p) => p.life > 0);

      // Flash
      if (gs.flashTick > 0) gs.flashTick--;

      // Check wave cleared
      if (aliveCount === 0) {
        nextWave(gs);
      }
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, CW, CH);

    // Background
    if (gs.flashTick > 0 && gs.tick % 4 < 2) {
      ctx.fillStyle = "#220000";
    } else {
      ctx.fillStyle = "#020510";
    }
    ctx.fillRect(0, 0, CW, CH);

    // Stars
    drawStars(ctx, gs.stars, gs.tick);

    if (gs.screen === "START") {
      drawHUD(ctx, 0, gs.hiScore, 1, 3, CW / 2);
      // Title
      ctx.fillStyle = "#33ff44";
      ctx.font = "bold 56px 'GeistMono', monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#33ff44";
      ctx.shadowBlur = 20;
      ctx.fillText("SPACE INVADERS", CW / 2, CH / 2 - 100);
      ctx.shadowBlur = 0;
      // Score guide
      const guide = [
        { type: 0 as const, pts: "= 30 PTS" },
        { type: 2 as const, pts: "= 20 PTS" },
        { type: 1 as const, pts: "= 10 PTS" },
      ];
      guide.forEach((g, i) => {
        const gy = CH / 2 - 20 + i * 60;
        drawAlien(ctx, CW / 2 - 70, gy - 16, g.type, 0);
        ctx.fillStyle = "#ffffff";
        ctx.font = "18px 'GeistMono', monospace";
        ctx.textAlign = "left";
        ctx.fillText(g.pts, CW / 2 - 10, gy + 4);
      });
      // Blink
      if (Math.floor(gs.blinkTick / 30) % 2 === 0) {
        ctx.fillStyle = "#ffff44";
        ctx.font = "bold 22px 'GeistMono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("PRESS SPACE TO START", CW / 2, CH - 70);
      }
    } else if (gs.screen === "GAME_OVER") {
      drawHUD(ctx, gs.score, gs.hiScore, gs.wave, gs.lives, gs.playerX);
      drawStars(ctx, gs.stars, gs.tick);
      ctx.fillStyle = "#ff2222";
      ctx.font = "bold 64px 'GeistMono', monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = "#ff2222";
      ctx.shadowBlur = 24;
      ctx.fillText("GAME OVER", CW / 2, CH / 2 - 60);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "24px 'GeistMono', monospace";
      ctx.fillText(`SCORE: ${gs.score}`, CW / 2, CH / 2 + 10);
      ctx.fillText(`BEST:  ${gs.hiScore}`, CW / 2, CH / 2 + 50);
      if (Math.floor(gs.blinkTick / 30) % 2 === 0) {
        ctx.fillStyle = "#ffff44";
        ctx.font = "bold 22px 'GeistMono', monospace";
        ctx.fillText("PRESS SPACE TO RESTART", CW / 2, CH / 2 + 110);
      }
    } else {
      // PLAYING
      drawHUD(ctx, gs.score, gs.hiScore, gs.wave, gs.lives, gs.playerX);

      // Wave banner
      if (gs.waveBannerTick > 0) {
        const a = Math.min(1, gs.waveBannerTick / 30);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = "#ffff44";
        ctx.font = "bold 36px 'GeistMono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`WAVE ${gs.wave}`, CW / 2, CH / 2);
        ctx.restore();
      }

      // Shields
      drawShields(ctx, gs.shields);

      // Aliens
      const frame = gs.alienMarchPhase;
      for (const alien of gs.aliens) {
        if (alien.alive) {
          drawAlien(ctx, alien.x, alien.y, alien.type, frame);
        }
      }

      // UFO
      drawUFO(ctx, gs.ufo);

      // Player
      if (gs.playerAlive) {
        // Flicker on respawn (not currently implemented but keeping signature)
        drawPlayer(ctx, gs.playerX, gs.playerAlive, gs.tick);
      }

      // Bullets
      if (gs.bullet.active) drawBullet(ctx, gs.bullet);
      for (const ab of gs.alienBullets) drawAlienBullet(ctx, ab);

      // Particles & popups
      drawParticles(ctx, gs.particles);
      drawPopups(ctx, gs.popups);

      // Ground line
      ctx.strokeStyle = "#33ff44";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, CH - 28);
      ctx.lineTo(CW, CH - 28);
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [startGame, nextWave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if ([" ", "ArrowLeft", "ArrowRight", "a", "d"].includes(e.key)) {
        e.preventDefault();
      }
      if (down) keysRef.current.add(e.key);
      else keysRef.current.delete(e.key);
    };

    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Init audio on first interaction
    const initAudio = () => {
      if (!audioRef.current) audioRef.current = createAudio();
    };
    window.addEventListener("keydown", initAudio, { once: true });

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      width={CW}
      height={CH}
      style={{
        display: "block",
        imageRendering: "pixelated",
        border: "2px solid #33ff44",
        boxShadow: "0 0 30px #33ff4460",
      }}
    />
  );
}
