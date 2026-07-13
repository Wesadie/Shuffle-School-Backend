import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadEnv } from "../server/loadEnv";

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
  const { app, appReady } = await getAppModule();
  await appReady;
  app(req, res);
}
