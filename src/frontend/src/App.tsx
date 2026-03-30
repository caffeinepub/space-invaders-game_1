import { useCallback, useEffect, useRef, useState } from "react";

type GameState = "MENU" | "AIMING" | "POWER" | "FLYING" | "RESULT" | "GAMEOVER";

interface GameData {
  state: GameState;
  round: number;
  goals: number;
  reticleX: number;
  reticleDir: number;
  lockedAimX: number;
  power: number;
  powerDir: number;
  lockedPower: number;
  ballX: number;
  ballY: number;
  ballTargetX: number;
  ballTargetY: number;
  ballFrame: number;
  gkX: number;
  gkDiveDir: number;
  gkDiveFrame: number;
  resultMsg: string;
  resultTimer: number;
  resultIsGoal: boolean;
}

const CANVAS_W = 800;
const CANVAS_H = 500;
const GOAL_X = 250;
const GOAL_Y = 80;
const GOAL_W = 300;
const GOAL_H = 150;
const GK_BASE_X = GOAL_X + GOAL_W / 2;
const GK_Y = GOAL_Y + 10;
const RONALDO_X = CANVAS_W / 2;
const RONALDO_Y = 360;
const BALL_START_X = CANVAS_W / 2;
const BALL_START_Y = 420;
const BALL_RADIUS = 12;
const FLIGHT_FRAMES = 45;
const GK_DIVE_RANGE = 90;
const RETICLE_SPEED = 2.2;
const POWER_SPEED = 1.6;

function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playKickSound(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.4;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function playGoalSound(ctx: AudioContext) {
  const freqs = [523, 659, 784, 1047];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + i * 0.1 + 0.25,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.25);
  });
}

