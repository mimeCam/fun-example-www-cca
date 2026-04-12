import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// ---------------------------------------------------------------------------
// OTS Observability Cron integration
// Boots once after the HTTP server is listening (dev + standalone production).
// Guard: `booted` flag in cron-runner.ts prevents double-registration on
// Astro dev hot-reload. The 5s cold-start delay prevents self-HTTP race.
// Credits: Mike (arch §cron-runner integration), Elon (single ignition switch)
// ---------------------------------------------------------------------------

/** @type {import('astro').AstroIntegration} */
const cronRunnerIntegration = {
  name: 'cron-runner-integration',
  hooks: {
    'astro:server:start': async ({ address }) => {
      const { boot } = await import('./src/lib/cron-runner.ts');
      await boot(address);
    },
  },
};

export default defineConfig({
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  integrations: [cronRunnerIntegration],
  vite: {
    plugins: [tailwindcss()],
  },
});
