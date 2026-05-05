import type { ReplayEvent, ReplaySession, TokenMeta, TxEvent, RugScores } from "../types";
import { calcAllScores, generateAlerts } from "./rugDetector";

// ── Known demo scenarios ──────────────────────────────────────────────────────
// Synthetic replays modelled on real 2024 Solana rug patterns.
// Addresses are illustrative; real-chain fetches use the GoldRush REST API.

export const DEMO_TOKENS: Array<{
  address: string;
  name: string;
  symbol: string;
  description: string;
  rugType: string;
}> = [
  {
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    name: "AISwap Protocol",
    symbol: "AISWP",
    description: "PumpFun launch → dev dump within 12 min",
    rugType: "Dev Dump",
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    name: "SolMoon Finance",
    symbol: "SMOON",
    description: "Raydium LP seeded then drained in one tx",
    rugType: "Liquidity Pull",
  },
  {
    address: "So11111111111111111111111111111111111111112",
    name: "NovaDEX Token",
    symbol: "NOVA",
    description: "Coordinated wallets dump → 8× sell pressure",
    rugType: "Sell Pressure",
  },
];

// ── Replay builder from real tx data ─────────────────────────────────────────

export function buildReplaySession(txs: TxEvent[], tokenMeta: TokenMeta): ReplaySession {
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
        buyVolume1h: metrics.buyVolume1h,
        sellVolume1h: metrics.sellVolume1h,
        liquidityUsd: metrics.liquidityUsd,
        sellPressureRatio: metrics.sellPressureRatio,
      },
    });
    prevScores = scores;
  }

  const firstTs = sorted[0]?.timestamp ?? Date.now();
  const lastTs = sorted.at(-1)?.timestamp ?? Date.now();

  return {
    tokenMeta,
    events,
    summary: {
      rugType: detectRugType(events),
      peakScore,
      totalLiquidityLost: calcLiquidityLost(events),
      durationMinutes: Math.round((lastTs - firstTs) / 60_000),
      firstAlertAt: firstAlertAt || firstTs,
      rugConfirmedAt: lastTs,
    },
  };
}

// ── Synthetic rug replays ─────────────────────────────────────────────────────

/** Scenario 0 — "AISwap Protocol": classic PumpFun dev dump */
function buildDevDumpReplay(): ReplaySession {
  const DEV = "Dev1111111111111111111111111111111111111111";
  const base = Date.now() - 55 * 60_000;
  const min = (m: number) => base + m * 60_000;

  const tokenMeta: TokenMeta = {
    address: DEMO_TOKENS[0].address,
    name: "AISwap Protocol",
    symbol: "AISWP",
    decimals: 9,
    totalSupply: "1000000000",
    chain: "solana-mainnet",
  };

  const raw: Omit<TxEvent, "id">[] = [
    // 0–6 min: organic buys after PumpFun launch
    tx("buy0",  "Buyer_A",  DEV,  "buy",  min(0),  180),
    tx("buy1",  "Buyer_B",  DEV,  "buy",  min(1),  340),
    tx("buy2",  "Buyer_C",  DEV,  "buy",  min(2),  510),
    tx("buy3",  "Buyer_D",  DEV,  "buy",  min(3),  290),
    tx("buy4",  "Buyer_E",  DEV,  "buy",  min(4),  870),
    tx("buy5",  "Buyer_F",  DEV,  "buy",  min(5),  1200),
    tx("buy6",  "Buyer_G",  DEV,  "buy",  min(6),  640),
    // 7–8 min: influencer tweet → volume spike
    tx("buy7",  "Ape_1",   DEV,  "buy",  min(7),  3400),
    tx("buy8",  "Ape_2",   DEV,  "buy",  min(7.5), 2100),
    tx("buy9",  "Ape_3",   DEV,  "buy",  min(8),  4800),
    // 9 min: dev starts draining — FIRST SIGNAL
    tx("ds1",   DEV, "Jupiter", "sell", min(9),   8500),
    tx("ds2",   DEV, "Jupiter", "sell", min(10),  14000),
    tx("ds3",   DEV, "Jupiter", "sell", min(11),  19000),
    tx("ds4",   DEV, "Jupiter", "sell", min(12),  22000),
    // 13 min: panic sets in
    tx("ps1",   "Ape_3",   "Jupiter", "sell", min(13), 4200),
    tx("ps2",   "Ape_1",   "Jupiter", "sell", min(13.5), 3100),
    tx("ps3",   "Buyer_F", "Jupiter", "sell", min(14), 1000),
    tx("ps4",   "Buyer_E", "Jupiter", "sell", min(14.5), 820),
    // 15 min: dev pulls remaining liquidity — CRITICAL SIGNAL
    tx("liq1",  DEV, "Raydium", "remove_liquidity", min(15), 38000),
    tx("liq2",  DEV, "Raydium", "remove_liquidity", min(15.5), 12000),
    // 16–18 min: final dump, token near zero
    tx("ds5",   DEV, "Jupiter", "sell", min(16), 3200),
    tx("final1","Buyer_G","Jupiter","sell", min(17), 310),
    tx("final2","Buyer_D","Jupiter","sell", min(18), 90),
  ];

  return buildReplaySession(raw.map((t, i) => ({ ...t, id: String(i) })), tokenMeta);
}

