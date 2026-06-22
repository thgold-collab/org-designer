import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { OrgChart } from "./components/OrgChart";
import { MetricsPanel } from "./components/MetricsPanel";
import { useOrg } from "./store";

export default function App() {
  const message = useOrg((s) => s.lastMessage);
  const clearMessage = useOrg((s) => s.clearMessage);
  const undo = useOrg((s) => s.undo);
  const redo = useOrg((s) => s.redo);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearMessage, 2600);
    return () => clearTimeout(t);
  }, [message, clearMessage]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <OrgChart />
        <MetricsPanel />
      </div>
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
