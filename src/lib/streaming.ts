import { StreamingChain, StreamingProtocol } from "@covalenthq/client-sdk";
import { getClient } from "./goldrush";
import type { TxEvent, PoolMetrics, StreamMessage } from "../types";

// ── Chain mapping ─────────────────────────────────────────────────────────────

const CHAIN_MAP: Partial<Record<string, StreamingChain>> = {
  "solana-mainnet": StreamingChain.SOLANA_MAINNET,
  "eth-mainnet":    StreamingChain.ETH_MAINNET,
  "base-mainnet":   StreamingChain.BASE_MAINNET,
  "bsc-mainnet":    StreamingChain.BSC_MAINNET,
  "matic-mainnet":  StreamingChain.POLYGON_MAINNET,
};

const SOLANA_PROTOCOLS = [
  StreamingProtocol.RAYDIUM_AMM,
  StreamingProtocol.RAYDIUM_CLMM,
  StreamingProtocol.RAYDIUM_CPMM,
  StreamingProtocol.PUMP_DOT_FUN,
  StreamingProtocol.PUMP_FUN_AMM,
  StreamingProtocol.MOONSHOT,
  StreamingProtocol.METEORA_DAMM,
  StreamingProtocol.METEORA_DLMM,
];

const EVM_PROTOCOLS = [
  StreamingProtocol.UNISWAP_V2,
  StreamingProtocol.UNISWAP_V3,
];

// ── Global event bus ──────────────────────────────────────────────────────────

const subscribers = new Set<(msg: StreamMessage) => void>();

