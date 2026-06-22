import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

// Surface any uncaught error / promise rejection on screen instead of a blank
// page — critical for debugging on mobile where there's no console.
function showFatal(msg: string) {
  let el = document.getElementById("fatal-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "fatal-overlay";
    el.className = "err-overlay";
    document.body.appendChild(el);
  }
  el.textContent = "Runtime error (please screenshot): " + msg;
}
window.addEventListener("error", (e) => {
  showFatal(`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  showFatal("promise: " + (r?.stack || r?.message || String(r)));
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
