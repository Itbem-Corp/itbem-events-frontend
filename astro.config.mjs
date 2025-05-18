import { defineConfig,envField } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';


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
    // The name of the Unstorage driver
    driver: 'redis',
    // The required options depend on the driver
    options: {
      url: process.env.REDIS_URL,
    },
    ttl: 3600, // 1 hour
  },
});
