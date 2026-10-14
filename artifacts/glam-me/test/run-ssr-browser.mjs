import { spawnSync } from 'node:child_process';

// Use a syntactically valid but entirely fictional Clerk key. The browser suite
// supplies a signed-out SDK fixture; no real auth service is contacted.
const env = {
  ...process.env,
  PORT: '18781', BASE_PATH: '/',
  VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('ssr-fixture.clerk.accounts.dev$').toString('base64')}`,
  VITE_CLERK_PROXY_URL: '',
};
for (const args of [
  ['run', 'test:ssr'],
  ['exec', 'playwright', 'test', '--config', 'playwright.ssr.config.ts', ...process.argv.slice(2)],
]) {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
