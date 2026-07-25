import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Load env from the monorepo root so a single root `.env` (per the README's
// `cp .env.example .env`) is picked up. Vite otherwise only reads apps/web/.env.
const envDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir,
  resolve: {
    alias: {
      // Consume @multisig/core from TS source (HMR, no prebuild). The package's
      // main points at dist for Node/Vercel runtime consumers; the web bundle
      // uses source instead.
      "@multisig/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173 },
});
