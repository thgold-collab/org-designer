import React from "react";

interface State {
  error: Error | null;
  componentStack: string | null;
}

/** Renders any React error on screen instead of letting the page go blank. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (error) {
      return (
        <div className="err-overlay">
          <strong>App error (please screenshot this):</strong>
          {/* Name + message first — WebKit's stack omits these and they're what matters. */}
          <pre>{(error.name || "Error") + ": " + (error.message || "(no message)")}</pre>
          {componentStack && (
            <>
              <strong>Component:</strong>
              <pre>{componentStack.split("\n").slice(0, 6).join("\n")}</pre>
            </>
          )}
          <strong>Stack:</strong>
          <pre>{String(error.stack || "").split("\n").slice(0, 6).join("\n")}</pre>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
