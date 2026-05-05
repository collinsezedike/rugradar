import { GoldRushClient } from "@covalenthq/client-sdk";
import type { TokenMeta, HolderInfo, TxEvent, PoolMetrics } from "../types";

let _client: GoldRushClient | null = null;

export function getClient(): GoldRushClient {
  const key = localStorage.getItem("rugradar_api_key");
  if (!key) throw new Error("No API key configured");
  if (!_client) _client = new GoldRushClient(key);
  return _client;
}

export function resetClient() {
  _client = null;
}

export async function fetchTokenMeta(address: string, chain = "solana-mainnet"): Promise<TokenMeta> {
  const client = getClient();
  try {
    const resp = await client.BalanceService.getTokenBalancesForWalletAddress(
      chain as any,
      address
    );
    const items: any[] = (resp.data?.items ?? []) as any[];
    const token =
      items.find((i: any) => i.contract_address?.toLowerCase() === address.toLowerCase()) ??
      items[0];
    return {
      address,
      name: token?.contract_name ?? "Unknown Token",
      symbol: token?.contract_ticker_symbol ?? "???",
      decimals: token?.contract_decimals ?? 9,
      totalSupply: token?.total_supply ?? token?.balance ?? "0",
      logoUrl: token?.logo_url ?? undefined,
      chain,
    };
  } catch {
    return { address, name: "Unknown Token", symbol: "???", decimals: 9, totalSupply: "0", chain };
  }
}

export async function fetchTopHolders(address: string, chain = "solana-mainnet"): Promise<HolderInfo[]> {
  const client = getClient();
  try {
    const resp = await (client as any).SecurityService?.getTokenApprovalSummary?.(chain, address);
    if (resp?.data?.items) {
      return resp.data.items.slice(0, 10).map((h: any, i: number) => ({
        address: h.address ?? h.spender_address ?? "",
        balance: h.balance ?? "0",
        percentage: h.percentage ?? 0,
        label: i === 0 ? "Dev Wallet (Deployer)" : undefined,
      }));
    }
  } catch {}

  // Fallback: derive from recent transfers
  const txs = await fetchRecentTxs(address, chain, 50);
  const balanceMap = new Map<string, bigint>();
  for (const tx of txs) {
    if (tx.type === "transfer" || tx.type === "sell") {
      const val = BigInt(tx.value || "0");
      balanceMap.set(tx.fromAddress, (balanceMap.get(tx.fromAddress) ?? 0n) - val);
      balanceMap.set(tx.toAddress, (balanceMap.get(tx.toAddress) ?? 0n) + val);
    }
  }
  const sorted = [...balanceMap.entries()]
    .filter(([, v]) => v > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 10);
  const total = sorted.reduce((s, [, v]) => s + v, 0n) || 1n;
  return sorted.map(([addr, bal], i) => ({
    address: addr,
    balance: bal.toString(),
    percentage: Number((bal * 10000n) / total) / 100,
    label: i === 0 ? "Top Holder (Est. Dev)" : undefined,
  }));
}

export async function fetchRecentTxs(
  address: string,
  chain = "solana-mainnet",
  limit = 25
): Promise<TxEvent[]> {
  const client = getClient();
  try {
    const resp = await client.TransactionService.getAllTransactionsForAddress(
      chain as any,
      address,
      { noLogs: false, quoteCurrency: "USD" } as any
    );
    const items: any[] = [];
    for await (const page of resp) {
      if (page.data?.items) items.push(...page.data.items);
      if (items.length >= limit) break;
    }
    return items.slice(0, limit).map((tx: any) => parseTx(tx, address));
  } catch (e) {
    console.warn("fetchRecentTxs failed:", e);
    return [];
  }
}

function parseTx(tx: any, watchAddress: string): TxEvent {
  return {
    id: tx.tx_hash ?? String(Math.random()),
    txHash: tx.tx_hash ?? "",
    fromAddress: tx.from_address ?? "",
    toAddress: tx.to_address ?? "",
    value: tx.value ?? "0",
    valueUsd: tx.value_quote ?? undefined,
    type: classifyTx(tx, watchAddress),
    timestamp: tx.block_signed_at
      ? new Date(tx.block_signed_at).getTime()
      : Date.now(),
    blockHeight: tx.block_height ?? undefined,
    tokenSymbol: tx.log_events?.[0]?.decoded?.name ?? undefined,
  };
}

function classifyTx(tx: any, watchAddress: string): TxEvent["type"] {
  for (const log of tx.log_events ?? []) {
    const name = (log.decoded?.name ?? "").toLowerCase();
    if (name.includes("removeliquidity") || name.includes("burn")) return "remove_liquidity";
    if (name.includes("addliquidity") || name.includes("mint")) return "add_liquidity";
    if (name.includes("swap")) {
      return tx.from_address?.toLowerCase() === watchAddress.toLowerCase() ? "sell" : "buy";
    }
  }
  const from = tx.from_address?.toLowerCase() ?? "";
  const watch = watchAddress.toLowerCase();
  if (from === watch) return "sell";
  if (tx.to_address?.toLowerCase() === watch) return "buy";
  return "transfer";
}

export async function fetchPoolMetrics(
  address: string,
  chain = "solana-mainnet"
): Promise<PoolMetrics> {
  const txs = await fetchRecentTxs(address, chain, 100);
  const cutoff = Date.now() - 3_600_000;
  const recent = txs.filter((t) => t.timestamp > cutoff);

  let buyVol = 0, sellVol = 0, liquidityUsd = 0;
  for (const tx of recent) {
    const usd = tx.valueUsd ?? 0;
    if (tx.type === "buy") buyVol += usd;
    if (tx.type === "sell") sellVol += usd;
    if (tx.type === "add_liquidity") liquidityUsd += usd;
    if (tx.type === "remove_liquidity") liquidityUsd -= usd;
  }

  return {
    liquidityUsd: Math.max(0, liquidityUsd),
    liquidityChange1h: liquidityUsd < 0 ? -80 : 5,
    liquidityChange24h: liquidityUsd < 0 ? -90 : -10,
    buyVolume1h: buyVol,
    sellVolume1h: sellVol,
    sellPressureRatio: buyVol > 0 ? sellVol / buyVol : sellVol > 0 ? 99 : 1,
    price: 0,
    priceChange1h: 0,
    priceChange24h: 0,
  };
}
