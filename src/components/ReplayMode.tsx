import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplaySession, ReplayEvent } from "../types";
import { buildSyntheticReplay, DEMO_TOKENS } from "../lib/replay";
import { fetchRecentTxs, fetchTokenMeta } from "../lib/goldrush";
import { buildReplaySession } from "../lib/replay";
import { RugGauge } from "./RugGauge";
import { AlertPanel } from "./AlertPanel";
import { ReplayChart } from "./ReplayChart";

interface Props { onBack: () => void }
type PlayState = "idle" | "loading" | "playing" | "paused" | "done";

const SPEEDS = [0.5, 1, 2, 4, 8];

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtUsd(v?: number) {
  if (!v) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function shortAddr(a: string) {
  if (!a || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const TYPE_COLOR: Record<string, string> = {
  buy:              "text-emerald-400",
  sell:             "text-red-400",
  remove_liquidity: "text-orange-400",
  add_liquidity:    "text-cyan-400",
  transfer:         "text-slate-400",
  unknown:          "text-slate-500",
};
const TYPE_DOT: Record<string, string> = {
  buy:              "bg-emerald-500",
  sell:             "bg-red-500",
  remove_liquidity: "bg-orange-500",
  add_liquidity:    "bg-cyan-500",
  transfer:         "bg-slate-500",
  unknown:          "bg-slate-600",
};
const TYPE_LABEL: Record<string, string> = {
  buy:              "BUY",
  sell:             "SELL",
  remove_liquidity: "REM LIQ",
  add_liquidity:    "ADD LIQ",
  transfer:         "XFER",
  unknown:          "???",
};

// ── component ─────────────────────────────────────────────────────────────────
export function ReplayMode({ onBack }: Props) {
  const [demoIndex, setDemoIndex]   = useState(0);
  const [customAddr, setCustomAddr] = useState("");
  const [session, setSession]       = useState<ReplaySession | null>(null);
  const [playState, setPlayState]   = useState<PlayState>("idle");
  const [cursor, setCursor]         = useState(0);
  const [speed, setSpeed]           = useState(1);
  const [error, setError]           = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const event: ReplayEvent | undefined = session?.events[cursor];
  const progress = session ? (cursor / Math.max(1, session.events.length - 1)) * 100 : 0;

  // ── loaders ────────────────────────────────────────────────────────────────
  async function loadDemo(idx: number) {
    stopTimer();
    setPlayState("loading"); setError("");
    try {
      const hasKey = !!localStorage.getItem("rugradar_api_key");
      let sess: ReplaySession;
      if (hasKey) {
        const demo = DEMO_TOKENS[idx];
        const [txs, meta] = await Promise.all([
          fetchRecentTxs(demo.address, "solana-mainnet", 100),
          fetchTokenMeta(demo.address, "solana-mainnet"),
        ]);
        sess = txs.length >= 5 ? buildReplaySession(txs, meta) : buildSyntheticReplay(idx);
      } else {
        sess = buildSyntheticReplay(idx);
      }
      setSession(sess); setCursor(0); setPlayState("idle");
    } catch (e: any) {
      setError(e.message ?? "Failed to load"); setPlayState("idle");
    }
  }

  async function loadCustom() {
    const addr = customAddr.trim();
    if (!addr) return;
    stopTimer();
    setPlayState("loading"); setError("");
    try {
      const [txs, meta] = await Promise.all([
        fetchRecentTxs(addr, "solana-mainnet", 100),
        fetchTokenMeta(addr, "solana-mainnet"),
      ]);
      if (txs.length < 3) {
        setError("Not enough transactions. Try a busier address or pick a demo token.");
        setPlayState("idle"); return;
      }
      setSession(buildReplaySession(txs, meta)); setCursor(0); setPlayState("idle");
    } catch (e: any) {
      setError(e.message ?? "Fetch failed"); setPlayState("idle");
    }
  }

  // ── playback ───────────────────────────────────────────────────────────────
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  const play = useCallback(() => { if (session) setPlayState("playing"); }, [session]);
  const pause = useCallback(() => setPlayState("paused"), []);
  const reset = useCallback(() => { stopTimer(); setCursor(0); setPlayState("idle"); }, []);

  useEffect(() => {
    if (playState !== "playing" || !session) return;
    timerRef.current = setInterval(() => {
      setCursor((c) => {
        if (c >= session.events.length - 1) { setPlayState("done"); return c; }
        return c + 1;
      });
    }, Math.max(80, 500 / speed));
    return stopTimer;
  }, [playState, speed, session]);

  // Auto-scroll timeline to cursor
  useEffect(() => {
    const row = timelineRef.current?.querySelector(`[data-idx="${cursor}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  useEffect(() => { loadDemo(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayed = session?.events.slice(0, cursor + 1) ?? [];
  const allAlerts = displayed.flatMap((e) => e.alertsTriggered);
  const scores = event?.scoresSnapshot ?? { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 };

  // relative time label from session start
  function relTime(ts: number): string {
    if (!session) return "";
    const s = Math.round((ts - session.events[0].timestamp) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `T+${m}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="replay-mode">
      {/* ── top bar ───────────────────────────────────────────────────────── */}
      <header className="replay-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="flex items-center gap-2">
          <span className="logo-icon-sm">◈</span>
          <span className="logo-text-sm">REPLAY MODE</span>
          <span className="text-[0.68rem] text-white/30 tracking-widest uppercase ml-1">
            Historical Rug Timeline
          </span>
        </div>
        <div className="flex-1" />
      </header>

      {/* ── scenario selector ─────────────────────────────────────────────── */}
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
            className="address-input"
            placeholder="Or paste any Solana token address…"
            value={customAddr}
            onChange={(e) => setCustomAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCustom()}
          />
          <button
            className="monitor-btn"
            onClick={loadCustom}
            disabled={playState === "loading"}
          >
            {playState === "loading" ? "Loading…" : "Load"}
          </button>
        </div>
        {error && <p className="replay-error">{error}</p>}
      </div>

      {/* ── summary banner ────────────────────────────────────────────────── */}
      {session && (
        <div className="replay-summary">
          {[
            ["TOKEN",    `${session.tokenMeta.symbol} — ${session.tokenMeta.name}`],
            ["RUG TYPE", session.summary.rugType],
            ["PEAK SCORE", `${session.summary.peakScore.toFixed(0)} / 100`],
            ["LIQ LOST",  fmtUsd(session.summary.totalLiquidityLost)],
            ["DURATION",  `${session.summary.durationMinutes} min`],
            ["EVENTS",    String(session.events.length)],
          ].map(([label, value]) => (
            <div key={label} className="summary-item">
              <span className="summary-label">{label}</span>
              <span className={`summary-value ${label === "RUG TYPE" || label === "PEAK SCORE" ? "summary-danger" : ""}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── playback controls ─────────────────────────────────────────────── */}
      {session && (
        <div className="replay-controls">
          <button className="ctrl-btn" onClick={reset} disabled={cursor === 0}>⟪ Reset</button>
          {playState === "playing"
            ? <button className="ctrl-btn ctrl-primary" onClick={pause}>⏸ Pause</button>
            : <button className="ctrl-btn ctrl-primary" onClick={play} disabled={playState === "done"}>
                {playState === "done" ? "✓ Done" : "▶ Play"}
              </button>
          }
          <div className="speed-selector">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`speed-btn ${speed === s ? "speed-active" : ""}`}
                onClick={() => setSpeed(s)}
              >{s}×</button>
            ))}
          </div>
          <div className="progress-track flex-1">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="replay-counter">{cursor + 1} / {session.events.length}</span>
        </div>
      )}

      {/* ── main body ─────────────────────────────────────────────────────── */}
      {session && (
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden gap-3 p-3">

          {/* Timeline rail */}
          <div
            ref={timelineRef}
            className="flex flex-col w-full lg:w-72 lg:flex-shrink-0 lg:max-h-none max-h-64 overflow-y-auto bg-[#0d1420] border border-[#1e2d42] rounded-lg"
          >
            <div className="panel-header sticky top-0 bg-[#0d1420] z-10">
              <span className="panel-title">TIMELINE</span>
              <span className="panel-badge panel-badge-info">{displayed.length}</span>
            </div>
            {session.events.map((e, i) => {
              const isCurrent = i === cursor;
              const isPast    = i < cursor;
              const hasAlert  = e.alertsTriggered.length > 0;
              return (
                <button
                  key={e.id}
                  data-idx={i}
                  onClick={() => { stopTimer(); setPlayState("paused"); setCursor(i); }}
                  className={`
                    flex items-start gap-2 px-3 py-2 text-left border-b border-white/5
                    transition-colors text-[0.7rem]
                    ${isCurrent ? "bg-cyan-500/10 border-l-2 border-l-cyan-400" : ""}
                    ${isPast && !isCurrent ? "opacity-60" : ""}
                    ${!isPast && !isCurrent ? "opacity-25" : ""}
                    hover:opacity-100 hover:bg-white/5
                  `}
                >
                  {/* dot */}
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    hasAlert ? "bg-red-500 animate-pulse" : (TYPE_DOT[e.type] ?? "bg-slate-600")
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-1">
                      <span className={`font-bold ${TYPE_COLOR[e.type] ?? "text-slate-400"}`}>
                        {TYPE_LABEL[e.type] ?? e.type}
                      </span>
                      <span className="text-white/30 tabular-nums flex-shrink-0">{relTime(e.timestamp)}</span>
                    </div>
                    <div className="text-white/40 truncate">{shortAddr(e.fromAddress)}</div>
                    {e.valueUsd != null && (
                      <div className="text-white/60 font-medium">{fmtUsd(e.valueUsd)}</div>
                    )}
                    {hasAlert && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {e.alertsTriggered.map((a) => (
                          <span key={a.id} className={`
                            text-[0.55rem] px-1 py-0.5 rounded font-bold tracking-wide
                            ${a.severity === "critical" ? "bg-red-500/30 text-red-300" :
                              a.severity === "high"     ? "bg-orange-500/30 text-orange-300" :
                              "bg-yellow-500/20 text-yellow-300"}
                          `}>
                            ⚠ {a.type.replace(/_/g, " ").toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Center — chart on top, gauge + event card side-by-side below */}
          <div className="flex flex-col gap-3 flex-1 min-w-0">
            {/* Chart — full width */}
            <ReplayChart events={session.events} cursor={cursor} />

            {/* Bottom row: gauge left, event card right */}
            <div className="flex gap-3 items-start">
              {/* Gauge */}
              <div className="w-52 flex-shrink-0">
                <RugGauge scores={scores} />
              </div>

              {/* Event card */}
              {event ? (
                <div className="flex-1 bg-[#0d1420] border border-[#1e2d42] rounded-lg p-4">
                  <div className="text-[0.68rem] tracking-[3px] text-white/30 uppercase mb-3">
                    Current Event · {relTime(event.timestamp)}
                  </div>

                  <div className="flex items-baseline gap-3 mb-2">
                    <span className={`text-xl font-bold ${TYPE_COLOR[event.type] ?? ""}`}>
                      {TYPE_LABEL[event.type] ?? event.type}
                    </span>
                    {event.valueUsd != null && (
                      <span className="text-2xl font-bold text-white">
                        {fmtUsd(event.valueUsd)}
                      </span>
                    )}
                  </div>

                  <div className="text-[0.78rem] text-cyan-400/80 font-mono mb-1">
                    {shortAddr(event.fromAddress)}
                    {event.toAddress ? ` → ${shortAddr(event.toAddress)}` : ""}
                  </div>
                  <div className="text-[0.72rem] text-white/30 mb-3">
                    {fmtTime(event.timestamp)}
                  </div>

                  {event.poolSnapshot && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Liquidity",  fmtUsd(event.poolSnapshot.liquidityUsd)],
                        ["Sell Ratio", `${(event.poolSnapshot.sellPressureRatio ?? 1).toFixed(1)}×`],
                        ["Buy Vol",    fmtUsd(event.poolSnapshot.buyVolume1h)],
                        ["Sell Vol",   fmtUsd(event.poolSnapshot.sellVolume1h)],
                      ].map(([label, val]) => (
                        <div key={label} className="bg-white/5 rounded p-2">
                          <div className="text-[0.62rem] text-white/30 uppercase tracking-widest mb-0.5">{label}</div>
                          <div className="text-[0.88rem] font-bold text-white/80">{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </div>

          {/* Right — alert feed */}
          <div className="w-full lg:w-72 lg:flex-shrink-0 overflow-y-auto bg-[#0d1420] border border-[#1e2d42] rounded-lg">
            <AlertPanel alerts={allAlerts} onDismiss={() => {}} chain="solana-mainnet" />
          </div>
        </div>
      )}
    </div>
  );
}