export function subscribe(fn: (msg: StreamMessage) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit(msg: StreamMessage) {
  subscribers.forEach((fn) => fn(msg));
}

// ── Active subscriptions registry ────────────────────────────────────────────

const active: Array<() => void> = [];

export function disconnect() {
  active.forEach((fn) => fn());
  active.length = 0;
  emit({ type: "disconnected", data: null });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Subscribe to live wallet transactions (swap, transfer, remove-liq). */
export function subscribeWalletActivity(
  address: string,
  chain: string,
  onTx: (tx: TxEvent) => void
): () => void {
  const chainName = CHAIN_MAP[chain];
  if (!chainName) return () => {};

  let unsub: (() => void) | undefined;
  try {
    const client = getClient();
    emit({ type: "connected", data: null });

    unsub = client.StreamingService.subscribeToWalletActivity(
      { chain_name: chainName, wallet_addresses: [address] },
      {
        next(raw: any) {
          const tx = parseWalletTx(raw, address);
          if (tx) { onTx(tx); emit({ type: "tx", data: tx }); }
        },
        error(e: any) { emit({ type: "error", data: String(e) }); },
        complete() { emit({ type: "disconnected", data: null }); },
      }
    );
  } catch (e) {
    emit({ type: "error", data: String(e) });
  }

  const cleanup = () => unsub?.();
  active.push(cleanup);
  return cleanup;
}

/** Subscribe to real-time token price + liquidity + buy/sell volume. */
export function subscribeTokenUpdates(
  tokenAddress: string,
  chain: string,
  onUpdate: (metrics: Partial<PoolMetrics>) => void
): () => void {
  const chainName = CHAIN_MAP[chain];
  if (!chainName) return () => {};

  let unsub: (() => void) | undefined;
  try {
    const client = getClient();

    unsub = client.StreamingService.subscribeToUpdateTokens(
      { chain_name: chainName, token_addresses: [tokenAddress] },
      {
        next(raw: any) {
          const metrics = parseTokenUpdate(raw);
          onUpdate(metrics);
          emit({ type: "price", data: metrics });
        },
        error(e: any) { emit({ type: "error", data: String(e) }); },
        complete() {},
      }
    );
  } catch (e) {
    emit({ type: "error", data: String(e) });
  }

  const cleanup = () => unsub?.();
  active.push(cleanup);
  return cleanup;
}

/** Subscribe to new DEX pairs for rug-launch detection. */
export function subscribeNewPairs(
  chain: string,
  onPair: (pair: { pairAddress: string; liquidityUsd: number; deployer: string }) => void
): () => void {
  const chainName = CHAIN_MAP[chain];
  if (!chainName) return () => {};

  const protocols = chain === "solana-mainnet" ? SOLANA_PROTOCOLS : EVM_PROTOCOLS;
  let unsub: (() => void) | undefined;
  try {
    const client = getClient();

    unsub = client.StreamingService.subscribeToNewPairs(
      { chain_name: chainName, protocols },
      {
        next(raw: any) {
          const pair = {
            pairAddress:  raw.pair_address  ?? "",
            liquidityUsd: Number(raw.liquidity ?? 0),
            deployer:     raw.deployer_address ?? "",
          };
          onPair(pair);
          emit({ type: "liquidity", data: pair });
        },
        error(e: any) { emit({ type: "error", data: String(e) }); },
        complete() {},
      }
    );
  } catch (e) {
    emit({ type: "error", data: String(e) });
  }

  const cleanup = () => unsub?.();
  active.push(cleanup);
  return cleanup;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseWalletTx(raw: any, watchAddress: string): TxEvent | null {
  if (!raw?.tx_hash) return null;

  const decodedType: string = (raw.decoded_type ?? "").toLowerCase();
  const details = raw.decoded_details ?? {};
  const from = raw.from_address ?? "";
  const to   = raw.to_address   ?? "";
  const watch = watchAddress.toLowerCase();

  // Classify by decoded_type from the API
  let type: TxEvent["type"] = "unknown";
  if (decodedType.includes("withdraw") || decodedType.includes("removeliquidity")) {
    type = "remove_liquidity";
  } else if (decodedType.includes("deposit") || decodedType.includes("addliquidity")) {
    type = "add_liquidity";
  } else if (decodedType.includes("swap")) {
    type = from.toLowerCase() === watch ? "sell" : "buy";
  } else if (from.toLowerCase() === watch) {
    type = "sell";
  } else if (to.toLowerCase() === watch) {
    type = "buy";
  } else {
    type = "transfer";
  }

  // Extract USD value from decoded_details
  let valueUsd: number | undefined;
  if (details.quote_usd)           valueUsd = Number(details.quote_usd);
  else if (details.amount_in)      valueUsd = Number(details.amount_in) / 1e6;

  return {
    id:          raw.tx_hash,
    txHash:      raw.tx_hash,
    fromAddress: from,
    toAddress:   to,
    value:       String(raw.value ?? "0"),
    valueUsd,
    type,
    timestamp:   raw.block_signed_at
      ? new Date(raw.block_signed_at).getTime()
      : Date.now(),
    blockHeight: raw.block_height ?? undefined,
    tokenSymbol: details.contract_metadata?.contract_ticker_symbol
      ?? details.token_in?.contract_ticker_symbol
      ?? undefined,
  };
}

function parseTokenUpdate(raw: any): Partial<PoolMetrics> {
  const hr1 = raw.last_1hr ?? {};
  const buyVol  = Number(hr1.buy_volume?.current_value  ?? 0);
  const sellVol = Number(hr1.sell_volume?.current_value ?? 0);
  const price   = Number(hr1.price?.current_value ?? raw.quote_rate_usd ?? 0);
  const pricePct = Number(hr1.price?.pct_change ?? 0);
  const liquidity = Number(raw.liquidity ?? 0);

  return {
    price,
    priceChange1h:    pricePct,
    priceChange24h:   Number(raw.last_24hr?.price?.pct_change ?? 0),
    liquidityUsd:     liquidity,
    liquidityChange1h: Number(raw.last_1hr?.volume?.pct_change ?? 0),
    buyVolume1h:      buyVol,
    sellVolume1h:     sellVol,
    sellPressureRatio: buyVol > 0 ? sellVol / buyVol : sellVol > 0 ? 10 : 1,
  };
}

// Legacy connect() shim so useMonitor doesn't need changes for the hook call
export function connect(_apiKey: string) {
  // No-op: SDK's StreamingService manages its own WebSocket lifecycle
  // Connection happens lazily on first subscribe call
}
