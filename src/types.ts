export interface Alert {
  id: string;
  type: "dev_dump" | "liquidity_pull" | "sell_pressure";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  detail: string;
  timestamp: number;
  txHash?: string;
  value?: number;
}

export interface TokenMeta {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  logoUrl?: string;
  chain: string;
}

export interface HolderInfo {
  address: string;
  balance: string;
  percentage: number;
  label?: string;
}

export interface TxEvent {
  id: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  valueUsd?: number;
  type: "buy" | "sell" | "transfer" | "remove_liquidity" | "add_liquidity" | "unknown";
  timestamp: number;
  blockHeight?: number;
  tokenSymbol?: string;
}

export interface PoolMetrics {
  liquidityUsd: number;
  liquidityChange1h: number;
  liquidityChange24h: number;
  buyVolume1h: number;
  sellVolume1h: number;
  sellPressureRatio: number;
  price: number;
  priceChange1h: number;
  priceChange24h: number;
}

export interface RugScores {
  devDump: number;       // 0-100
  liquidityPull: number; // 0-100
  sellPressure: number;  // 0-100
  composite: number;     // 0-100
}

export interface MonitorState {
  address: string;
  chain: string;
  tokenMeta: TokenMeta | null;
  topHolders: HolderInfo[];
  poolMetrics: PoolMetrics | null;
  recentTxs: TxEvent[];
  alerts: Alert[];
  scores: RugScores;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface ReplayEvent extends TxEvent {
  alertsTriggered: Alert[];
  scoresSnapshot: RugScores;
  poolSnapshot?: Partial<PoolMetrics>;
}

export interface ReplaySession {
  tokenMeta: TokenMeta;
  events: ReplayEvent[];
  summary: {
    rugType: string;
    peakScore: number;
    totalLiquidityLost: number;
    durationMinutes: number;
    firstAlertAt: number;
    rugConfirmedAt: number;
  };
}

export type AppScreen = "setup" | "dashboard" | "replay";

export interface StreamMessage {
  type: "tx" | "price" | "liquidity" | "holder" | "error" | "connected" | "disconnected";
  data: unknown;
}
