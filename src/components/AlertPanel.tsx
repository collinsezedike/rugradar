import type { Alert } from "../types";

interface Props {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  chain?: string;
}

const TYPE_META: Record<Alert["type"], { icon: string; label: string }> = {
  dev_dump:      { icon: "⚠", label: "DEV DUMP" },
  liquidity_pull: { icon: "▼", label: "LIQ PULL" },
  sell_pressure:  { icon: "↓↓", label: "SELL SPIKE" },
};

const SEVERITY_STYLES: Record<Alert["severity"], { border: string; bg: string; badge: string; dot: string }> = {
  critical: {
    border: "border-l-red-500",
    bg: "bg-red-950/40",
    badge: "bg-red-500/20 text-red-400 border border-red-500/30",
    dot: "bg-red-500 animate-pulse",
  },
  high: {
    border: "border-l-orange-500",
    bg: "bg-orange-950/30",
    badge: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    dot: "bg-orange-500 animate-pulse",
  },
  medium: {
    border: "border-l-yellow-500",
    bg: "bg-yellow-950/20",
    badge: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    dot: "bg-yellow-500",
  },
  low: {
    border: "border-l-slate-500",
    bg: "bg-slate-800/20",
    badge: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    dot: "bg-slate-500",
  },
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtUsd(v?: number): string {
  if (!v) return "";
  if (v >= 1e6) return ` · $${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return ` · $${(v / 1e3).toFixed(1)}K`;
  return ` · $${v.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function solscanTxUrl(txHash: string, chain: string): string {
  if (chain.startsWith("eth")) return `https://etherscan.io/tx/${txHash}`;
  if (chain.startsWith("matic")) return `https://polygonscan.com/tx/${txHash}`;
  if (chain.startsWith("bsc")) return `https://bscscan.com/tx/${txHash}`;
  return `https://solscan.io/tx/${txHash}`;
}

export function AlertPanel({ alerts, onDismiss, chain = "solana-mainnet" }: Props) {
  return (
    <div className="alert-panel">
      <div className="panel-header">
        <span className="panel-title">ALERTS</span>
        {alerts.length === 0 ? (
          <span className="panel-badge panel-badge-safe">ALL CLEAR</span>
        ) : (
          <span className="panel-badge panel-badge-danger">{alerts.length} ACTIVE</span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="alert-empty">
          <div className="alert-empty-icon">◎</div>
          <div>Monitoring active — no threats detected</div>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((alert) => {
            const meta = TYPE_META[alert.type];
            const styles = SEVERITY_STYLES[alert.severity];
            return (
              <div
                key={alert.id}
                className={`
                  border-l-4 ${styles.border} ${styles.bg}
                  px-3 py-2.5 border-b border-white/5
                  animate-[slideIn_0.25s_ease]
                `}
              >
                {/* Header row */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} />
                  <span className={`text-[0.6rem] font-bold tracking-widest px-1.5 py-0.5 rounded ${styles.badge}`}>
                    {meta.label}
                  </span>
                  <span className="flex-1 text-[0.78rem] font-semibold text-white/90 leading-tight">
                    {alert.message}
                  </span>
                  <span className="text-[0.62rem] text-white/30 flex-shrink-0 tabular-nums">
                    {fmtTime(alert.timestamp)}
                  </span>
                  <button
                    className="text-white/20 hover:text-white/60 text-sm leading-none ml-1 flex-shrink-0 transition-colors"
                    onClick={() => onDismiss(alert.id)}
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>

                {/* Detail */}
                <p className="text-[0.71rem] text-white/50 leading-snug ml-3.5">
                  {alert.detail}{fmtUsd(alert.value)}
                </p>

                {/* Solscan link */}
                {alert.txHash && (
                  <div className="flex items-center gap-1.5 mt-1.5 ml-3.5">
                    <span className="text-[0.62rem] text-white/30">TX</span>
                    <a
                      href={solscanTxUrl(alert.txHash, chain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.62rem] text-cyan-400/80 hover:text-cyan-300 font-mono transition-colors underline underline-offset-2"
                    >
                      {shortAddr(alert.txHash)}
                    </a>
                    <span className="text-[0.55rem] text-white/20">↗</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
