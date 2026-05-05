import { useState } from "react";

interface Props {
  onMonitor: (address: string, chain: string) => void;
  onReplay: () => void;
  isLoading: boolean;
  currentAddress: string;
  onSettings: () => void;
}

const CHAIN_OPTIONS = [
  { value: "solana-mainnet", label: "Solana" },
  { value: "eth-mainnet", label: "Ethereum" },
  { value: "matic-mainnet", label: "Polygon" },
  { value: "bsc-mainnet", label: "BNB Chain" },
];

const EXAMPLE_ADDRESSES = [
  { label: "SOL Example", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", chain: "solana-mainnet" },
  { label: "ETH Example", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", chain: "eth-mainnet" },
];

export function AddressBar({ onMonitor, onReplay, isLoading, currentAddress, onSettings }: Props) {
  const [address, setAddress] = useState(currentAddress ?? "");
  const [chain, setChain] = useState("solana-mainnet");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    onMonitor(trimmed, chain);
  }

  function loadExample(ex: typeof EXAMPLE_ADDRESSES[0]) {
    setAddress(ex.address);
    setChain(ex.chain);
    onMonitor(ex.address, ex.chain);
  }

  return (
    <header className="address-bar">
      <div className="address-bar-logo">
        <span className="logo-icon-sm">◈</span>
        <span className="logo-text-sm">RugRadar</span>
      </div>

      <form className="address-form" onSubmit={submit}>
        <select
          className="chain-select"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
        >
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <input
          type="text"
          className="address-input"
          placeholder="Token or wallet address…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          spellCheck={false}
        />
        <button type="submit" className="monitor-btn" disabled={isLoading}>
          {isLoading ? "Loading…" : "Monitor"}
        </button>
      </form>

      <div className="address-bar-actions">
        <div className="example-links">
          {EXAMPLE_ADDRESSES.map((ex) => (
            <button key={ex.address} className="example-btn" onClick={() => loadExample(ex)}>
              {ex.label}
            </button>
          ))}
        </div>
        <button className="replay-btn" onClick={onReplay}>
          ▶ Replay Demo
        </button>
        <button className="settings-btn" onClick={onSettings} title="Change API key">
          ⚙
        </button>
      </div>
    </header>
  );
}
