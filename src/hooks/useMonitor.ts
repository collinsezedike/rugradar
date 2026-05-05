import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorState, TxEvent, PoolMetrics, Alert, RugScores } from "../types";
import {
  fetchTokenMeta,
  fetchTopHolders,
  fetchRecentTxs,
  fetchPoolMetrics,
} from "../lib/goldrush";
import {
  connect,
  disconnect,
  subscribeWalletActivity,
  subscribeTokenUpdates,
  subscribe as subscribeStream,
} from "../lib/streaming";
import { calcAllScores, generateAlerts, alertFromTx } from "../lib/rugDetector";

const POLL_INTERVAL = 30_000; // 30s REST polling fallback

const DEFAULT_STATE: MonitorState = {
  address: "",
  chain: "solana-mainnet",
  tokenMeta: null,
  topHolders: [],
  poolMetrics: null,
  recentTxs: [],
  alerts: [],
  scores: { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 },
  isConnected: false,
  isLoading: false,
  error: null,
  lastUpdated: null,
};

export function useMonitor() {
  const [state, setState] = useState<MonitorState>(DEFAULT_STATE);
  const prevScores = useRef<RugScores>({ devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRefs = useRef<Array<() => void>>([]);

  // ── Update scores and fire alerts whenever data changes ─────────────────────
  const updateScores = useCallback(
    (
      holders: MonitorState["topHolders"],
      txs: TxEvent[],
      metrics: PoolMetrics | null
    ) => {
      const scores = calcAllScores(holders, txs, metrics);
      const newAlerts = generateAlerts(scores, prevScores.current, txs, metrics);
      prevScores.current = scores;
      setState((prev) => ({
        ...prev,
        scores,
        alerts: newAlerts.length
          ? [
              ...newAlerts,
              ...prev.alerts.filter((a) => Date.now() - a.timestamp < 600_000),
            ].slice(0, 50)
          : prev.alerts,
        lastUpdated: Date.now(),
      }));
    },
    []
  );

  // ── REST fetch cycle (initial load + polling fallback) ────────────────────
  const fetchAll = useCallback(async (address: string, chain: string) => {
    setState((p) => ({ ...p, isLoading: true, error: null }));
    try {
      const [tokenMeta, topHolders, recentTxs, poolMetrics] = await Promise.all([
        fetchTokenMeta(address, chain),
        fetchTopHolders(address, chain),
        fetchRecentTxs(address, chain, 50),
        fetchPoolMetrics(address, chain),
      ]);
      setState((p) => ({
        ...p,
        tokenMeta,
        topHolders,
        recentTxs,
        poolMetrics,
        isLoading: false,
      }));
      updateScores(topHolders, recentTxs, poolMetrics);
    } catch (e: any) {
      setState((p) => ({
        ...p,
        isLoading: false,
        error: e.message ?? "Failed to fetch data",
      }));
    }
  }, [updateScores]);

  // ── Start monitoring an address ───────────────────────────────────────────
  const startMonitor = useCallback(
    async (address: string, chain = "solana-mainnet") => {
      // Tear down previous session
      stopMonitor();
      prevScores.current = { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 };
      setState({ ...DEFAULT_STATE, address, chain, isLoading: true });

      // Initial REST fetch
      await fetchAll(address, chain);

      // Connect WebSocket streaming
      const apiKey = localStorage.getItem("rugradar_api_key") ?? "";
      connect(apiKey);

      // Listen for stream connect/disconnect
      const unsubStatus = subscribeStream((msg) => {
        if (msg.type === "connected") setState((p) => ({ ...p, isConnected: true }));
        if (msg.type === "disconnected") setState((p) => ({ ...p, isConnected: false }));
      });

      // Wallet activity stream
      const unsubWallet = subscribeWalletActivity(address, (tx: TxEvent) => {
        setState((prev) => {
          const recentTxs = [tx, ...prev.recentTxs].slice(0, 100);
          const incomingAlert = alertFromTx(tx, prev.topHolders);
          const scores = calcAllScores(prev.topHolders, recentTxs, prev.poolMetrics);
          const scoreAlerts = generateAlerts(scores, prevScores.current, recentTxs, prev.poolMetrics);
          prevScores.current = scores;
          const newAlerts = [
            ...(incomingAlert ? [incomingAlert] : []),
            ...scoreAlerts,
          ];
          return {
            ...prev,
            recentTxs,
            scores,
            alerts: newAlerts.length
              ? [...newAlerts, ...prev.alerts].slice(0, 50)
              : prev.alerts,
            lastUpdated: Date.now(),
          };
        });
      });

      // Token metrics stream
      const unsubToken = subscribeTokenUpdates(address, (metrics) => {
        setState((prev) => {
          const poolMetrics: PoolMetrics = { ...prev.poolMetrics!, ...metrics } as PoolMetrics;
          const scores = calcAllScores(prev.topHolders, prev.recentTxs, poolMetrics);
          const newAlerts = generateAlerts(scores, prevScores.current, prev.recentTxs, poolMetrics);
          prevScores.current = scores;
          return {
            ...prev,
            poolMetrics,
            scores,
            alerts: newAlerts.length
              ? [...newAlerts, ...prev.alerts].slice(0, 50)
              : prev.alerts,
            lastUpdated: Date.now(),
          };
        });
      });

      unsubRefs.current = [unsubStatus, unsubWallet, unsubToken];

      // Polling fallback every 30s (in case WS data is sparse)
      pollRef.current = setInterval(() => fetchAll(address, chain), POLL_INTERVAL);
    },
    [fetchAll]
  );

  const stopMonitor = useCallback(() => {
    unsubRefs.current.forEach((fn) => fn());
    unsubRefs.current = [];
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    disconnect();
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setState((p) => ({ ...p, alerts: p.alerts.filter((a) => a.id !== id) }));
  }, []);

  useEffect(() => () => stopMonitor(), [stopMonitor]);

  return { state, startMonitor, stopMonitor, dismissAlert };
}
