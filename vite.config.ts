import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    // Mirrors the `ENVIRONMENT` var the Workers runtime reads from
    // `wrangler.jsonc`, so client and server agree on one name and one rule:
    // only a development build ever surfaces verbose error details.
    // `mode` is "production" for `vite build` and "development" otherwise.
    __WW_ENVIRONMENT__: JSON.stringify(
      mode === 'development' ? 'development' : 'production',
    ),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
        secure: false,
        // NOTE: Vite's ProxyOptions has no `cookieDomain`; cookies are
        // forwarded as-is to the local wrangler pages dev origin.
      },
    },
  },
}))
