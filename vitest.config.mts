import { defineConfig } from 'vitest/config';

// Separate from vite.config.mts so tests don't run the library build's declaration plugin.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    restoreMocks: true,
  },
});
