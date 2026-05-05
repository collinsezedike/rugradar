import type { PoolMetrics, TokenMeta } from "../types";

interface Props {
  tokenMeta: TokenMeta | null;
  metrics: PoolMetrics | null;
  isConnected: boolean;
  lastUpdated: number | null;
}

function Metric({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className={`metric-card ${danger ? "metric-danger" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function fmtUsd(v: number): string {
  if (!v) return "$0";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number, plusSign = false): string {
  const sign = v > 0 && plusSign ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtRatio(v: number): string {
  return `${v.toFixed(1)}x`;
}

function fmtAge(ts: number | null): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function MetricsRow({ tokenMeta, metrics, isConnected, lastUpdated }: Props) {
  return (
    <div className="metrics-row">
      <div className="token-identity">
        {tokenMeta?.logoUrl && (
          <img src={tokenMeta.logoUrl} alt="" className="token-logo" />
        )}
        <div className="token-name-block">
          <span className="token-symbol">{tokenMeta?.symbol ?? "—"}</span>
          <span className="token-name">{tokenMeta?.name ?? "No token loaded"}</span>
        </div>
        <div className={`conn-dot ${isConnected ? "conn-dot-live" : "conn-dot-off"}`} title={isConnected ? "Live stream connected" : "Polling mode"}>
          {isConnected ? "● LIVE" : "○ POLLING"}
        </div>
      </div>

      <div className="metric-cards">
        <Metric
          label="LIQUIDITY"
          value={metrics ? fmtUsd(metrics.liquidityUsd) : "—"}
          sub={metrics ? fmtPct(metrics.liquidityChange1h, true) + " 1h" : undefined}
          danger={!!metrics && metrics.liquidityChange1h < -30}
        />
        <Metric
          label="BUY VOL (1h)"
          value={metrics ? fmtUsd(metrics.buyVolume1h) : "—"}
        />
        <Metric
          label="SELL VOL (1h)"
          value={metrics ? fmtUsd(metrics.sellVolume1h) : "—"}
          danger={!!metrics && metrics.sellVolume1h > metrics.buyVolume1h * 3}
        />
        <Metric
          label="SELL/BUY RATIO"
          value={metrics ? fmtRatio(metrics.sellPressureRatio) : "—"}
          danger={!!metrics && metrics.sellPressureRatio > 3}
        />
        <Metric
          label="PRICE"
          value={metrics?.price ? fmtUsd(metrics.price) : "—"}
          sub={metrics?.priceChange1h ? fmtPct(metrics.priceChange1h, true) + " 1h" : undefined}
        />
        <Metric
          label="UPDATED"
          value={fmtAge(lastUpdated)}
        />
      </div>
    </div>
  );
}
