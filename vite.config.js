import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo from a subpath, so every asset URL has to be
// prefixed. Vite substitutes %BASE_URL% in index.html with this value.
const BASE = '/SDSHC-grazing-calculator/'

export default defineConfig({
  base: BASE,
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist' },
  server: { open: true, port: 5174, strictPort: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webp,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true },
      manifest: {
        name: 'SDSHC Grazing Calculator',
        short_name: 'Grazing Calc',
        description:
          'Work out grazing days, acres needed, or animals allowed from clipped forage samples. South Dakota Soil Health Coalition.',
        // Must match <meta name="theme-color"> in index.html and BAR_COLOR in
        // prefs.js. The meta is what a browser tab reads; this is what an
        // installed copy reads, and on Android it is baked into the WebAPK at
        // install time — changing it here does nothing to an already-installed
        // copy until Chrome refreshes the APK or the user reinstalls.
        theme_color: '#afbf42',
        background_color: '#f7f9f7',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: 'sdshc-logo.png', sizes: '179x181', type: 'image/png' },
          { src: 'sdshc-logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'sdshc-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
})
