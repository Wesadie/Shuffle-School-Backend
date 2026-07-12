import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import { attachAccountContext, getAccountContext } from "./accountContext";
import { authenticateSupabaseJwt } from "./supabaseAuth";
import { buildPayfastPaymentUrl } from "./payfast/initiate";
import { handlePayfastItn } from "./payfast/itn";
import { z } from "zod";

const app = express();

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// CORS: allow Lovable preview/published origins and configurable extra origins
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isCorsAllowedOrigin(origin: string): boolean {
  if (corsAllowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

app.post(
  "/api/payments/payfast/initiate",
  authenticateSupabaseJwt,
  (req, res, next) => {
    if (!req.supabaseUser) {
      return res.status(401).json({ error: "Authentication is required to initiate payment" });
    }
    return next();
  },
  attachAccountContext,
  (req, res) => {
    try {
      const body = z.object({
        planType: z.enum(["teacher", "school"]),
        transactionType: z.enum(["initial", "topup", "renewal"]).default("initial"),
        learnerCount: z.coerce.number().int().positive(),
      }).parse(req.body);
      const accountId = getAccountContext(req).accountId;

      const { paymentId, amountCents, redirectUrl } = buildPayfastPaymentUrl({
        ...body,
        accountId,
      });

      res.json({ paymentId, amountCents, redirectUrl });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to initiate payment" });
    }
  },
);

app.post("/api/payments/payfast/itn", handlePayfastItn);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isCorsAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const portArgIndex = process.argv.indexOf("--port");
const cliPort =
  portArgIndex >= 0 ? Number.parseInt(process.argv[portArgIndex + 1] ?? "", 10) : undefined;
const envPort = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : undefined;
const port = Number.isFinite(cliPort) ? cliPort : Number.isFinite(envPort) ? envPort : 5000;

process.env.PORT = String(port);

httpServer.listen(
  {
    port,
    host: "0.0.0.0",
  },
  () => {
    log(`serving on port ${port}`);
    console.log(`Local: http://localhost:${port}/`);
  },
);

(async () => {
  try {
    const { registerRoutes } = await import("./routes");
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  } catch (error) {
    console.error("[startup] failed to finish application setup", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
})();
