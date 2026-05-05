import { createClient, type Client } from "graphql-ws";
import type { TxEvent, PoolMetrics, StreamMessage } from "../types";

const STREAMING_URL = "wss://streaming.goldrushdata.com/graphql";

let wsClient: Client | null = null;
const subscribers = new Set<(msg: StreamMessage) => void>();

export function subscribe(fn: (msg: StreamMessage) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit(msg: StreamMessage) {
  subscribers.forEach((fn) => fn(msg));
}

// ── Subscription queries ──────────────────────────────────────────────────────

const WALLET_ACTIVITY_SUB = `
  subscription WalletActivity($address: String!) {
    walletActivity(address: $address) {
      txHash
      fromAddress
      toAddress
      value
      valueQuote
      eventType
      blockSignedAt
      blockHeight
      tokenAddress
      tokenSymbol
    }
  }
`;

const TOKEN_UPDATES_SUB = `
  subscription TokenUpdates($tokenAddress: String!) {
    tokenUpdates(tokenAddress: $tokenAddress) {
      price
      priceChange1h
      priceChange24h
      liquidityUsd
      liquidityChange1h
      buyVolume1h
      sellVolume1h
      updatedAt
    }
  }
`;

const DEX_PAIRS_SUB = `
  subscription NewDexPairs($tokenAddress: String!) {
    newDexPairs(tokenAddress: $tokenAddress) {
      pairAddress
      baseToken
      quoteToken
      liquidityUsd
      createdAt
    }
  }
`;

// ── Connection management ─────────────────────────────────────────────────────

export function connect(apiKey: string): void {
  if (wsClient) return;

  wsClient = createClient({
    url: STREAMING_URL,
    connectionParams: { apiKey },
    retryAttempts: 5,
    on: {
      connected: () => emit({ type: "connected", data: null }),
      closed: () => emit({ type: "disconnected", data: null }),
      error: (e) => emit({ type: "error", data: (e as Error).message }),
    },
  });
}

export function disconnect(): void {
  wsClient?.dispose();
  wsClient = null;
}

// ── Wallet activity subscription ──────────────────────────────────────────────

export function subscribeWalletActivity(
  address: string,
  onTx: (tx: TxEvent) => void
): () => void {
  if (!wsClient) return () => {};

  const unsub = wsClient.subscribe(
    { query: WALLET_ACTIVITY_SUB, variables: { address } },
    {
      next({ data }: { data: any }) {
        const raw = data?.walletActivity;
        if (!raw) return;
        const tx = rawToTxEvent(raw, address);
        onTx(tx);
        emit({ type: "tx", data: tx });
      },
      error(e) { emit({ type: "error", data: String(e) }); },
      complete() {},
    }
  );
  return unsub;
}

// ── Token price / pool metrics subscription ───────────────────────────────────

export function subscribeTokenUpdates(
  tokenAddress: string,
  onUpdate: (metrics: Partial<PoolMetrics>) => void
): () => void {
  if (!wsClient) return () => {};

  const unsub = wsClient.subscribe(
    { query: TOKEN_UPDATES_SUB, variables: { tokenAddress } },
    {
      next({ data }: { data: any }) {
        const raw = data?.tokenUpdates;
        if (!raw) return;
        const metrics: Partial<PoolMetrics> = {
          price: raw.price ?? 0,
          priceChange1h: raw.priceChange1h ?? 0,
          priceChange24h: raw.priceChange24h ?? 0,
          liquidityUsd: raw.liquidityUsd ?? 0,
          liquidityChange1h: raw.liquidityChange1h ?? 0,
          buyVolume1h: raw.buyVolume1h ?? 0,
          sellVolume1h: raw.sellVolume1h ?? 0,
          sellPressureRatio:
            raw.buyVolume1h > 0
              ? raw.sellVolume1h / raw.buyVolume1h
              : raw.sellVolume1h > 0
              ? 99
              : 1,
        };
        onUpdate(metrics);
        emit({ type: "price", data: metrics });
      },
      error(e) { emit({ type: "error", data: String(e) }); },
      complete() {},
    }
  );
  return unsub;
}

// ── DEX pair subscription ─────────────────────────────────────────────────────

export function subscribeNewDexPairs(
  tokenAddress: string,
  onPair: (pair: { pairAddress: string; liquidityUsd: number }) => void
): () => void {
  if (!wsClient) return () => {};

  const unsub = wsClient.subscribe(
    { query: DEX_PAIRS_SUB, variables: { tokenAddress } },
    {
      next({ data }: { data: any }) {
        const raw = data?.newDexPairs;
        if (!raw) return;
        onPair({ pairAddress: raw.pairAddress, liquidityUsd: raw.liquidityUsd ?? 0 });
        emit({ type: "liquidity", data: raw });
      },
      error(e) { emit({ type: "error", data: String(e) }); },
      complete() {},
    }
  );
  return unsub;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rawToTxEvent(raw: any, watchAddress: string): TxEvent {
  const eventType = raw.eventType?.toLowerCase() ?? "";
  let type: TxEvent["type"] = "unknown";
  if (eventType.includes("removeliquidity") || eventType.includes("burn")) type = "remove_liquidity";
  else if (eventType.includes("addliquidity") || eventType.includes("mint")) type = "add_liquidity";
  else if (eventType.includes("swap")) {
    type = raw.fromAddress?.toLowerCase() === watchAddress.toLowerCase() ? "sell" : "buy";
  } else if (raw.fromAddress?.toLowerCase() === watchAddress.toLowerCase()) type = "sell";
  else if (raw.toAddress?.toLowerCase() === watchAddress.toLowerCase()) type = "buy";
  else type = "transfer";

  return {
    id: raw.txHash ?? String(Math.random()),
    txHash: raw.txHash ?? "",
    fromAddress: raw.fromAddress ?? "",
    toAddress: raw.toAddress ?? "",
    value: raw.value ?? "0",
    valueUsd: raw.valueQuote ?? undefined,
    type,
    timestamp: raw.blockSignedAt
      ? new Date(raw.blockSignedAt).getTime()
      : Date.now(),
    blockHeight: raw.blockHeight ?? undefined,
    tokenSymbol: raw.tokenSymbol ?? undefined,
  };
}
