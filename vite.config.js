import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    proxy: {
      // ─── 1inch proxy ─────────────────────────────────────────────────────────
      // Requests to /api/1inch/* are forwarded to api.1inch.dev by Vite's
      // dev server (Node.js), which is not subject to browser CORS restrictions.
      // The browser only ever talks to localhost — it never touches api.1inch.dev
      // directly, so CORS headers are irrelevant.
      //
      // In Swap.jsx:
      //   import.meta.env.DEV  → uses "/api/1inch/swap/v6.0/8453"  (this proxy)
      //   production           → uses the real URL (set up a real backend proxy)
      //
      // For production you need a real server-side proxy (Vercel rewrites,
      // Nginx, Express, Cloudflare Worker, etc.) — the Vite proxy only runs
      // during `npm run dev`.
      "/api/1inch": {
        target:      "https://api.1inch.dev",
        changeOrigin: true,
        secure:      true,
        // Strip /api/1inch prefix before forwarding to api.1inch.dev.
        // e.g. /api/1inch/swap/v6.0/8453/quote  →  /swap/v6.0/8453/quote
        rewrite: (path) => path.replace(/^\/api\/1inch/, ""),
      },
    },
  },
});