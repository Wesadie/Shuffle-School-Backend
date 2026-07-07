import { type Express } from "express";
import {
  createServer as createViteServer,
  createLogger,
  type ConfigEnv,
  type UserConfig,
} from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";

const viteLogger = createLogger();

type ViteConfigExport =
  | UserConfig
  | Promise<UserConfig>
  | ((env: ConfigEnv) => UserConfig | Promise<UserConfig>);

async function resolveImportedViteConfig() {
  const configExport = viteConfig as ViteConfigExport;
  const configEnv: ConfigEnv = {
    command: "serve",
    mode: process.env.NODE_ENV || "development",
    isSsrBuild: false,
    isPreview: false,
  };

  return typeof configExport === "function"
    ? await configExport(configEnv)
    : await configExport;
}

export async function setupVite(server: Server, app: Express) {
  const resolvedViteConfig = await resolveImportedViteConfig();
  const serverOptions = {
    ...resolvedViteConfig.server,
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Log the error but do NOT exit; let Express error middleware handle it.
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}