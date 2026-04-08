import { useCallback, useEffect, useRef, useState } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
const TOTAL_PENALTIES = 5;

type Phase = "intro" | "aim" | "power" | "result" | "gameover";
type ShotResult = "goal" | "saved" | null;

interface PenaltyRecord {
  result: ShotResult;
}

// ─── Canvas dimensions ───────────────────────────────────────────────────────
const CW = 480;
const CH = 620;

// Goal geometry (in canvas coords)
const GOAL_LEFT = 80;
const GOAL_RIGHT = 400;
const GOAL_TOP = 60;
const GOAL_BOTTOM = 210;
const GOAL_W = GOAL_RIGHT - GOAL_LEFT;
const GOAL_H = GOAL_BOTTOM - GOAL_TOP;

// Power bar geometry
const PB_X = 430;
const PB_Y = 80;
const PB_W = 24;
const PB_H = 200;

export default function RonaldoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stateRef = useRef({
    phase: "intro" as Phase,
    // aim oscillation
    reticleX: GOAL_LEFT + GOAL_W / 2,
    reticleDir: 1,
    reticleSpeed: 3.8,
    // power oscillation
    powerLevel: 0.5, // 0..1
    powerDir: 1,
    powerSpeed: 0.018,
    // locked values
    lockedX: 0,
    lockedPower: 0,
    // result
    shotResult: null as ShotResult,
    keeperX: CW / 2, // keeper center x
    keeperDiveDir: 0, // -1 left, +1 right, 0 none
    ballX: CW / 2,
    ballY: CH - 110,
    ballTargetX: 0,
    ballTargetY: 0,
    ballAnimT: 0,
    showResultTimer: 0,
    // game state
    penaltyNum: 1,
    score: 0,
    records: [] as PenaltyRecord[],
  });

  const [displayPhase, setDisplayPhase] = useState<Phase>("intro");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayPenalty, setDisplayPenalty] = useState(1);
  const [shotResult, setShotResult] = useState<ShotResult>(null);
  const [records, setRecords] = useState<PenaltyRecord[]>([]);
  const [finalScore, setFinalScore] = useState(0);

  // Draw everything on canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;

    // ── Background: pitch ──
    ctx.fillStyle = "#1a5c1a";
    ctx.fillRect(0, 0, CW, CH);

    // Pitch stripes
    ctx.fillStyle = "#1d6b1d";
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(0, i * 100, CW, 50);
    }

    // Penalty spot
    ctx.beginPath();
    ctx.arc(CW / 2, CH - 80, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();

    // Penalty arc (D)
    ctx.beginPath();
    ctx.arc(CW / 2, CH - 80, 80, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Penalty box lines
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(60, CH - 220, CW - 120, 200);
    ctx.strokeRect(140, CH - 140, CW - 280, 120);

    // ── Goal net (back wall) ──
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(GOAL_LEFT, GOAL_TOP, GOAL_W, GOAL_H);

    // Net grid
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    const netCols = 10;
    const netRows = 6;
    for (let c = 0; c <= netCols; c++) {
      const x = GOAL_LEFT + (GOAL_W / netCols) * c;
      ctx.beginPath();
      ctx.moveTo(x, GOAL_TOP);
      ctx.lineTo(x, GOAL_BOTTOM);
      ctx.stroke();
    }
    for (let r = 0; r <= netRows; r++) {
      const y = GOAL_TOP + (GOAL_H / netRows) * r;
      ctx.beginPath();
      ctx.moveTo(GOAL_LEFT, y);
      ctx.lineTo(GOAL_RIGHT, y);
      ctx.stroke();
    }

    // ── Goal posts ──
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(GOAL_LEFT, GOAL_BOTTOM);
    ctx.lineTo(GOAL_LEFT, GOAL_TOP);
    ctx.lineTo(GOAL_RIGHT, GOAL_TOP);
    ctx.lineTo(GOAL_RIGHT, GOAL_BOTTOM);
    ctx.stroke();
    // crossbar shadow
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(GOAL_LEFT + 3, GOAL_TOP + 4);
    ctx.lineTo(GOAL_RIGHT - 3, GOAL_TOP + 4);
    ctx.stroke();

    // ── Goalkeeper ──
    const keeperY = GOAL_BOTTOM - 80;
    const keeperH = 80;
    const keeperW = 40;
    let kx = s.keeperX;

    // During result animation, move keeper
    if (s.phase === "result" && s.ballAnimT < 1) {
      const dive = s.keeperDiveDir * 80 * Math.min(s.ballAnimT * 3, 1);
      kx = s.keeperX + dive;
    } else if (s.phase === "result") {
      kx = s.keeperX + s.keeperDiveDir * 80;
    }
    kx = Math.max(
      GOAL_LEFT + keeperW / 2,
      Math.min(GOAL_RIGHT - keeperW / 2, kx),
    );

    // Body
    ctx.fillStyle = s.shotResult === "goal" ? "#cc2200" : "#1a44cc";
    ctx.fillRect(kx - keeperW / 2, keeperY - keeperH, keeperW, keeperH);
    // Head
    ctx.beginPath();
    ctx.arc(kx, keeperY - keeperH - 14, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#f5c5a0";
    ctx.fill();
    // Gloves
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(kx - keeperW / 2 - 8, keeperY - keeperH + 10, 10, 18);
    ctx.fillRect(kx + keeperW / 2 - 2, keeperY - keeperH + 10, 10, 18);

    // ── Ronaldo player ──
    const playerX = CW / 2;
    const playerY = CH - 60;
    // Legs
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(playerX - 14, playerY - 50, 10, 40);
    ctx.fillRect(playerX + 4, playerY - 50, 10, 40);
    // Shorts
    ctx.fillStyle = "#003399";
    ctx.fillRect(playerX - 16, playerY - 68, 32, 22);
    // Jersey
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(playerX - 18, playerY - 110, 36, 44);
    // Number 7
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("7", playerX, playerY - 78);
    // Head
    ctx.beginPath();
    ctx.arc(playerX, playerY - 122, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#c8935a";
    ctx.fill();
    // Hair
    ctx.fillStyle = "#1a0a00";
    ctx.fillRect(playerX - 14, playerY - 140, 28, 12);
    // Arms
    ctx.fillStyle = "#cc0000";
    ctx.fillRect(playerX - 32, playerY - 106, 14, 30);
    ctx.fillRect(playerX + 18, playerY - 106, 14, 30);
    // Boots
    ctx.fillStyle = "#111111";
    ctx.fillRect(playerX - 17, playerY - 14, 13, 14);
    ctx.fillRect(playerX + 4, playerY - 14, 13, 14);

    // ── Ball ──
    let bx = s.ballX;
    let by = s.ballY;
    let ballSize = 14;
    if (s.phase === "result" && s.ballAnimT > 0) {
      const t = Math.min(s.ballAnimT, 1);
      const ease = 1 - (1 - t) ** 2;
      bx = s.ballX + (s.ballTargetX - s.ballX) * ease;
      by = s.ballY + (s.ballTargetY - s.ballY) * ease;
      ballSize = 14 - 8 * t; // shrink as it travels
    }
    ctx.beginPath();
    ctx.arc(bx, by, ballSize, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Pentagon patches
    ctx.fillStyle = "#222222";
    ctx.beginPath();
    ctx.arc(bx - 4, by - 4, ballSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + 5, by - 2, ballSize * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by + 5, ballSize * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // ── Reticle (aim phase) ──
    if (s.phase === "aim") {
      const rx = s.reticleX;
      const ry = GOAL_TOP + GOAL_H * 0.5;
      ctx.strokeStyle = "rgba(255, 80, 0, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rx, ry, 28, 0, Math.PI * 2);
      ctx.stroke();
      // crosshairs
      ctx.beginPath();
      ctx.moveTo(rx - 38, ry);
      ctx.lineTo(rx - 32, ry);
      ctx.moveTo(rx + 32, ry);
      ctx.lineTo(rx + 38, ry);
      ctx.moveTo(rx, ry - 38);
      ctx.lineTo(rx, ry - 32);
      ctx.moveTo(rx, ry + 32);
      ctx.lineTo(rx, ry + 38);
      ctx.stroke();
      // center dot
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 80, 0, 0.95)";
      ctx.fill();
    }

    // ── Power bar ──
    if (s.phase === "power") {
      // Bar background
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(PB_X - 4, PB_Y - 4, PB_W + 8, PB_H + 8);
      // Fill gradient
      const grad = ctx.createLinearGradient(0, PB_Y + PB_H, 0, PB_Y);
      grad.addColorStop(0, "#00cc44");
      grad.addColorStop(0.5, "#ffcc00");
      grad.addColorStop(1, "#ff2200");
      ctx.fillStyle = grad;
      const fillH = PB_H * s.powerLevel;
      ctx.fillRect(PB_X, PB_Y + PB_H - fillH, PB_W, fillH);
      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(PB_X, PB_Y, PB_W, PB_H);
      // POWER label
      ctx.save();
      ctx.translate(PB_X + PB_W / 2, PB_Y + PB_H + 24);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Oswald, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("POWER", 0, 0);
      ctx.restore();
    }

    // ── HUD ──
    // Score dots
    const dotStartX = CW / 2 - (TOTAL_PENALTIES * 28) / 2;
    for (let i = 0; i < TOTAL_PENALTIES; i++) {
      const dx = dotStartX + i * 28 + 14;
      const dy = CH - 20;
      ctx.beginPath();
      ctx.arc(dx, dy, 8, 0, Math.PI * 2);
      if (i < s.records.length) {
        ctx.fillStyle = s.records[i].result === "goal" ? "#44dd44" : "#dd3322";
      } else if (i === s.records.length && s.phase !== "gameover") {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
      }
      ctx.fill();
    }
  }, []);

  // ─── Game loop ────────────────────────────────────────────────────────────
  const gameLoop = useCallback(() => {
    const s = stateRef.current;

    if (s.phase === "aim") {
      s.reticleX += s.reticleDir * s.reticleSpeed;
      if (s.reticleX >= GOAL_RIGHT - 30) s.reticleDir = -1;
      if (s.reticleX <= GOAL_LEFT + 30) s.reticleDir = 1;
    }

    if (s.phase === "power") {
      s.powerLevel += s.powerDir * s.powerSpeed;
      if (s.powerLevel >= 1) {
        s.powerLevel = 1;
        s.powerDir = -1;
      }
      if (s.powerLevel <= 0) {
        s.powerLevel = 0;
        s.powerDir = 1;
      }
    }

    if (s.phase === "result" && s.ballAnimT < 1.2) {
      s.ballAnimT += 0.022;
    }

    draw();
    animRef.current = requestAnimationFrame(gameLoop);
  }, [draw]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [gameLoop]);

  // ─── Input handler ────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    const s = stateRef.current;

    if (s.phase === "intro") {
      s.phase = "aim";
      setDisplayPhase("aim");
      return;
    }

    if (s.phase === "aim") {
      s.lockedX = s.reticleX;
      s.phase = "power";
      setDisplayPhase("power");
      return;
    }

    if (s.phase === "power") {
      s.lockedPower = s.powerLevel;
      s.phase = "result";
      setDisplayPhase("result");

      // Determine shot zone: left / center / right
      const relX = (s.lockedX - GOAL_LEFT) / GOAL_W; // 0..1
      let shotZone: "left" | "center" | "right";
      if (relX < 0.35) shotZone = "left";
      else if (relX > 0.65) shotZone = "right";
      else shotZone = "center";

      // Goalkeeper decision
      const readsShot = Math.random() < 0.35;
      let diveDir: -1 | 0 | 1 = 0;
      if (readsShot) {
        diveDir =
          shotZone === "left"
            ? -1
            : shotZone === "right"
              ? 1
              : Math.random() < 0.5
                ? -1
                : 1;
      } else {
        // Random dive
        const r = Math.random();
        diveDir = r < 0.45 ? -1 : r < 0.9 ? 1 : 0;
      }

      s.keeperDiveDir = diveDir;

      // Keeper zone: left if diveDir -1, right if +1
      let keeperCoversShot = false;
      if (diveDir === -1 && shotZone === "left") keeperCoversShot = true;
      if (diveDir === 1 && shotZone === "right") keeperCoversShot = true;
      if (diveDir === 0 && shotZone === "center") keeperCoversShot = true;

      // Result
      let result: ShotResult;
      if (keeperCoversShot && s.lockedPower < 0.55) {
        result = "saved";
      } else if (keeperCoversShot && s.lockedPower < 0.8) {
        result = Math.random() < 0.45 ? "saved" : "goal";
      } else {
        result = "goal";
      }

      s.shotResult = result;
      if (result === "goal") s.score++;

      // Ball animation target
      s.ballX = CW / 2;
      s.ballY = CH - 80;
      s.ballTargetX = s.lockedX;
      s.ballTargetY = GOAL_TOP + GOAL_H * 0.4;
      s.ballAnimT = 0;

      const newRecord: PenaltyRecord = { result };
      s.records = [...s.records, newRecord];

      setDisplayScore(s.score);
      setShotResult(result);
      setRecords([...s.records]);

      // Auto-advance after 2.5s
      setTimeout(() => {
        const st = stateRef.current;
        if (st.penaltyNum >= TOTAL_PENALTIES) {
          st.phase = "gameover";
          setFinalScore(st.score);
          setDisplayPhase("gameover");
        } else {
          st.penaltyNum++;
          st.shotResult = null;
          st.ballX = CW / 2;
          st.ballY = CH - 80;
          st.ballAnimT = 0;
          st.keeperDiveDir = 0;
          st.keeperX = CW / 2;
          st.phase = "aim";
          setShotResult(null);
          setDisplayPenalty(st.penaltyNum);
          setDisplayPhase("aim");
        }
      }, 2400);
      return;
    }
  }, []);

  const handlePlayAgain = useCallback(() => {
    const s = stateRef.current;
    s.phase = "aim";
    s.penaltyNum = 1;
    s.score = 0;
    s.records = [];
    s.shotResult = null;
    s.ballX = CW / 2;
    s.ballY = CH - 80;
    s.ballAnimT = 0;
    s.keeperDiveDir = 0;
    s.keeperX = CW / 2;
    s.reticleX = GOAL_LEFT + GOAL_W / 2;
    s.powerLevel = 0.5;
    setDisplayPhase("aim");
    setDisplayScore(0);
    setDisplayPenalty(1);
    setShotResult(null);
    setRecords([]);
    setFinalScore(0);
  }, []);

  // ─── Result message styling ────────────────────────────────────────────────
  const getMessage = () => {
    if (shotResult === "goal")
      return {
        text: "⚽ GOOOAL!",
        color: "#44ff88",
        shadow: "0 0 30px #00ff66, 0 0 60px #00cc44",
      };
    if (shotResult === "saved")
      return {
        text: "✋ SAVED!",
        color: "#ff4422",
        shadow: "0 0 30px #ff2200, 0 0 60px #cc1100",
      };
    return null;
  };

  const msg = getMessage();

  // ─── Final score message ───────────────────────────────────────────────────
  const getFinalMessage = () => {
    if (finalScore === 5) return "PERFECT! LEGENDARY! 🐐";
    if (finalScore >= 4) return "OUTSTANDING! 🔥";
    if (finalScore >= 3) return "SOLID PERFORMANCE 💪";
    if (finalScore >= 2) return "ROOM TO IMPROVE 📈";
    return "BACK TO TRAINING... ⚽";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
        gap: "0",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontFamily: "'Bebas Neue', Impact, sans-serif",
          fontSize: "clamp(28px, 6vw, 42px)",
          letterSpacing: "0.08em",
          color: "#ffffff",
          textShadow:
            "0 2px 12px rgba(0,0,0,0.8), 0 0 40px rgba(255,200,0,0.3)",
          marginBottom: "6px",
          textAlign: "center",
        }}
      >
        🏆 RONALDO PENALTY SHOOTOUT
      </div>

      {/* Score/Status bar */}
      {displayPhase !== "intro" && displayPhase !== "gameover" && (
        <div
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: "15px",
            color: "rgba(255,255,255,0.85)",
            marginBottom: "8px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Penalty {displayPenalty}/{TOTAL_PENALTIES} &nbsp;|&nbsp; Score:{" "}
          {displayScore}
        </div>
      )}

      {/* Canvas wrapper */}
      <div
        style={{
          position: "relative",
          cursor:
            displayPhase === "aim" || displayPhase === "power"
              ? "crosshair"
              : "default",
        }}
        onClick={
          displayPhase === "aim" ||
          displayPhase === "power" ||
          displayPhase === "intro"
            ? handleClick
            : undefined
        }
        onKeyDown={
          displayPhase === "aim" ||
          displayPhase === "power" ||
          displayPhase === "intro"
            ? (e) => {
                if (e.key === " " || e.key === "Enter") handleClick();
              }
            : undefined
        }
        data-ocid="game.canvas_target"
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          style={{
            display: "block",
            borderRadius: "8px",
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,0.08)",
            maxWidth: "100vw",
          }}
        />

        {/* Intro overlay */}
        {displayPhase === "intro" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: "clamp(36px, 8vw, 56px)",
                color: "#ffdd00",
                textShadow:
                  "0 0 30px rgba(255,200,0,0.8), 0 4px 12px rgba(0,0,0,0.8)",
                letterSpacing: "0.06em",
                textAlign: "center",
              }}
            >
              ⚽ PENALTY SHOOTOUT
            </div>
            <div
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontSize: "clamp(14px, 3vw, 18px)",
                color: "rgba(255,255,255,0.88)",
                textAlign: "center",
                lineHeight: 2.0,
                letterSpacing: "0.05em",
              }}
            >
              🎯 CLICK to lock your AIM
              <br />⚡ CLICK to lock your POWER
              <br />⚽ Score as many as you can!
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              data-ocid="game.primary_button"
              style={{
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: "22px",
                letterSpacing: "0.1em",
                background: "linear-gradient(135deg, #ffdd00, #ff8800)",
                color: "#000000",
                border: "none",
                borderRadius: "6px",
                padding: "14px 48px",
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(255,160,0,0.5)",
                transition: "transform 0.1s, box-shadow 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              KICK OFF!
            </button>
          </div>
        )}

        {/* Phase instruction */}
        {(displayPhase === "aim" || displayPhase === "power") && (
          <div
            style={{
              position: "absolute",
              bottom: "50px",
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: "'Bebas Neue', Impact, sans-serif",
              fontSize: "clamp(16px, 4vw, 22px)",
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.12em",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {displayPhase === "aim" ? "🎯 CLICK TO AIM" : "⚡ CLICK TO SHOOT"}
          </div>
        )}

        {/* Result flash */}
        {displayPhase === "result" && msg && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontFamily: "'Bebas Neue', Impact, sans-serif",
              fontSize: "clamp(48px, 12vw, 80px)",
              color: msg.color,
              textShadow: msg.shadow,
              letterSpacing: "0.06em",
              pointerEvents: "none",
              animation: "resultPop 0.3s ease-out",
              whiteSpace: "nowrap",
            }}
            data-ocid="game.toast"
          >
            {msg.text}
          </div>
        )}

        {/* Game over overlay */}
        {displayPhase === "gameover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.82)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
            }}
            data-ocid="game.modal"
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: "clamp(28px, 7vw, 46px)",
                color: "#ffdd00",
                textShadow: "0 0 30px rgba(255,200,0,0.8)",
                letterSpacing: "0.08em",
                textAlign: "center",
              }}
            >
              FINAL SCORE
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: "clamp(60px, 16vw, 100px)",
                color: finalScore >= 3 ? "#44ff88" : "#ff6644",
                textShadow:
                  finalScore >= 3
                    ? "0 0 40px #00ff66, 0 0 80px #00cc44"
                    : "0 0 40px #ff3300, 0 0 80px #cc1100",
                lineHeight: 1,
                letterSpacing: "0.04em",
              }}
            >
              {finalScore}/{TOTAL_PENALTIES}
            </div>
            <div
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontSize: "clamp(15px, 4vw, 22px)",
                color: "rgba(255,255,255,0.9)",
                letterSpacing: "0.08em",
                textAlign: "center",
              }}
            >
              {getFinalMessage()}
            </div>

            {/* Penalty dots recap */}
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              {records.map((r, i) => {
                const penaltyIndex = i + 1;
                return (
                  <div
                    key={penaltyIndex}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: r.result === "goal" ? "#44dd44" : "#dd3322",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      boxShadow:
                        r.result === "goal"
                          ? "0 0 10px #00cc44"
                          : "0 0 10px #cc1100",
                    }}
                    data-ocid={`game.item.${penaltyIndex}`}
                  >
                    {r.result === "goal" ? "✓" : "✗"}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handlePlayAgain}
              data-ocid="game.primary_button"
              style={{
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: "22px",
                letterSpacing: "0.1em",
                background: "linear-gradient(135deg, #ffdd00, #ff8800)",
                color: "#000000",
                border: "none",
                borderRadius: "6px",
                padding: "14px 48px",
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(255,160,0,0.5)",
                marginTop: "8px",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              🔄 PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "18px",
          fontFamily: "'Oswald', sans-serif",
          fontSize: "12px",
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "0.05em",
        }}
      >
        © {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
        >
          caffeine.ai
        </a>
      </div>

      <style>{`
        @keyframes resultPop {
          from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
