import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/__tests__/**'],
      thresholds: {
        lines: 90,
      },
    },
  },
})
