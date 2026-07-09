import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import memorystore from "memorystore";

const hasReplitAuthConfig = !!process.env.REPL_ID;
const isProduction = process.env.NODE_ENV === "production";
const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(new URL(ISSUER_URL), process.env.REPL_ID!);
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const SessionSecret = process.env.SESSION_SECRET || "dev-insecure-session-secret";

  let store: session.Store;
  if (hasDatabaseUrl) {
    const pgStore = connectPg(session);
    store = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  } else {
    type SessionStoreConstructor = new (options: { checkPeriod: number }) => session.Store;
    const MemoryStore = (memorystore as unknown as (s: typeof session) => SessionStoreConstructor)(session);
    store = new MemoryStore({ checkPeriod: sessionTtl });
  }

  return session({
    secret: SessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

// Dev-safe fallback: no-auth mode
const devIsAuthenticated: RequestHandler = (_req, _res, next) => {
  console.log("[auth] authentication middleware completed: dev no-auth mode");
  next();
};

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  // If REPL_ID is missing outside production, enable no-auth mode so the app can boot in development.
  if (!hasReplitAuthConfig) {
    app.use(getSession());

    if (!isProduction) {
      // Minimal auth endpoints for the UI
      app.get("/api/auth/user", (_req, res) => {
        res.json({
          id: "dev-user",
          email: "dev@example.com",
          firstName: "Dev",
          lastName: "User",
          profileImageUrl: "",
        });
      });

      // Provide dummy login/logout to avoid 404s
      app.get("/api/login", (_req, res) => res.redirect("/"));
      app.get("/api/logout", (_req, res) => res.redirect("/"));
    }

    return; // Skip real OIDC setup
  }

  // Real Replit OIDC auth setup
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  console.log("[auth] authentication middleware entered");

  if (req.supabaseUser && req.supabaseAccountContext) {
    console.log("[auth] authentication middleware completed: Supabase authenticated");
    return next();
  }

  // In no-auth mode, allow everything outside production only.
  if (!hasReplitAuthConfig) {
    if (!isProduction) {
      return devIsAuthenticated(req, res, next);
    }
    console.log("[auth] authentication middleware completed: production auth required");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    console.log("[auth] authentication middleware completed: unauthorized");
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    console.log("[auth] authentication middleware completed: authenticated");
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    console.log("[auth] authentication middleware completed: missing refresh token");
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    console.log("[auth] authentication middleware completed: refreshed token");
    return next();
  } catch (error) {
    console.error("[auth] authentication middleware caught error", {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};