import { defineConfig } from "astro/config";
import stylex from "@stylexjs/unplugin";

// Astro dev (:4321) serves the .astro pages with /app base so every
// /app/* link in the TS code keeps working. /api proxies to the worker
// harness (:8787). Build goes to dist-astro (esbuild dist/ untouched).
export default defineConfig({
  base: "/",
  server: { host: '0.0.0.0', port: 8811 },
  outDir: "dist-astro",
  vite: {
    plugins: [stylex.vite({ devMode: "full" })],
    server: {
      host: '0.0.0.0',
      port: 8811,
      proxy: {
        "/api": "http://localhost:8787",
        "/uploads": "http://localhost:8787",
      },
    },
  },
});
