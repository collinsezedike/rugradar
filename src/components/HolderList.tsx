import type { HolderInfo } from "../types";

interface Props {
  holders: HolderInfo[];
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function HolderList({ holders }: Props) {
  return (
    <div className="holder-list">
      <div className="panel-header">
        <span className="panel-title">TOP HOLDERS</span>
        <span className="panel-badge panel-badge-info">{holders.length}</span>
      </div>
      {holders.length === 0 ? (
        <div className="tx-empty">No holder data</div>
      ) : (
        <div className="holder-rows">
          {holders.map((h, i) => (
            <div key={h.address} className={`holder-row ${i === 0 ? "holder-row-dev" : ""}`}>
              <span className="holder-rank">#{i + 1}</span>
              <span className="holder-addr">{shortAddr(h.address)}</span>
              {h.label && <span className="holder-label">{h.label}</span>}
              <span className="holder-bar-track">
                <span
                  className="holder-bar-fill"
                  style={{
                    width: `${Math.min(100, h.percentage)}%`,
                    background: i === 0 ? "#ff6b00" : "#2dff8f",
                  }}
                />
              </span>
              <span className="holder-pct">{h.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
