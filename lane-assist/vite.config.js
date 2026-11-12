import { defineConfig } from 'vite';

export default defineConfig({
  // The path the app is served from: '/' on Netlify or a custom domain, '/owla/' on
  // GitHub Pages (the deploy workflow sets BASE_PATH).
  base: process.env.BASE_PATH || '/',
  // Listen on the network so a phone on the same Wi-Fi can open the dev server.
  server: { host: true },
  preview: { host: true },
  build: {
    target: 'es2020',
    // TensorFlow.js is one large lazy-loaded chunk; that's expected.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
