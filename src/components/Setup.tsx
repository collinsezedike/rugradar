import { useState } from "react";
import { resetClient } from "../lib/goldrush";

interface Props {
  onSave: (key: string) => void;
}

export function Setup({ onSave }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) { setError("API key cannot be empty"); return; }
    if (trimmed.length < 20) { setError("That doesn't look like a valid API key"); return; }
    localStorage.setItem("rugradar_api_key", trimmed);
    resetClient();
    onSave(trimmed);
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">RugRadar</span>
        </div>
        <p className="setup-tagline">Real-time Solana rug detection powered by GoldRush</p>

        <form onSubmit={handleSubmit} className="setup-form">
          <label className="setup-label">
            GoldRush API Key
            <span className="setup-hint">
              Get yours free at{" "}
              <a
                href="https://goldrush.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="setup-link"
              >
                goldrush.dev
              </a>
            </span>
          </label>
          <input
            type="password"
            className="setup-input"
            placeholder="cqt_rQ..."
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            autoFocus
            autoComplete="off"
          />
          {error && <p className="setup-error">{error}</p>}
          <button type="submit" className="setup-btn">
            Launch RugRadar
          </button>
        </form>

        <div className="setup-features">
          <div className="setup-feature">
            <span className="feature-icon">◆</span>
            Dev wallet dump detection (&gt;20% supply)
          </div>
          <div className="setup-feature">
            <span className="feature-icon">◆</span>
            Liquidity pull monitoring
          </div>
          <div className="setup-feature">
            <span className="feature-icon">◆</span>
            Sell pressure spike alerts
          </div>
          <div className="setup-feature">
            <span className="feature-icon">◆</span>
            Historical rug replay mode
          </div>
        </div>

        <p className="setup-privacy">
          Your API key is stored only in your browser's localStorage — never sent anywhere except GoldRush.
        </p>
      </div>
    </div>
  );
}
