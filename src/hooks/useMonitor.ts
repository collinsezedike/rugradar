import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorState, TxEvent, PoolMetrics, RugScores } from "../types";
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

const POLL_INTERVAL = 15_000; // 15s REST polling fallback

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
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRefs = useRef<Array<() => void>>([]);

  const updateScores = useCallback(
    (holders: MonitorState["topHolders"], txs: TxEvent[], metrics: PoolMetrics | null) => {
      const scores    = calcAllScores(holders, txs, metrics);
      const newAlerts = generateAlerts(scores, prevScores.current, txs, metrics);
      prevScores.current = scores;
      setState((prev) => ({
        ...prev,
        scores,
        alerts: newAlerts.length
          ? [...newAlerts, ...prev.alerts.filter((a) => Date.now() - a.timestamp < 600_000)].slice(0, 50)
          : prev.alerts,
        lastUpdated: Date.now(),
      }));
    },
    []
  );

  const fetchAll = useCallback(async (address: string, chain: string) => {
    setState((p) => ({ ...p, isLoading: true, error: null }));
    try {
      const [tokenMeta, topHolders, recentTxs, poolMetrics] = await Promise.all([
        fetchTokenMeta(address, chain),
        fetchTopHolders(address, chain),
        fetchRecentTxs(address, chain, 50),
        fetchPoolMetrics(address, chain),
      ]);
      setState((p) => ({ ...p, tokenMeta, topHolders, recentTxs, poolMetrics, isLoading: false }));
      updateScores(topHolders, recentTxs, poolMetrics);
    } catch (e: any) {
      setState((p) => ({ ...p, isLoading: false, error: e.message ?? "Failed to fetch data" }));
    }
  }, [updateScores]);

  const stopMonitor = useCallback(() => {
    unsubRefs.current.forEach((fn) => fn());
    unsubRefs.current = [];
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    disconnect();
  }, []);

  const startMonitor = useCallback(
    async (address: string, chain = "solana-mainnet") => {
      stopMonitor();
      prevScores.current = { devDump: 0, liquidityPull: 0, sellPressure: 0, composite: 0 };
      setState({ ...DEFAULT_STATE, address, chain, isLoading: true });

      await fetchAll(address, chain);

      const apiKey = localStorage.getItem("rugradar_api_key") ?? "";
      connect(apiKey);

      // Status events
      const unsubStatus = subscribeStream((msg) => {
        if (msg.type === "connected")    setState((p) => ({ ...p, isConnected: true }));
        if (msg.type === "disconnected") setState((p) => ({ ...p, isConnected: false }));
      });

      // Live wallet transactions
      const unsubWallet = subscribeWalletActivity(address, chain, (tx: TxEvent) => {
        setState((prev) => {
          const recentTxs    = [tx, ...prev.recentTxs].slice(0, 100);
          const incomingAlert = alertFromTx(tx, prev.topHolders);
          const scores       = calcAllScores(prev.topHolders, recentTxs, prev.poolMetrics);
          const scoreAlerts  = generateAlerts(scores, prevScores.current, recentTxs, prev.poolMetrics);
          prevScores.current = scores;
          const newAlerts    = [...(incomingAlert ? [incomingAlert] : []), ...scoreAlerts];
          return {
            ...prev,
            recentTxs,
            scores,
            isConnected: true,
            alerts: newAlerts.length ? [...newAlerts, ...prev.alerts].slice(0, 50) : prev.alerts,
            lastUpdated: Date.now(),
          };
        });
      });

      // Live token metrics
      const unsubToken = subscribeTokenUpdates(address, chain, (metrics) => {
        setState((prev) => {
          const poolMetrics = { ...prev.poolMetrics, ...metrics } as PoolMetrics;
          const scores      = calcAllScores(prev.topHolders, prev.recentTxs, poolMetrics);
          const newAlerts   = generateAlerts(scores, prevScores.current, prev.recentTxs, poolMetrics);
          prevScores.current = scores;
          return {
            ...prev,
            poolMetrics,
            scores,
            alerts: newAlerts.length ? [...newAlerts, ...prev.alerts].slice(0, 50) : prev.alerts,
            lastUpdated: Date.now(),
          };
        });
      });

      unsubRefs.current = [unsubStatus, unsubWallet, unsubToken];

      // Polling fallback (15s) — keeps data fresh if streaming is sparse
      pollRef.current = setInterval(() => fetchAll(address, chain), POLL_INTERVAL);
    },
    [fetchAll, stopMonitor]
  );

  const dismissAlert = useCallback((id: string) => {
    setState((p) => ({ ...p, alerts: p.alerts.filter((a) => a.id !== id) }));
  }, []);

  useEffect(() => () => stopMonitor(), [stopMonitor]);

  return { state, startMonitor, stopMonitor, dismissAlert };
}
