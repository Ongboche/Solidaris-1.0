/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the app from /Solidaris-1.0/ (PLAN D-10); CI sets PAGES_BASE.
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BASE ?? '/',
  server: { host: '0.0.0.0', port: 5173 },
  // The real budget (250 KB gzipped initial JS) is enforced by scripts/check-bundle.mjs.
  build: { chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/db/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
