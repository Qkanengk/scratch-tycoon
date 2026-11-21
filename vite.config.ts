import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the same build works at a domain root and under a sub-path (GitHub Pages).
  base: './',
  plugins: [react()],
  // `vite preview` only serves the public build in dist/, so it can sit behind any proxy host.
  // The dev server keeps Vite's default localhost binding and host check.
  preview: { host: true, allowedHosts: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
