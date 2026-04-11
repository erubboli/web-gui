import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [tailwind({ applyBaseStyles: false }), react()],
  // Disable CSRF origin check — this is a self-hosted internal tool accessed
  // via a custom port/host, so the Origin header routinely won't match.
  security: {
    checkOrigin: false,
  },
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '4321'),
  },
});
