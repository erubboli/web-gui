import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['src/components/**/*.test.tsx', 'jsdom'],
      ['src/lib/txWatcher.test.ts', 'jsdom'],
    ],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/pages/api/**'],
      exclude: ['src/lib/tx-decoder.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: { lines: 80, branches: 75 },
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
