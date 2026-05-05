import { useEffect, useRef } from "react";
import type { TxEvent } from "../types";

interface Props {
  txs: TxEvent[];
}

const TYPE_LABELS: Record<TxEvent["type"], { label: string; cls: string }> = {
  buy: { label: "BUY", cls: "tx-buy" },
  sell: { label: "SELL", cls: "tx-sell" },
  transfer: { label: "XFER", cls: "tx-transfer" },
  remove_liquidity: { label: "REM LIQ", cls: "tx-remove-liq" },
  add_liquidity: { label: "ADD LIQ", cls: "tx-add-liq" },
  unknown: { label: "???", cls: "tx-unknown" },
};

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmtUsd(v?: number): string {
  if (!v) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TxFeed({ txs }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  // Auto-scroll to top when new txs arrive
  useEffect(() => {
    if (txs.length > prevCount.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevCount.current = txs.length;
  }, [txs.length]);

  return (
    <div className="tx-feed">
      <div className="panel-header">
        <span className="panel-title">LIVE TRANSACTIONS</span>
        <span className="panel-badge panel-badge-info">{txs.length}</span>
      </div>
      <div className="tx-list" ref={listRef}>
        {txs.length === 0 && (
          <div className="tx-empty">Waiting for transactions…</div>
        )}
        {txs.map((tx, i) => {
          const { label, cls } = TYPE_LABELS[tx.type] ?? TYPE_LABELS.unknown;
          const isNew = i === 0;
          return (
            <div key={tx.id} className={`tx-row ${cls} ${isNew ? "tx-row-new" : ""}`}>
              <span className={`tx-badge ${cls}`}>{label}</span>
              <span className="tx-from">{shortAddr(tx.fromAddress)}</span>
              <span className="tx-arrow">→</span>
              <span className="tx-to">{shortAddr(tx.toAddress)}</span>
              <span className="tx-value">{fmtUsd(tx.valueUsd)}</span>
              <span className="tx-time">{fmtTime(tx.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
