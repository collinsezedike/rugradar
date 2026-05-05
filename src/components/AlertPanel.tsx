import type { Alert } from "../types";

interface Props {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<Alert["type"], string> = {
  dev_dump: "◈",
  liquidity_pull: "▼",
  sell_pressure: "↓↓",
};

const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  critical: "alert-critical",
  high: "alert-high",
  medium: "alert-medium",
  low: "alert-low",
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

export function AlertPanel({ alerts, onDismiss }: Props) {
  if (!alerts.length) {
    return (
      <div className="alert-panel">
        <div className="panel-header">
          <span className="panel-title">ALERTS</span>
          <span className="panel-badge panel-badge-safe">ALL CLEAR</span>
        </div>
        <div className="alert-empty">
          <div className="alert-empty-icon">◎</div>
          <div>Monitoring active — no threats detected</div>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-panel">
      <div className="panel-header">
        <span className="panel-title">ALERTS</span>
        <span className="panel-badge panel-badge-danger">{alerts.length} ACTIVE</span>
      </div>
      <div className="alert-list">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-item ${SEVERITY_CLASS[alert.severity]}`}>
            <div className="alert-header-row">
              <span className="alert-icon">{ICONS[alert.type]}</span>
              <span className="alert-message">{alert.message}</span>
              <span className="alert-time">{fmtTime(alert.timestamp)}</span>
              <button className="alert-dismiss" onClick={() => onDismiss(alert.id)} title="Dismiss">×</button>
            </div>
            <div className="alert-detail">{alert.detail}{fmtUsd(alert.value)}</div>
            {alert.txHash && (
              <div className="alert-tx">
                TX: <span className="alert-tx-hash">{shortAddr(alert.txHash)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
