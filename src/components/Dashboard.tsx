import type { MonitorState } from "../types";
import { AlertPanel } from "./AlertPanel";
import { RugGauge } from "./RugGauge";
import { TxFeed } from "./TxFeed";
import { MetricsRow } from "./MetricsRow";
import { HolderList } from "./HolderList";

interface Props {
  state: MonitorState;
  onDismiss: (id: string) => void;
}

export function Dashboard({ state, onDismiss }: Props) {
  if (!state.address) {
    return (
      <div className="dashboard-empty">
        <div className="empty-icon">◈</div>
        <div className="empty-title">Enter a token or wallet address to start monitoring</div>
        <div className="empty-sub">
          Or click <strong>▶ Replay Demo</strong> to see a historical rug event replay
        </div>
      </div>
    );
  }

  if (state.isLoading && !state.tokenMeta) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <div>Fetching on-chain data…</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">⚠</div>
        <div className="error-message">{state.error}</div>
        <div className="error-hint">Check your API key or try a different address.</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <MetricsRow
        tokenMeta={state.tokenMeta}
        metrics={state.poolMetrics}
        isConnected={state.isConnected}
        lastUpdated={state.lastUpdated}
      />

      <div className="dashboard-body">
        {/* Left column */}
        <div className="col-left">
          <AlertPanel alerts={state.alerts} onDismiss={onDismiss} />
          <HolderList holders={state.topHolders} />
        </div>

        {/* Center column */}
        <div className="col-center">
          <RugGauge scores={state.scores} />
        </div>

        {/* Right column */}
        <div className="col-right">
          <TxFeed txs={state.recentTxs} />
        </div>
      </div>
    </div>
  );
}
