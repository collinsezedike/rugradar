import type { TxEvent, HolderInfo, PoolMetrics, RugScores, Alert } from "../types";

// ── Thresholds ─────────────────────────────────────────────────────────────────
const DEV_DUMP_THRESHOLD = 20;     // % of supply sold = alert
const LIQUIDITY_PULL_THRESHOLD = 30; // % liquidity removed = alert
const SELL_PRESSURE_THRESHOLD = 3;  // sell/buy ratio = alert
const WINDOW_MS = 15 * 60 * 1000;  // 15-minute rolling window

// ── Score calculators ─────────────────────────────────────────────────────────

export function calcDevDumpScore(
  topHolders: HolderInfo[],
  recentTxs: TxEvent[]
): number {
  if (!topHolders.length) return 0;
  const devWallet = topHolders[0].address.toLowerCase();
  const cutoff = Date.now() - WINDOW_MS;
  const devSells = recentTxs.filter(
    (t) =>
      t.fromAddress.toLowerCase() === devWallet &&
      (t.type === "sell" || t.type === "transfer") &&
      t.timestamp > cutoff
  );
  if (!devSells.length) return 0;
  const totalSoldPct = devSells.reduce((sum, tx) => {
    const pct = tx.valueUsd ? tx.valueUsd / 10 : 0; // rough estimate
    return sum + pct;
  }, 0);
  // Map 0–100% sold → 0–100 score
  const rawScore = Math.min(100, (totalSoldPct / DEV_DUMP_THRESHOLD) * 100);
  return rawScore;
}

export function calcLiquidityScore(metrics: PoolMetrics | null): number {
  if (!metrics) return 0;
  const change = metrics.liquidityChange1h; // negative = liquidity removed
  if (change >= 0) return 0;
  // -0% → 0 score, -100% → 100 score
  const pullPct = Math.min(100, Math.abs(change));
  return Math.min(100, (pullPct / LIQUIDITY_PULL_THRESHOLD) * 100);
}

export function calcSellPressureScore(metrics: PoolMetrics | null, recentTxs: TxEvent[]): number {
  if (metrics) {
    const ratio = metrics.sellPressureRatio;
    if (ratio <= 1) return 0;
    return Math.min(100, ((ratio - 1) / (SELL_PRESSURE_THRESHOLD - 1)) * 100);
  }
  // Fallback: compute from tx list
  const cutoff = Date.now() - WINDOW_MS;
  const recent = recentTxs.filter((t) => t.timestamp > cutoff);
  const sells = recent.filter((t) => t.type === "sell").length;
  const buys = recent.filter((t) => t.type === "buy").length;
  if (!buys && !sells) return 0;
  const ratio = buys > 0 ? sells / buys : sells * 10;
  return Math.min(100, ((ratio - 1) / (SELL_PRESSURE_THRESHOLD - 1)) * 100);
}

export function calcCompositeScore(scores: Omit<RugScores, "composite">): number {
  // Weighted: dev dump 40%, liquidity 40%, sell pressure 20%
  return Math.min(
    100,
    scores.devDump * 0.4 + scores.liquidityPull * 0.4 + scores.sellPressure * 0.2
  );
}

export function calcAllScores(
  topHolders: HolderInfo[],
  recentTxs: TxEvent[],
  metrics: PoolMetrics | null
): RugScores {
  const devDump = calcDevDumpScore(topHolders, recentTxs);
  const liquidityPull = calcLiquidityScore(metrics);
  const sellPressure = calcSellPressureScore(metrics, recentTxs);
  return {
    devDump,
    liquidityPull,
    sellPressure,
    composite: calcCompositeScore({ devDump, liquidityPull, sellPressure }),
  };
}

// ── Alert generation ───────────────────────────────────────────────────────────

