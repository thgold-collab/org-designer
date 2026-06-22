import React from "react";

interface State {
  error: Error | null;
}

/** Renders any React error on screen instead of letting the page go blank. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="err-overlay">
          <strong>App error (please screenshot this):</strong>
          <pre>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