/** Scenario 1 — "SolMoon Finance": single LP drain */
function buildLiquidityPullReplay(): ReplaySession {
  const DEV = "Dev2222222222222222222222222222222222222222";
  const base = Date.now() - 70 * 60_000;
  const min = (m: number) => base + m * 60_000;

  const tokenMeta: TokenMeta = {
    address: DEMO_TOKENS[1].address,
    name: "SolMoon Finance",
    symbol: "SMOON",
    decimals: 9,
    totalSupply: "500000000",
    chain: "solana-mainnet",
  };

  const raw: Omit<TxEvent, "id">[] = [
    // Normal trading phase 0–20 min
    tx("b0",  "W_A", DEV, "buy",  min(0),  800),
    tx("b1",  "W_B", DEV, "buy",  min(2),  1400),
    tx("b2",  "W_C", DEV, "buy",  min(4),  2200),
    tx("lp1", DEV,   "Orca", "add_liquidity", min(5), 45000),
    tx("b3",  "W_D", DEV, "buy",  min(7),  3100),
    tx("b4",  "W_E", DEV, "buy",  min(9),  1700),
    tx("b5",  "W_F", DEV, "buy",  min(11), 2900),
    tx("b6",  "W_G", DEV, "buy",  min(14), 4400),
    tx("b7",  "W_H", DEV, "buy",  min(17), 3800),
    tx("s0",  "W_A", "Jupiter", "sell", min(18), 700),
    // 21 min: dev drains 97% of LP in one shot — CRITICAL
    tx("drain","Dev2222222222222222222222222222222222222222","Orca","remove_liquidity",min(21),43600),
    // panic cascade
    tx("ps1","W_D","Jupiter","sell",min(22),2900),
    tx("ps2","W_E","Jupiter","sell",min(22.5),1600),
    tx("ps3","W_F","Jupiter","sell",min(23),2700),
    tx("ps4","W_G","Jupiter","sell",min(24),4100),
    tx("ps5","W_H","Jupiter","sell",min(25),3500),
    tx("ps6","W_B","Jupiter","sell",min(26),1200),
    tx("ps7","W_C","Jupiter","sell",min(28),2100),
  ];

  return buildReplaySession(raw.map((t, i) => ({ ...t, id: String(i) })), tokenMeta);
}

