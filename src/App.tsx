import { useEffect, useState } from "react";
import { Setup } from "./components/Setup";
import { Dashboard } from "./components/Dashboard";
import { ReplayMode } from "./components/ReplayMode";
import { AddressBar } from "./components/AddressBar";
import { useMonitor } from "./hooks/useMonitor";
import type { AppScreen } from "./types";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("setup");
  const { state, startMonitor, stopMonitor, dismissAlert } = useMonitor();

  useEffect(() => {
    const saved = localStorage.getItem("rugradar_api_key");
    if (saved) setScreen("dashboard");
  }, []);

  function handleKeySave() {
    setScreen("dashboard");
  }

  function handleSettings() {
    stopMonitor();
    localStorage.removeItem("rugradar_api_key");
    setScreen("setup");
  }

  function handleMonitor(address: string, chain: string) {
    startMonitor(address, chain);
    setScreen("dashboard");
  }

  function handleReplay() {
    stopMonitor();
    setScreen("replay");
  }

  if (screen === "setup") {
    return <Setup onSave={handleKeySave} />;
  }

  if (screen === "replay") {
    return <ReplayMode onBack={() => setScreen("dashboard")} />;
  }

  return (
    <div className="app">
      <AddressBar
        onMonitor={handleMonitor}
        onReplay={handleReplay}
        isLoading={state.isLoading}
        currentAddress={state.address}
        onSettings={handleSettings}
      />
      <main className="app-main">
        <Dashboard state={state} onDismiss={dismissAlert} />
      </main>
    </div>
  );
}