function playSaveSound(ctx: AudioContext) {
  const freqs = [659, 523, 440, 330];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sawtooth";
    gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + i * 0.1 + 0.2,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.2);
  });
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function initGame(): GameData {
  return {
    state: "MENU",
    round: 0,
    goals: 0,
    reticleX: GK_BASE_X,
    reticleDir: 1,
    lockedAimX: GK_BASE_X,
    power: 0,
    powerDir: 1,
    lockedPower: 0,
    ballX: BALL_START_X,
    ballY: BALL_START_Y,
    ballTargetX: CANVAS_W / 2,
    ballTargetY: GOAL_Y + 50,
    ballFrame: 0,
    gkX: GK_BASE_X,
    gkDiveDir: 0,
    gkDiveFrame: 0,
    resultMsg: "",
    resultTimer: 0,
    resultIsGoal: false,
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameData>(initGame());
  const rafRef = useRef<number>(0);
  const audioRef = useRef<AudioContext | null>(null);
  const stadiumImgRef = useRef<HTMLImageElement | null>(null);
  const ronaldoImgRef = useRef<HTMLImageElement | null>(null);
  const gkImgRef = useRef<HTMLImageElement | null>(null);
  const [uiRound, setUiRound] = useState(0);
  const [uiGoals, setUiGoals] = useState(0);

  const handleInput = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = createAudioCtx();
    }
    const g = gameRef.current;
    if (g.state === "MENU") {
      g.state = "AIMING";
      g.round = 1;
      g.goals = 0;
      g.reticleX = GK_BASE_X;
      g.reticleDir = 1;
      setUiRound(1);
      setUiGoals(0);
    } else if (g.state === "AIMING") {
      g.lockedAimX = g.reticleX;
      g.power = 0;
      g.powerDir = 1;
      g.state = "POWER";
    } else if (g.state === "POWER") {
      g.lockedPower = g.power;
      const aimFrac = (g.lockedAimX - GOAL_X) / GOAL_W;
      g.ballTargetX = GOAL_X + aimFrac * GOAL_W;
      const powerFrac = g.lockedPower / 100;
      g.ballTargetY = GOAL_Y + GOAL_H * (1 - powerFrac * 0.8);
      g.ballX = BALL_START_X;
      g.ballY = BALL_START_Y;
      g.ballFrame = 0;
      g.gkDiveDir = Math.random() < 0.5 ? -1 : 1;
      g.gkDiveFrame = 0;
      g.gkX = GK_BASE_X;
      g.state = "FLYING";
      if (audioRef.current) playKickSound(audioRef.current);
    } else if (g.state === "GAMEOVER") {
      Object.assign(gameRef.current, initGame());
      gameRef.current.state = "MENU";
      setUiRound(0);
      setUiGoals(0);
    }
  }, []);

  useEffect(() => {
    const load = (
      src: string,
      ref: React.MutableRefObject<HTMLImageElement | null>,
    ) => {
      const img = new Image();
      img.src = src;
      ref.current = img;
    };
    load("/assets/generated/stadium-bg.dim_800x400.png", stadiumImgRef);
    load(
      "/assets/generated/ronaldo-sprite-transparent.dim_128x128.png",
      ronaldoImgRef,
    );
    load(
      "/assets/generated/goalkeeper-sprite-transparent.dim_128x128.png",
      gkImgRef,
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function drawBg() {
      if (!ctx) return;
      const stadium = stadiumImgRef.current;
      if (stadium?.complete && stadium.naturalWidth > 0) {
        ctx.drawImage(stadium, 0, 0, CANVAS_W, CANVAS_H);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grad.addColorStop(0, "#0B1A2A");
        grad.addColorStop(1, "#142B45");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
      ctx.fillStyle = "rgba(5, 10, 20, 0.45)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    function drawGoal() {
      if (!ctx) return;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 4;
      ctx.strokeRect(GOAL_X, GOAL_Y, GOAL_W, GOAL_H);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      for (let x = GOAL_X + 30; x < GOAL_X + GOAL_W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, GOAL_Y);
        ctx.lineTo(x, GOAL_Y + GOAL_H);
        ctx.stroke();
      }
      for (let y = GOAL_Y + 25; y < GOAL_Y + GOAL_H; y += 25) {
        ctx.beginPath();
        ctx.moveTo(GOAL_X, y);
        ctx.lineTo(GOAL_X + GOAL_W, y);
        ctx.stroke();
      }
    }

    function drawGK(g: GameData) {
      if (!ctx) return;
      const gkImg = gkImgRef.current;
      const w = 80;
      const h = 80;
      if (gkImg?.complete && gkImg.naturalWidth > 0) {
        ctx.drawImage(gkImg, g.gkX - w / 2, GK_Y, w, h);
      } else {
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(g.gkX - w / 2, GK_Y, w, h);
        ctx.fillStyle = "#000";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GK", g.gkX, GK_Y + 45);
      }
    }

    function drawRonaldo() {
      if (!ctx) return;
      const img = ronaldoImgRef.current;
      const w = 100;
      const h = 100;
      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, RONALDO_X - w / 2, RONALDO_Y, w, h);
      } else {
        ctx.fillStyle = "#CC0000";
        ctx.fillRect(RONALDO_X - w / 2, RONALDO_Y, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CR7", RONALDO_X, RONALDO_Y + 55);
      }
    }

    function drawBall(g: GameData) {
      if (!ctx) return;
      const { ballX: x, ballY: y } = g;
      ctx.beginPath();
      ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#333";
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(angle) * 5,
          y + Math.sin(angle) * 5,
          2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    function drawReticle(g: GameData) {
      if (!ctx) return;
      const rx = g.reticleX;
      const ry = GOAL_Y + GOAL_H / 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "#F2A23A";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - 24, ry);
      ctx.lineTo(rx + 24, ry);
      ctx.moveTo(rx, ry - 24);
      ctx.lineTo(rx, ry + 24);
      ctx.strokeStyle = "rgba(242,162,58,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, 22, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242,162,58,0.3)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    function drawPowerBar(g: GameData) {
      if (!ctx) return;
      const bx = 30;
      const by = 150;
      const bw = 28;
      const bh = 200;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "#1a2a3a";
      ctx.fillRect(bx, by, bw, bh);
      const fillH = (g.power / 100) * bh;
      const gradient = ctx.createLinearGradient(0, by + bh, 0, by);
      gradient.addColorStop(0, "#E08A2E");
      gradient.addColorStop(0.5, "#F2A23A");
      gradient.addColorStop(1, "#FF4444");
      ctx.fillStyle = gradient;
      ctx.fillRect(bx, by + bh - fillH, bw, fillH);
      ctx.strokeStyle = "#F2A23A";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = "#F2A23A";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("POWER", bx + bw / 2, by - 12);
      ctx.fillText(`${Math.round(g.power)}%`, bx + bw / 2, by + bh + 18);
    }

    function drawMenu() {
      if (!ctx) return;
      ctx.fillStyle = "rgba(5, 15, 30, 0.75)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.textAlign = "center";
      ctx.font = "bold 52px 'Press Start 2P', monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText("PENALTY", CANVAS_W / 2, 160);
      ctx.fillStyle = "#F2A23A";
      ctx.fillText("STRIKER CR7", CANVAS_W / 2, 220);
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("5 KICKS TO GLORY", CANVAS_W / 2, 270);
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(242, 162, 58, ${pulse})`;
      ctx.font = "14px 'Press Start 2P', monospace";
      ctx.fillText("PRESS SPACE OR CLICK TO START", CANVAS_W / 2, 360);
      const img = ronaldoImgRef.current;
      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, RONALDO_X - 50, 370, 100, 100);
      }
    }

    function drawResult(g: GameData) {
      if (!ctx) return;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(200, 200, 400, 120);
      ctx.textAlign = "center";
      ctx.font = "bold 42px 'Press Start 2P', monospace";
      ctx.fillStyle = g.resultIsGoal ? "#F2A23A" : "#FF4444";
      ctx.fillText(g.resultMsg, CANVAS_W / 2, 265);
      if (g.resultIsGoal) {
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = "#fff";
        ctx.fillText("SIUUUU!", CANVAS_W / 2, 300);
      }
    }

    function drawGameOver(g: GameData) {
      if (!ctx) return;
      ctx.fillStyle = "rgba(5, 15, 30, 0.85)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.textAlign = "center";
      ctx.font = "bold 38px 'Press Start 2P', monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText("FULL TIME!", CANVAS_W / 2, 130);
      ctx.font = "bold 28px 'Press Start 2P', monospace";
      ctx.fillStyle = "#F2A23A";
      ctx.fillText(`${g.goals} / 5 GOALS`, CANVAS_W / 2, 200);
      ctx.font = "20px 'Press Start 2P', monospace";
      if (g.goals === 5) {
        ctx.fillStyle = "#FFD700";
        ctx.fillText("PERFECT! SIUUUUU!", CANVAS_W / 2, 260);
      } else if (g.goals >= 4) {
        ctx.fillStyle = "#F2A23A";
        ctx.fillText("FANTASTIC STRIKER!", CANVAS_W / 2, 260);
      } else if (g.goals >= 3) {
        ctx.fillStyle = "#8BC34A";
        ctx.fillText("SOLID PERFORMANCE!", CANVAS_W / 2, 260);
      } else if (g.goals >= 2) {
        ctx.fillStyle = "#aaa";
        ctx.fillText("KEEP PRACTICING!", CANVAS_W / 2, 260);
      } else {
        ctx.fillStyle = "#FF4444";
        ctx.fillText("THE KEEPER WINS!", CANVAS_W / 2, 260);
      }
      for (let i = 0; i < 5; i++) {
        const sx = CANVAS_W / 2 - 110 + i * 55;
        ctx.font = "32px serif";
        ctx.fillStyle = i < g.goals ? "#FFD700" : "#333";
        ctx.fillText("\u2605", sx, 320);
      }
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(242, 162, 58, ${pulse})`;
      ctx.font = "13px 'Press Start 2P', monospace";
      ctx.fillText("PRESS SPACE OR CLICK TO RESTART", CANVAS_W / 2, 390);
    }

    function drawHint(msg: string) {
      if (!ctx) return;
      ctx.textAlign = "center";
      ctx.font = "13px 'Press Start 2P', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(msg, CANVAS_W / 2, 470);
    }

    function tick() {
      const g = gameRef.current;

      if (g.state === "AIMING") {
        g.reticleX += RETICLE_SPEED * g.reticleDir;
        if (g.reticleX >= GOAL_X + GOAL_W - 10) g.reticleDir = -1;
        if (g.reticleX <= GOAL_X + 10) g.reticleDir = 1;
      }

      if (g.state === "POWER") {
        g.power += POWER_SPEED * g.powerDir;
        if (g.power >= 100) {
          g.power = 100;
          g.powerDir = -1;
        }
        if (g.power <= 0) {
          g.power = 0;
          g.powerDir = 1;
        }
      }

      if (g.state === "FLYING") {
        g.ballFrame++;
        const t = Math.min(g.ballFrame / FLIGHT_FRAMES, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        g.ballX = lerp(BALL_START_X, g.ballTargetX, ease);
        g.ballY = lerp(BALL_START_Y, g.ballTargetY, ease);
        if (g.gkDiveFrame < FLIGHT_FRAMES) {
          g.gkDiveFrame++;
          const diveT = Math.min(g.gkDiveFrame / FLIGHT_FRAMES, 1);
          g.gkX = GK_BASE_X + g.gkDiveDir * GK_DIVE_RANGE * diveT;
        }
        if (g.ballFrame >= FLIGHT_FRAMES) {
          const gkFinalX = GK_BASE_X + g.gkDiveDir * GK_DIVE_RANGE;
          const caught = Math.abs(g.ballTargetX - gkFinalX) < 55;
          const inGoal =
            g.ballTargetX > GOAL_X + 5 &&
            g.ballTargetX < GOAL_X + GOAL_W - 5 &&
            g.ballTargetY > GOAL_Y + 5 &&
            g.ballTargetY < GOAL_Y + GOAL_H - 5;
          const isGoal = inGoal && !caught;
          if (isGoal) {
            g.goals++;
            g.resultMsg = "GOAL!";
            g.resultIsGoal = true;
            setUiGoals(g.goals);
            if (audioRef.current) playGoalSound(audioRef.current);
          } else {
            g.resultMsg = "SAVED!";
            g.resultIsGoal = false;
            if (audioRef.current) playSaveSound(audioRef.current);
          }
          g.resultTimer = 0;
          g.state = "RESULT";
        }
      }

      if (g.state === "RESULT") {
        g.resultTimer++;
        if (g.resultTimer > 90) {
          if (g.round >= 5) {
            g.state = "GAMEOVER";
          } else {
            g.round++;
            g.state = "AIMING";
            g.reticleX = GK_BASE_X;
            g.reticleDir = 1;
            g.ballX = BALL_START_X;
            g.ballY = BALL_START_Y;
            g.gkX = GK_BASE_X;
            setUiRound(g.round);
          }
        }
      }

      drawBg();
      drawGoal();

      if (g.state === "MENU") {
        drawMenu();
      } else if (g.state === "GAMEOVER") {
        drawRonaldo();
        drawGameOver(g);
      } else {
        drawGK(g);
        drawRonaldo();
        drawBall(g);
        if (g.state === "AIMING") {
          drawReticle(g);
          drawHint("CLICK OR PRESS SPACE TO AIM");
        }
        if (g.state === "POWER") {
          drawPowerBar(g);
          drawHint("CLICK OR PRESS SPACE TO SHOOT");
        }
        if (g.state === "RESULT") {
          drawResult(g);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleInput]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0B1A2A 0%, #142B45 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Press Start 2P', monospace",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: "16px" }}>
        <h1
          style={{
            fontSize: "clamp(18px, 3vw, 28px)",
            letterSpacing: "2px",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          <span style={{ color: "#fff" }}>PENALTY STRIKER</span>
          <span style={{ color: "#F2A23A" }}> CR7</span>
        </h1>
      </header>

      <div
        style={{
          display: "flex",
          gap: "40px",
          marginBottom: "12px",
          color: "#fff",
          fontSize: "clamp(10px, 1.5vw, 13px)",
        }}
      >
        <span data-ocid="game.round.panel">
          ROUND: <span style={{ color: "#F2A23A" }}>{uiRound || "\u2013"}</span>
          /5
        </span>
        <span data-ocid="game.goals.panel">
          GOALS: <span style={{ color: "#F2A23A" }}>{uiGoals}</span>
        </span>
      </div>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via global keydown listener */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onClick={handleInput}
        data-ocid="game.canvas_target"
        style={{
          display: "block",
          cursor: "pointer",
          maxWidth: "100%",
          border: "3px solid rgba(242, 162, 58, 0.4)",
          borderRadius: "4px",
          boxShadow:
            "0 0 40px rgba(242, 162, 58, 0.15), 0 8px 32px rgba(0,0,0,0.6)",
        }}
      />

      <p
        style={{
          marginTop: "14px",
          color: "rgba(255,255,255,0.45)",
          fontSize: "clamp(8px, 1.2vw, 11px)",
          textAlign: "center",
          letterSpacing: "1px",
        }}
      >
        SPACE OR CLICK \u2192 AIM \u2192 SHOOT \u2192 SCORE!
      </p>

      <footer
        style={{
          marginTop: "20px",
          color: "rgba(255,255,255,0.25)",
          fontSize: "9px",
          textAlign: "center",
        }}
      >
        \u00a9 {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          style={{ color: "rgba(242,162,58,0.5)", textDecoration: "none" }}
          target="_blank"
          rel="noreferrer"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
