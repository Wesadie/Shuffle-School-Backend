import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadEnv } from "../server/loadEnv";
import { applyCorsHeaders, isPreflightRequest } from "./_cors";

loadEnv();

let appModulePromise: Promise<typeof import("../server/app")> | undefined;

async function getAppModule() {
  if (!appModulePromise) {
    const { warnOnMissingConfig: warnOnMissingPayfastConfig } = await import("../server/payfast/config");
    warnOnMissingPayfastConfig();
    appModulePromise = import("../server/app");
  }
  return appModulePromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers early so they are present on every response —
  // including OPTIONS preflight and cold-start error responses —
  // even if the Express app fails to initialise.
  applyCorsHeaders(req, res);

  // Handle CORS preflight immediately, before loading the Express app.
  if (isPreflightRequest(req)) {
    return res.status(204).end();
  }

  try {
    const { app, appReady } = await getAppModule();
    await appReady;
    app(req, res);
  } catch (error) {
    console.error("[api] handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
}
