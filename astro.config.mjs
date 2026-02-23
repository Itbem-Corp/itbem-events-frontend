// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import Critters from 'critters';

// Static by default — pages with `export const prerender = false` opt into SSR.
// SSR pages (e.g. /e/[identifier], /rsvp/[identifier], /evento) run on
// Cloudflare Pages Functions for dynamic OG tags.
// All interactivity is handled by client:only React islands that call
// PUBLIC_EVENTS_URL (the Go backend) directly from the browser.
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  site: 'https://www.eventiapp.com.mx',

  integrations: [react(), tailwind()],

  env: {
    schema: {
      // Backend API URL injected at build time — available to client-side code.
      // Local: http://localhost:8080  |  Production: https://api.eventiapp.com.mx
      PUBLIC_EVENTS_URL: envField.string({ context: 'client', access: 'public' }),
    },
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          // Required for Critters (critical CSS inlining) to work correctly.
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      {
        name: 'vite-plugin-critters',
        enforce: 'post',
        apply: 'build',
        async generateBundle(_, bundle) {
          const critters = new Critters({ preload: 'swap' });
          for (const file of Object.keys(bundle)) {
            const chunk = bundle[file];
            if (chunk.type === 'asset' && chunk.fileName.endsWith('.html')) {
              chunk.source = await critters.process(chunk.source);
            }
          }
        },
      },
    ],
  },
});
