import express, { type Request, Response, NextFunction } from "express";
import multer from "multer";
import { serveStatic } from "./static";
import { createServer } from "http";
import { attachAccountContext, getAccountContext } from "./accountContext";
import { authenticateSupabaseJwt } from "./supabaseAuth";
import { buildPayfastPaymentUrl } from "./payfast/initiate";
import { handlePayfastItn } from "./payfast/itn";
import { z } from "zod";

export const app = express();
const payfastItnMultipartParser = multer().none();

export const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use((req, _res, next) => {
  if (req.path === "/api/payments/payfast/itn") {
    console.log("[PayFast ITN Request]", {
      method: req.method,
      contentType: req.headers["content-type"],
      userAgent: req.headers["user-agent"],
    });
  }
  next();
});

// CORS: allow Lovable preview/published origins and configurable extra origins
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isCorsAllowedOrigin(origin: string): boolean {
  if (corsAllowedOrigins.includes(origin)) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".lovable.app") || hostname.endsWith("shuffleschool.co.za");
  } catch {
    return false;
  }
}

// CORS middleware MUST run before body parsers so that error responses
// (e.g. malformed JSON from express.json) still include CORS headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isCorsAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

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
      const accountContext = getAccountContext(req);
      const accountId = accountContext.accountId;
      const currentLearnerCount = accountContext.licensedLearnerCount ?? 0;
      const payfastLearnerCount = body.transactionType === "topup"
        ? body.learnerCount - currentLearnerCount
        : body.transactionType === "renewal"
          ? currentLearnerCount
          : body.learnerCount;

      if (body.transactionType === "topup" && payfastLearnerCount <= 0) {
        throw new Error("Top-up learner count must be greater than the current licensed learner count");
      }
      if (body.transactionType === "renewal" && payfastLearnerCount <= 0) {
        throw new Error("An existing licensed learner count is required before renewal");
      }

      console.log("[PayFast Route Entered]", {
        accountId,
        planType: body.planType,
        transactionType: body.transactionType,
        learnerCount: body.learnerCount,

        currentLearnerCount,
        billableLearnerCount: payfastLearnerCount,
      });

      const { paymentId, amountCents, redirectUrl } = buildPayfastPaymentUrl({
        ...body,
        learnerCount: payfastLearnerCount,
        accountId,
      });
      const payfastUrl = new URL(redirectUrl);

      console.log("[PayFast Redirect Built]", {
        paymentId,
        amountCents,
        firstParam: Array.from(payfastUrl.searchParams.keys())[0],
        paramOrder: Array.from(payfastUrl.searchParams.keys()),
      });

      res.json({
        paymentId,
        amountCents,
        redirectUrl,
        debugFirstPayfastParam: Array.from(payfastUrl.searchParams.keys())[0],
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to initiate payment" });
    }
  },
);

app.post("/api/payments/payfast/itn", payfastItnMultipartParser, handlePayfastItn);

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

export const appReady = (async () => {
  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[express] unhandled error:", {
      status,
      message,
      stack: err.stack,
    });

    // Only send if headers haven't been sent yet (prevents double-response crash)
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // Vercel serves the frontend build separately; the API function only needs API routes.
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
    serveStatic(app);
  } else if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }
})();

export async function startServer() {
  await appReady;

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
}
