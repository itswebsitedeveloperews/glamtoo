import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DOMParser } from 'linkedom';
import App, { setPublicSnapshot } from './App';
import { ErrorBoundary } from './components/error-boundary';
import type { PublicSnapshot } from './data/public-snapshot';

// The same allowlist sanitizer is used on the server and in the browser.
globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;

export function render(path: string, snapshot: PublicSnapshot) {
  const queryClient = new QueryClient();
  setPublicSnapshot(snapshot);
  try {
    return renderToString(
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App ssrPath={path} />
        </QueryClientProvider>
      </ErrorBoundary>,
    );
  } finally {
    // Review queries use client-side cache lifetimes. Do not retain their
    // cleanup timers (or request data) after a synchronous server render.
    queryClient.clear();
    // No asynchronous work is permitted between setPublicSnapshot and reset.
    setPublicSnapshot(null);
  }
}
