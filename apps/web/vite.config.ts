import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Load env from the monorepo root so a single root `.env` (per the README's
// `cp .env.example .env`) is picked up. Vite otherwise only reads apps/web/.env.
const envDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir,
  server: { port: 5173 },
});
