import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplaySession, ReplayEvent } from "../types";
import { buildSyntheticReplay, DEMO_TOKENS } from "../lib/replay";
import { fetchRecentTxs, fetchTokenMeta } from "../lib/goldrush";
import { buildReplaySession } from "../lib/replay";
import { RugGauge } from "./RugGauge";
import { AlertPanel } from "./AlertPanel";
import { TxFeed } from "./TxFeed";

interface Props {
  onBack: () => void;
}

type PlayState = "idle" | "loading" | "playing" | "paused" | "done";

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export function ReplayMode({ onBack }: Props) {
  const [demoIndex, setDemoIndex] = useState(0);
  const [customAddress, setCustomAddress] = useState("");
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentEvent: ReplayEvent | undefined = session?.events[cursor];

  // ── Load a session ─────────────────────────────────────────────────────────
  async function loadDemo(index: number) {
    setPlayState("loading");
    setError("");
    try {
      const hasKey = !!localStorage.getItem("rugradar_api_key");
      let sess: ReplaySession;
      if (hasKey) {
        const demo = DEMO_TOKENS[index];
        const [txs, meta] = await Promise.all([
          fetchRecentTxs(demo.address, "solana-mainnet", 100),
          fetchTokenMeta(demo.address, "solana-mainnet"),
        ]);
        sess = txs.length >= 5
          ? buildReplaySession(txs, meta)
          : buildSyntheticReplay(index);
      } else {
        sess = buildSyntheticReplay(index);
      }
      setSession(sess);
      setCursor(0);
      setPlayState("idle");
    } catch (e: any) {
      setError(e.message ?? "Failed to load replay data");
      setPlayState("idle");
    }
  }

  async function loadCustom() {
    const addr = customAddress.trim();
    if (!addr) return;
    setPlayState("loading");
    setError("");
    try {
      const [txs, meta] = await Promise.all([
        fetchRecentTxs(addr, "solana-mainnet", 100),
        fetchTokenMeta(addr, "solana-mainnet"),
      ]);
      if (txs.length < 3) {
        setError("Not enough transactions to replay. Try a more active address or a demo token.");
        setPlayState("idle");
        return;
      }
      const sess = buildReplaySession(txs, meta);
      setSession(sess);
      setCursor(0);
      setPlayState("idle");
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch address data");
      setPlayState("idle");
    }
  }

  // ── Playback control ───────────────────────────────────────────────────────
  const play = useCallback(() => {
    if (!session) return;
    setPlayState("playing");
  }, [session]);

  const pause = useCallback(() => {
    setPlayState("paused");
  }, []);

  const reset = useCallback(() => {
    setPlayState("idle");
    setCursor(0);
  }, []);

  // Advance cursor on interval
  useEffect(() => {
    if (playState !== "playing" || !session) return;
    const delay = Math.max(100, 600 / speed);
    intervalRef.current = setInterval(() => {
      setCursor((prev) => {
        if (prev >= session.events.length - 1) {
          setPlayState("done");
          return prev;
        }
        return prev + 1;
      });
    }, delay);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playState, speed, session]);

  // Auto-load first demo on mount
  useEffect(() => { loadDemo(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = session ? (cursor / Math.max(1, session.events.length - 1)) * 100 : 0;
  const displayedTxs = session ? session.events.slice(0, cursor + 1).map(e => ({
    ...e,
    id: e.id ?? String(cursor),
  })).reverse() : [];
  const displayedAlerts = currentEvent?.alertsTriggered ?? [];
  const scores = currentEvent?.scoresSnapshot ?? { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 };

  return (
    <div className="replay-mode">
      {/* Header */}
      <div className="replay-header">
        <button className="back-btn" onClick={onBack}>← Back to Monitor</button>
        <div className="replay-title">
          <span className="logo-icon-sm">◈</span> REPLAY MODE
        </div>
        <div className="replay-subtitle">Historical rug event timeline</div>
      </div>

      {/* Token selector */}
      <div className="replay-selector">
        <div className="replay-demos">
          {DEMO_TOKENS.map((t, i) => (
            <button
              key={t.address}
              className={`demo-token-btn ${demoIndex === i ? "demo-token-active" : ""}`}
              onClick={() => { setDemoIndex(i); loadDemo(i); }}
            >
              <span className="demo-token-name">{t.symbol}</span>
              <span className="demo-token-desc">{t.description}</span>
            </button>
          ))}
        </div>
        <div className="replay-custom">
          <input
            type="text"
            className="address-input"
            placeholder="Or enter a Solana token address…"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCustom()}
          />
          <button className="monitor-btn" onClick={loadCustom} disabled={playState === "loading"}>
            {playState === "loading" ? "Loading…" : "Load"}
          </button>
        </div>
        {error && <div className="replay-error">{error}</div>}
      </div>

      {/* Summary banner (when session loaded) */}
      {session && (
        <div className="replay-summary">
          <div className="summary-item">
            <span className="summary-label">TOKEN</span>
            <span className="summary-value">{session.tokenMeta.symbol} — {session.tokenMeta.name}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">RUG TYPE</span>
            <span className="summary-value summary-danger">{session.summary.rugType}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">PEAK SCORE</span>
            <span className="summary-value summary-danger">{session.summary.peakScore.toFixed(0)}/100</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">LIQ LOST</span>
            <span className="summary-value">${(session.summary.totalLiquidityLost / 1000).toFixed(1)}K</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">DURATION</span>
            <span className="summary-value">{session.summary.durationMinutes}m</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      {session && (
        <div className="replay-controls">
          <button className="ctrl-btn" onClick={reset} disabled={cursor === 0}>⟪ Reset</button>
          {playState === "playing" ? (
            <button className="ctrl-btn ctrl-primary" onClick={pause}>⏸ Pause</button>
          ) : (
            <button className="ctrl-btn ctrl-primary" onClick={play} disabled={playState === "done"}>
              {playState === "done" ? "✓ Done" : "▶ Play"}
            </button>
          )}
          <div className="speed-selector">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                className={`speed-btn ${speed === s ? "speed-active" : ""}`}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="replay-counter">
            {cursor + 1} / {session.events.length}
          </span>
        </div>
      )}

      {/* Main replay body */}
      {session && (
        <div className="replay-body">
          <div className="col-left">
            <AlertPanel alerts={displayedAlerts} onDismiss={() => {}} />
          </div>
          <div className="col-center">
            <RugGauge scores={scores} />
            {currentEvent && (
              <div className="replay-event-card">
                <div className="rec-label">CURRENT EVENT</div>
                <div className="rec-type">{currentEvent.type.replace(/_/g, " ").toUpperCase()}</div>
                <div className="rec-addr">from {currentEvent.fromAddress.slice(0, 12)}…</div>
                {currentEvent.valueUsd && (
                  <div className="rec-value">${currentEvent.valueUsd.toLocaleString()}</div>
                )}
                <div className="rec-time">{new Date(currentEvent.timestamp).toLocaleTimeString()}</div>
              </div>
            )}
          </div>
          <div className="col-right">
            <TxFeed txs={displayedTxs} />
          </div>
        </div>
      )}
    </div>
  );
}