export function generateAlerts(
  scores: RugScores,
  prevScores: RugScores,
  recentTxs: TxEvent[],
  metrics: PoolMetrics | null
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  // Dev dump
  if (scores.devDump >= 70 && prevScores.devDump < 70) {
    const latestSell = recentTxs.find((t) => t.type === "sell");
    alerts.push({
      id: `dev_dump_${now}`,
      type: "dev_dump",
      severity: scores.devDump >= 90 ? "critical" : "high",
      message: "Dev wallet dumping tokens",
      detail: `Dev wallet sold >20% of supply in the last 15 min. Score: ${scores.devDump.toFixed(0)}/100`,
      timestamp: now,
      txHash: latestSell?.txHash,
      value: latestSell?.valueUsd,
    });
  } else if (scores.devDump >= 40 && prevScores.devDump < 40) {
    alerts.push({
      id: `dev_dump_warn_${now}`,
      type: "dev_dump",
      severity: "medium",
      message: "Dev wallet selling detected",
      detail: `Significant sell activity from top holder. Score: ${scores.devDump.toFixed(0)}/100`,
      timestamp: now,
    });
  }

  // Liquidity pull
  if (scores.liquidityPull >= 70 && prevScores.liquidityPull < 70) {
    alerts.push({
      id: `liq_${now}`,
      type: "liquidity_pull",
      severity: scores.liquidityPull >= 90 ? "critical" : "high",
      message: "Liquidity being removed",
      detail: `Pool liquidity dropped ${Math.abs(metrics?.liquidityChange1h ?? 0).toFixed(0)}% in 1h. Score: ${scores.liquidityPull.toFixed(0)}/100`,
      timestamp: now,
      value: metrics?.liquidityUsd,
    });
  } else if (scores.liquidityPull >= 40 && prevScores.liquidityPull < 40) {
    alerts.push({
      id: `liq_warn_${now}`,
      type: "liquidity_pull",
      severity: "medium",
      message: "Liquidity declining",
      detail: `Pool liquidity falling. Score: ${scores.liquidityPull.toFixed(0)}/100`,
      timestamp: now,
    });
  }

  // Sell pressure
  if (scores.sellPressure >= 70 && prevScores.sellPressure < 70) {
    alerts.push({
      id: `sell_${now}`,
      type: "sell_pressure",
      severity: "high",
      message: "Abnormal sell pressure spike",
      detail: `Sell/buy ratio: ${(metrics?.sellPressureRatio ?? 0).toFixed(1)}x — far above normal. Score: ${scores.sellPressure.toFixed(0)}/100`,
      timestamp: now,
      value: metrics?.sellVolume1h,
    });
  } else if (scores.sellPressure >= 40 && prevScores.sellPressure < 40) {
    alerts.push({
      id: `sell_warn_${now}`,
      type: "sell_pressure",
      severity: "low",
      message: "Elevated sell pressure",
      detail: `Sell volume exceeding buy volume. Score: ${scores.sellPressure.toFixed(0)}/100`,
      timestamp: now,
    });
  }

  return alerts;
}

// ── Real-time tx alert ─────────────────────────────────────────────────────────

export function alertFromTx(tx: TxEvent, topHolders: HolderInfo[]): Alert | null {
  const devAddr = topHolders[0]?.address?.toLowerCase();
  if (
    tx.type === "remove_liquidity" &&
    (tx.valueUsd ?? 0) > 1000
  ) {
    return {
      id: `liq_tx_${tx.id}`,
      type: "liquidity_pull",
      severity: (tx.valueUsd ?? 0) > 50000 ? "critical" : "high",
      message: "Remove Liquidity detected on-chain",
      detail: `$${fmtUsd(tx.valueUsd)} removed from pool`,
      timestamp: tx.timestamp,
      txHash: tx.txHash,
      value: tx.valueUsd,
    };
  }
  if (
    tx.type === "sell" &&
    devAddr &&
    tx.fromAddress.toLowerCase() === devAddr &&
    (tx.valueUsd ?? 0) > 500
  ) {
    return {
      id: `devdump_tx_${tx.id}`,
      type: "dev_dump",
      severity: (tx.valueUsd ?? 0) > 10000 ? "critical" : "high",
      message: "Dev wallet sell detected on-chain",
      detail: `Dev sold $${fmtUsd(tx.valueUsd)} worth of tokens`,
      timestamp: tx.timestamp,
      txHash: tx.txHash,
      value: tx.valueUsd,
    };
  }
  return null;
}

function fmtUsd(v?: number): string {
  if (!v) return "0";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}
