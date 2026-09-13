import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // The app registers the service worker itself in src/main.tsx via
      // registerSW({ immediate: true }) so the autoUpdate reload flow is
      // wired up. Disable the plugin's default bare registerSW.js injection
      // to avoid registering /sw.js twice and to drop the non-reloading stub.
      injectRegister: false,
      includeAssets: ["orbit.svg", "icons/*.png"],
      manifest: {
        name: "Orbit",
        short_name: "Orbit",
        description: "Study together with friends",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0b",
        theme_color: "#01696f",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Because injectRegister is disabled (we register manually via the
        // virtual:pwa-register client so the autoUpdate reload flow runs),
        // vite-plugin-pwa won't force these for us — set them explicitly so
        // the newly deployed service worker skip-waits and claims clients.
        // Combined with registerSW({ immediate: true }) in src/main.tsx, the
        // page reloads the moment the new build activates.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.fontshare\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fontshare-cache",
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
})