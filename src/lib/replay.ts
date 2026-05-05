import type { ReplayEvent, ReplaySession, TokenMeta, TxEvent, Alert, RugScores } from "../types";
import { calcAllScores, generateAlerts } from "./rugDetector";

// ── Curated historical rug events (Solana) ─────────────────────────────────────
// These are well-documented rugs used as demo seeds.
// Real tx hashes are illustrative — the app fetches actual data when an API key is set.

export const DEMO_TOKENS: Array<{ address: string; name: string; symbol: string; description: string }> = [
  {
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    name: "Bonk Inu (Demo Rug)",
    symbol: "BONKRUG",
    description: "Classic PumpFun launch → dev dump pattern",
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    name: "SolanaAI Fake (Demo)",
    symbol: "SAIFAKE",
    description: "Liquidity pull 10 min after launch",
  },
  {
    address: "So11111111111111111111111111111111111111112",
    name: "MoonRocket (Demo)",
    symbol: "MOON",
    description: "Coordinated sell pressure + LP removal",
  },
];

// Build a synthetic replay session from real (or simulated) tx data
export function buildReplaySession(
  txs: TxEvent[],
  tokenMeta: TokenMeta
): ReplaySession {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

  let prevScores: RugScores = { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 };
  const events: ReplayEvent[] = [];
  let firstAlertAt = 0;
  let peakScore = 0;

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    const window = sorted.slice(Math.max(0, i - 30), i + 1);
    const holders = deriveHoldersFromTxs(window);
    const metrics = deriveMetricsFromTxs(window);

    const scores = calcAllScores(holders, window, metrics);
    const alerts = generateAlerts(scores, prevScores, window, metrics);

    if (alerts.length && !firstAlertAt) firstAlertAt = tx.timestamp;
    if (scores.composite > peakScore) peakScore = scores.composite;

    events.push({
      ...tx,
      alertsTriggered: alerts,
      scoresSnapshot: scores,
      poolSnapshot: {
        buyVolume1h: metrics?.buyVolume1h,
        sellVolume1h: metrics?.sellVolume1h,
        liquidityUsd: metrics?.liquidityUsd,
        sellPressureRatio: metrics?.sellPressureRatio,
      },
    });
    prevScores = scores;
  }

  const lastTs = sorted.at(-1)?.timestamp ?? Date.now();
  const firstTs = sorted[0]?.timestamp ?? Date.now();

  const rugType = detectRugType(events);

  return {
    tokenMeta,
    events,
    summary: {
      rugType,
      peakScore,
      totalLiquidityLost: calcLiquidityLost(events),
      durationMinutes: Math.round((lastTs - firstTs) / 60_000),
      firstAlertAt: firstAlertAt || firstTs,
      rugConfirmedAt: lastTs,
    },
  };
}

function detectRugType(events: ReplayEvent[]): string {
  const allAlerts: Alert[] = events.flatMap((e) => e.alertsTriggered);
  const counts = { dev_dump: 0, liquidity_pull: 0, sell_pressure: 0 };
  for (const a of allAlerts) counts[a.type]++;
  const max = Math.max(...Object.values(counts));
  if (max === 0) return "Suspicious Activity";
  const entry = Object.entries(counts).find(([, v]) => v === max)!;
  const labels: Record<string, string> = {
    dev_dump: "Dev Dump Rug",
    liquidity_pull: "Liquidity Pull Rug",
    sell_pressure: "Coordinated Sell Pressure",
  };
  return labels[entry[0]] ?? "Unknown Rug";
}

function calcLiquidityLost(events: ReplayEvent[]): number {
  return events
    .filter((e) => e.type === "remove_liquidity")
    .reduce((s, e) => s + (e.valueUsd ?? 0), 0);
}

function deriveHoldersFromTxs(txs: TxEvent[]) {
  const map = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type === "sell" || tx.type === "remove_liquidity") {
      map.set(tx.fromAddress, (map.get(tx.fromAddress) ?? 0) + (tx.valueUsd ?? 0));
    }
  }
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return sorted.map(([address, bal], i) => ({
    address,
    balance: String(bal),
    percentage: i === 0 ? 40 : 10,
    label: i === 0 ? "Dev Wallet" : undefined,
  }));
}

