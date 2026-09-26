import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Vocabulary Notebook',
        short_name: 'Vocab Book',
        description:
          'A personal notebook for English vocabulary — offline-first, made for tutoring students.',
        lang: 'en',
        start_url: '.',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#faf6ee',
        theme_color: '#c96f4a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The bundled word library (8,000+ entries) pushes the main JS chunk
        // past the 2 MiB default — raise the precache ceiling to keep the app
        // fully offline-capable.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Optional dictionary auto-suggest (api.datamuse.com): cached so it
            // keeps working offline once a word has been fetched once.
            // Everything else is precached.
            urlPattern: /^https:\/\/api\.datamuse\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dictionary-api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
});
