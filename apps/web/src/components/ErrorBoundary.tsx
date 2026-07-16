import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * App-wide error boundary. Without it, any render/runtime error unmounts the
 * whole tree and leaves a blank (dark) `#root` with no clue why. This catches
 * it and shows the actual message + stack so a broken deploy is diagnosable in
 * the browser instead of silently black. Deliberately dependency-free and
 * inline-styled so it renders even if the app's CSS or providers are the fault.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced in the browser console for support/debugging.
    console.error('AdVault crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          background: '#0a0a0f',
          color: '#e6e6f0',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: '40rem', color: '#9a9ab0', margin: 0 }}>
          The app failed to load. The technical detail below helps diagnose it.
        </p>
        <pre
          style={{
            maxWidth: '90vw',
            overflow: 'auto',
            padding: '1rem',
            borderRadius: '0.5rem',
            background: '#14141c',
            color: '#ff9db0',
            fontSize: '0.8rem',
            textAlign: 'left',
          }}
        >
          {String(error.stack ?? error.message ?? error)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            border: '1px solid #333',
            background: '#1e1e2a',
            color: '#e6e6f0',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