/** Scenario 2 — "NovaDEX Token": coordinated sell pressure */
function buildSellPressureReplay(): ReplaySession {
  const DEV = "Dev3333333333333333333333333333333333333333";
  const base = Date.now() - 90 * 60_000;
  const min = (m: number) => base + m * 60_000;

  const tokenMeta: TokenMeta = {
    address: DEMO_TOKENS[2].address,
    name: "NovaDEX Token",
    symbol: "NOVA",
    decimals: 9,
    totalSupply: "2000000000",
    chain: "solana-mainnet",
  };

  // 5 coordinated wallets (all pre-funded by dev)
  const CARTEL = ["Bot_A","Bot_B","Bot_C","Bot_D","Bot_E"];
  const raw: Omit<TxEvent, "id">[] = [
    // 0–15 min: cartel accumulates
    ...CARTEL.flatMap((w, i) => [
      tx(`acc_${w}_1`, "Market", w, "buy", min(i * 2), 5000 + i * 800),
      tx(`acc_${w}_2`, "Market", w, "buy", min(i * 2 + 1), 3000 + i * 400),
    ]),
    // 15–18 min: organic buyers pile in
    tx("ob1","RetailA",DEV,"buy",min(15),1200),
    tx("ob2","RetailB",DEV,"buy",min(16),800),
    tx("ob3","RetailC",DEV,"buy",min(17),2100),
    tx("ob4","RetailD",DEV,"buy",min(18),1600),
    // 19 min: coordinated dump starts — SELL PRESSURE SIGNAL
    ...CARTEL.flatMap((w, i) => [
      tx(`dump_${w}_1`,w,"Jupiter","sell",min(19 + i * 0.4),6200 + i * 500),
      tx(`dump_${w}_2`,w,"Jupiter","sell",min(20 + i * 0.4),5800 + i * 400),
      tx(`dump_${w}_3`,w,"Jupiter","sell",min(21 + i * 0.4),4400 + i * 300),
    ]),
    // 24 min: LP also pulled
    tx("liq_pull",DEV,"Raydium","remove_liquidity",min(24),28000),
    // Final retail panic
    tx("rp1","RetailA","Jupiter","sell",min(25),1100),
    tx("rp2","RetailB","Jupiter","sell",min(26),750),
    tx("rp3","RetailC","Jupiter","sell",min(27),1900),
    tx("rp4","RetailD","Jupiter","sell",min(28),1400),
  ];

  return buildReplaySession(raw.map((t, i) => ({ ...t, id: String(i) })), tokenMeta);
}

export function buildSyntheticReplay(index = 0): ReplaySession {
  const builders = [buildDevDumpReplay, buildLiquidityPullReplay, buildSellPressureReplay];
  return builders[index % builders.length]();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tx(
  txHash: string,
  from: string,
  to: string,
  type: TxEvent["type"],
  timestamp: number,
  valueUsd: number
): Omit<TxEvent, "id"> {
  return {
    txHash,
    fromAddress: from,
    toAddress: to,
    value: String(Math.round(valueUsd * 1e6)),
    valueUsd,
    type,
    timestamp,
    tokenSymbol: undefined,
  };
}

function detectRugType(events: ReplayEvent[]): string {
  const counts = { dev_dump: 0, liquidity_pull: 0, sell_pressure: 0 } as Record<string, number>;
  for (const e of events) for (const a of e.alertsTriggered) counts[a.type] = (counts[a.type] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const labels: Record<string, string> = {
    dev_dump: "Dev Dump Rug",
    liquidity_pull: "Liquidity Pull Rug",
    sell_pressure: "Coordinated Sell Pressure",
  };
  return top ? (labels[top[0]] ?? "Rug") : "Suspicious Activity";
}

function calcLiquidityLost(events: ReplayEvent[]): number {
  return events
    .filter((e) => e.type === "remove_liquidity")
    .reduce((s, e) => s + (e.valueUsd ?? 0), 0);
}

function deriveHoldersFromTxs(txs: TxEvent[]) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.type === "sell" || t.type === "remove_liquidity")
      map.set(t.fromAddress, (map.get(t.fromAddress) ?? 0) + (t.valueUsd ?? 0));
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
  const buyVol  = txs.filter((t) => t.type === "buy").reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const sellVol = txs.filter((t) => t.type === "sell").reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const liqOut  = txs.filter((t) => t.type === "remove_liquidity").reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const liqIn   = txs.filter((t) => t.type === "add_liquidity").reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const netLiq  = 50000 + liqIn - liqOut;
  return {
    liquidityUsd: Math.max(0, netLiq),
    liquidityChange1h: liqOut > 0 ? -Math.min(100, (liqOut / 50000) * 100) : 5,
    liquidityChange24h: -10,
    buyVolume1h: buyVol,
    sellVolume1h: sellVol,
    sellPressureRatio: buyVol > 0 ? sellVol / buyVol : sellVol > 0 ? 10 : 1,
    price: 0,
    priceChange1h: 0,
    priceChange24h: 0,
  };
}
