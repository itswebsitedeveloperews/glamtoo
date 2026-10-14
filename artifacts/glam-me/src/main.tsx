import { createRoot, hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App, { setPublicSnapshot } from './App';
import { readPublicSnapshot } from './data/public-snapshot';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();

const root = document.getElementById('root')!;
const options = {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error: unknown, errorInfo: { componentStack?: string | null }) => {
    console.error(error, errorInfo.componentStack);
  },
};
const app = (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>
);
if (document.getElementById('public-storefront-data')) {
  // Seed the same catalog and inventory used by renderToString before React's
  // first browser render; a later effect is too late for hydration.
  setPublicSnapshot(readPublicSnapshot());
  hydrateRoot(root, app, options);
} else {
  createRoot(root, options).render(app);
}
