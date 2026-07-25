import { handle } from "hono/vercel";
import { app } from "../src/app";

// Vercel Functions entrypoint. vercel.json rewrites all paths here.
export const config = { runtime: "nodejs" };

export default handle(app);
