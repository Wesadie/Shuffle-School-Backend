import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadEnv } from "../server/loadEnv";
import { app, appReady } from "../server/app";
import { warnOnMissingConfig as warnOnMissingPayfastConfig } from "../server/payfast/config";

loadEnv();
warnOnMissingPayfastConfig();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await appReady;
  app(req, res);
}
