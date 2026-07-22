import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.*', 'src/__tests__/**', 'src/main.jsx'],
      thresholds: {
        lines: 90,
      },
    },
  },
})
