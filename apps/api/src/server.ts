import { serve } from "@hono/node-server";
import { app } from "./app.js";

// Local dev server. On Vercel the app is served via api/index.ts instead.
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`api listening on http://localhost:${port}`);
