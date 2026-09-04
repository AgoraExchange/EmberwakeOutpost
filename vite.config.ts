import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = command === 'serve' ? '/' : (env.VITE_BASE_PATH || '/EmberwakeOutpost/');

  return {
    base,
    build: { sourcemap: true, target: ['es2022', 'safari16'] },
    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
          'apple-touch-icon.png',
          'art/emberwake-key-art.webp',
          'art/sprites/index.json'
        ],
        manifest: {
          id: base,
          name: 'Emberwake Outpost',
          short_name: 'Emberwake',
          description: 'Hunt the frostwilds, feed your outpost, and build a warm frontier.',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait-primary',
          background_color: '#081b2b',
          theme_color: '#102b3e',
          categories: ['games', 'entertainment'],
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          maximumFileSizeToCacheInBytes: 4_000_000
        },
        devOptions: { enabled: false }
      })
    ],
    test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] }
  };
});
