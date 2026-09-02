import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// GitHub Pages serves this repo from a subpath, so every asset URL has to be
// prefixed. Vite substitutes %BASE_URL% in index.html with this value.
const BASE = '/SDSHC-grazing-calculator/'

/**
 * The path segment each tab answers to. Must match `slug` on the descriptors in
 * src/calculators.js, plus 'saved', which is not a calculator and has none.
 * test/router.test.js asserts the two lists agree.
 */
const ROUTES = ['perennial', 'cover-crop', 'saved']

/**
 * Write index.html again at every route, and at 404.html.
 *
 * GitHub Pages is a static file server: it knows nothing about routes, so
 * /SDSHC-grazing-calculator/cover-crop is a missing file and answers 404 unless
 * something is sitting there. The service worker's navigateFallback covers it
 * only AFTER a visit that already worked, which is exactly not the case for a
 * link somebody has just been sent.
 *
 * `cover-crop.html` answers /cover-crop with a 200 on GitHub Pages, which
 * resolves an extensionless request to the .html beside it. 404.html is the
 * backstop for hosts that do not, and for any path no longer routed: it is the
 * same document, so it boots the app and the app reads the URL.
 *
 * Runs LAST, after VitePWA has generated the service worker, so the copies stay
 * out of the precache manifest. They are byte-identical to index.html, which is
 * precached already and is what navigateFallback serves offline; precaching four
 * more copies of it would be paying install size to say the same thing.
 *
 * TWO mechanisms put it last and they are not the same one twice. `enforce:
 * 'post'` is Vite's: it sorts user plugins into pre / normal / post and VitePWA
 * declares no enforce, so this lands after it for every hook. `order: 'post'` is
 * Rollup's, on the hook itself. Either alone is enough today — removing
 * `order` was tried and the copies still landed after sw.js — so the second is
 * there to survive the first being edited away. What actually PROVES the
 * ordering is test/router-build-output.test.js, which builds and then asserts
 * no copy is named anywhere in sw.js.
 */
function routeCopies() {
  let outDir = 'dist'
  return {
    name: 'sdshc-route-copies',
    apply: 'build',
    enforce: 'post',
    // Off the resolved config rather than off the literal above, so this cannot
    // drift from build.outDir or from the directory vite was run in.
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const index = resolve(outDir, 'index.html')
        // Loudly, and by name. Without this the failure is a bare ENOENT on a
        // path nobody recognises, for a plugin whose whole job is to write four
        // files somebody only finds missing once a shared link 404s.
        if (!existsSync(index)) {
          throw new Error(
            `routeCopies: no index.html at ${index}. The route copies were not written.`
          )
        }
        const html = readFileSync(index, 'utf8')
        for (const name of ['404', ...ROUTES]) {
          writeFileSync(resolve(outDir, `${name}.html`), html)
        }
      },
    },
  }
}

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
    routeCopies(),
  ],
})
