# RugRadar

**Real-time Solana rug detection powered by the [GoldRush Streaming API](https://goldrush.dev) by Covalent.**

RugRadar monitors any Solana token or wallet address and fires instant alerts when it detects the three most common rug-pull patterns — before most traders even notice.

---

## Why RugRadar

Solana rug pulls follow predictable on-chain patterns: a dev wallet dumps supply, liquidity is drained from Raydium/Orca, or coordinated wallets create abnormal sell pressure. These signals appear in the transaction stream seconds before the price collapses. RugRadar surfaces them in real time.

---

## Detection Signals

| Signal | Trigger | Severity |
| --- | --- | --- |
| **Dev Wallet Dump** | Top holder sells >20% of supply in a 15-min window | High → Critical |
| **Liquidity Pull** | Pool liquidity drops >30% in 1 hour | High → Critical |
| **Sell Pressure Spike** | Sell/buy volume ratio exceeds 3× | Medium → High |

Each signal contributes to a composite **Rug Score (0–100)**. Alerts include a direct link to [Solscan](https://solscan.io) for the triggering transaction.

---

## GoldRush APIs Used

| API | Purpose |
|-----|---------|
| **GoldRush REST API** · `@covalenthq/client-sdk` | Historical token balances, transaction history, top holders |
| **GoldRush Streaming API** · WebSocket GraphQL | Real-time wallet activity, token price/volume updates, DEX pair events |

**Streaming endpoint:** `wss://streaming.goldrushdata.com/graphql`

Subscriptions active during monitoring:

- `walletActivity` — catches every transfer, swap, and liquidity event in real time
- `tokenUpdates` — sub-second price, liquidity, and volume deltas
- `newDexPairs` — detects new DEX pair creation for the monitored token

---

## Demo Replay Mode

The **Replay** screen lets you step through a historical rug event frame-by-frame. Three curated scenarios are built in:

- **AISWP** — PumpFun launch followed by dev dump within 12 minutes
- **SMOON** — Raydium LP seeded then drained in a single transaction
- **NOVA** — Five coordinated wallets dump simultaneously, triggering 8× sell pressure

You can also paste any Solana token address to replay its real transaction history fetched live from the GoldRush API.

---

## Stack

- **React 19 + TypeScript + Vite 6**
- **Tailwind CSS v4** — utility-first styling on a dark security-dashboard theme
- **`@covalenthq/client-sdk` v3** — typed GoldRush REST client
- **`graphql-ws`** — WebSocket GraphQL for the Streaming API
- No backend — API key stored in `localStorage` only, never sent anywhere except GoldRush

---

## Running Locally

```bash
git clone https://github.com/collinsezedike/rugradar
cd rugradar
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173), enter your [GoldRush API key](https://goldrush.dev), and start monitoring.

> **No key yet?** Click **▶ Replay Demo** — all three scenarios run on synthetic data, no API key required.

---

## Deploy to Vercel

```bash
vercel deploy
```

Or connect the GitHub repo in the Vercel dashboard — zero config needed, `vercel.json` is included.

---

## Project Structure

```text
src/
├── lib/
│   ├── goldrush.ts      # GoldRush REST wrapper (token meta, txs, pool metrics)
│   ├── streaming.ts     # WebSocket streaming client (graphql-ws)
│   ├── rugDetector.ts   # Scoring engine: dev dump / liquidity pull / sell pressure
│   └── replay.ts        # Replay builder + three synthetic rug scenarios
├── hooks/
│   └── useMonitor.ts    # Combines REST polling + live WebSocket streams
└── components/
    ├── Setup.tsx         # API key entry (localStorage)
    ├── Dashboard.tsx     # Main monitoring layout
    ├── RugGauge.tsx      # SVG arc gauge — composite rug score 0–100
    ├── AlertPanel.tsx    # Real-time alert cards with Solscan links
    ├── TxFeed.tsx        # Live transaction stream
    ├── MetricsRow.tsx    # Liquidity, volume, sell/buy ratio
    ├── HolderList.tsx    # Top holders with dev wallet flag
    └── ReplayMode.tsx    # Animated historical replay with timeline rail
```

---

Built for the [GoldRush Track — Superteam Earn](https://superteam.fun/earn/listing/build-with-goldrush-track-powered-by-covalent) hackathon.
