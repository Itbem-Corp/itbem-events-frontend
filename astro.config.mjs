import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import Critters from 'critters';

export default defineConfig({
  integrations: [react(), tailwind()],
  adapter: node({
    mode: 'standalone',
  }),
  env: {
    schema: {
      PORT: envField.number({ context: "server", access: "secret", default: 4321 }),
      REDIS_URL: envField.string({ context: "server", access: "secret" }),
      EVENTS_URL: envField.string({ context: "server", access: "secret" }),
    },
    validateSecrets: false
  },
  session: {
    driver: 'redis',
    options: {
      url: process.env.REDIS_URL,
    },
    ttl: 3600,
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined, // importante para que Critters funcione correctamente
        },
      },
    },
    plugins: [
      {
        name: 'vite-plugin-critters',
        enforce: 'post',
        apply: 'build',
        async generateBundle(_, bundle) {
          const critters = new Critters({
            preload: 'swap',
          });

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
