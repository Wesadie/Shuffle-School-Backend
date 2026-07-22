import { loadEnv } from "./loadEnv";

/**
 * Top-level startup wrapper.
 *
 * Every step that runs before the HTTP server starts listening is wrapped here
 * so that a failure in any module import or async init produces a readable
 * error with the full cause chain — instead of a bare minified stack pointing
 * at dist/index.mjs.
 */

function logFullError(error: unknown, depth = 0): void {
  const indent = "  ".repeat(depth);
  const prefix = depth === 0 ? "[startup] FATAL" : "[startup] └─ caused by";

  if (error instanceof Error) {
    console.error(`${prefix}:`, error.message);
    if (error.stack) {
      console.error(`${indent}stack:\n${error.stack}`);
    }
    if (error.cause) {
      logFullError(error.cause, depth + 1);
    }
    // Log any extra non-standard properties (e.g. code, syscall, errno)
    const extras: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(error)) {
      if (!["message", "stack", "cause"].includes(key)) {
        try {
          extras[key] = (error as unknown as Record<string, unknown>)[key];
        } catch {
          // skip inaccessible properties
        }
      }
    }
    if (Object.keys(extras).length > 0) {
      console.error(`${indent}extras:`, JSON.stringify(extras, null, 2));
    }
  } else {
    console.error(`${prefix}:`, String(error));
    try {
      console.error(`${indent}json:`, JSON.stringify(error, null, 2));
    } catch {
      // value not serialisable
    }
  }
}

try {
  loadEnv();

  const { warnOnMissingConfig: warnOnMissingPayfastConfig } = await import("./payfast/config");
  console.log("[startup] payfast/config loaded");

  const { startServer } = await import("./app");
  console.log("[startup] app module loaded");

  warnOnMissingPayfastConfig();
  console.log("[startup] payfast config validated, starting server…");

  await startServer();
  console.log("[startup] server listening");
} catch (error) {
  logFullError(error);
  process.exit(1);
}