function deriveMetricsFromTxs(txs: TxEvent[]) {
  const buys = txs.filter((t) => t.type === "buy");
  const sells = txs.filter((t) => t.type === "sell");
  const liqRemoved = txs.filter((t) => t.type === "remove_liquidity");
  const buyVol = buys.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const sellVol = sells.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const liqLost = liqRemoved.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  return {
    liquidityUsd: Math.max(0, 50000 - liqLost),
    liquidityChange1h: liqLost > 0 ? -Math.min(100, (liqLost / 50000) * 100) : 0,
    liquidityChange24h: 0,
    buyVolume1h: buyVol,
    sellVolume1h: sellVol,
    sellPressureRatio: buyVol > 0 ? sellVol / buyVol : sellVol > 0 ? 10 : 1,
    price: 0,
    priceChange1h: 0,
    priceChange24h: 0,
  };
}

// ── Synthetic demo data (when no API key / for instant demo) ───────────────────

export function buildSyntheticReplay(tokenIndex = 0): ReplaySession {
  const demo = DEMO_TOKENS[tokenIndex % DEMO_TOKENS.length];
  const baseTs = Date.now() - 40 * 60 * 1000; // 40 min ago

  const tokenMeta: TokenMeta = {
    address: demo.address,
    name: demo.name,
    symbol: demo.symbol,
    decimals: 9,
    totalSupply: "1000000000",
    chain: "solana-mainnet",
  };

  // Simulate a 40-minute rug timeline
  const rawTxs: Omit<TxEvent, "id">[] = [
    // Normal buy activity (0–10 min)
    ...Array.from({ length: 8 }, (_, i) => ({
      txHash: `buy_${i}`,
      fromAddress: `buyer_${i}`,
      toAddress: demo.address,
      value: "1000000",
      valueUsd: 200 + i * 50,
      type: "buy" as const,
      timestamp: baseTs + i * 75_000,
      tokenSymbol: demo.symbol,
    })),
    // Dev starts selling (10–20 min)
    {
      txHash: "dev_sell_1",
      fromAddress: "DevWallet1111111111111111111111111111111111",
      toAddress: demo.address,
      value: "50000000",
      valueUsd: 8500,
      type: "sell",
      timestamp: baseTs + 10 * 60_000,
      tokenSymbol: demo.symbol,
    },
    {
      txHash: "dev_sell_2",
      fromAddress: "DevWallet1111111111111111111111111111111111",
      toAddress: demo.address,
      value: "100000000",
      valueUsd: 14000,
      type: "sell",
      timestamp: baseTs + 13 * 60_000,
      tokenSymbol: demo.symbol,
    },
    // Panic sells begin (20–30 min)
    ...Array.from({ length: 6 }, (_, i) => ({
      txHash: `panic_${i}`,
      fromAddress: `hodler_${i}`,
      toAddress: "JupiterRouter",
      value: "5000000",
      valueUsd: 300 + i * 80,
      type: "sell" as const,
      timestamp: baseTs + (20 + i * 1.5) * 60_000,
      tokenSymbol: demo.symbol,
    })),
    // Liquidity pulled (30–35 min)
    {
      txHash: "liq_remove_1",
      fromAddress: "DevWallet1111111111111111111111111111111111",
      toAddress: "RaydiumPool",
      value: "200000000",
      valueUsd: 32000,
      type: "remove_liquidity",
      timestamp: baseTs + 30 * 60_000,
      tokenSymbol: demo.symbol,
    },
    {
      txHash: "liq_remove_2",
      fromAddress: "DevWallet1111111111111111111111111111111111",
      toAddress: "RaydiumPool",
      value: "150000000",
      valueUsd: 18000,
      type: "remove_liquidity",
      timestamp: baseTs + 32 * 60_000,
      tokenSymbol: demo.symbol,
    },
    // Final dev dump (35–40 min)
    {
      txHash: "dev_dump_final",
      fromAddress: "DevWallet1111111111111111111111111111111111",
      toAddress: demo.address,
      value: "500000000",
      valueUsd: 3000,
      type: "sell",
      timestamp: baseTs + 37 * 60_000,
      tokenSymbol: demo.symbol,
    },
  ];

  const txs: TxEvent[] = rawTxs.map((t, i) => ({ ...t, id: String(i) }));
  return buildReplaySession(txs, tokenMeta);
}
