import { useEffect, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { OrgChart } from "./components/OrgChart";
import { MetricsPanel } from "./components/MetricsPanel";
import { useOrg } from "./store";

/** True on phone/narrow-tablet widths where we switch to a stacked layout. */
function useCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const handler = () => setCompact(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return compact;
}

export default function App() {
  const message = useOrg((s) => s.lastMessage);
  const clearMessage = useOrg((s) => s.clearMessage);
  const undo = useOrg((s) => s.undo);
  const redo = useOrg((s) => s.redo);
  const compact = useCompact();
  const [mobileView, setMobileView] = useState<"chart" | "panel">("chart");

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
      <div className={`main${compact ? ` compact view-${mobileView}` : ""}`}>
        <OrgChart />
        <MetricsPanel />
      </div>
      {compact && (
        <div className="mobile-tabbar">
          <button
            className={mobileView === "chart" ? "active" : ""}
            onClick={() => setMobileView("chart")}
          >
            ▦ Org chart
          </button>
          <button
            className={mobileView === "panel" ? "active" : ""}
            onClick={() => setMobileView("panel")}
          >
            ▤ Metrics
          </button>
        </div>
      )}
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
