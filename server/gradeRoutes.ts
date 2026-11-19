import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import { getAccountContext } from "./accountContext";
import { pool } from "./db";
import { storage as defaultStorage, type DatabaseStorage } from "./storage";
import { InvalidPlacementError, PlacementNotFoundError, PlacementRevisionConflictError } from "./placementSafety";
import { normalizeGradeValue } from "@shared/grades";

export const requireGradeAdministrator: RequestHandler = (req, res, next) => {
  const { accountRole } = getAccountContext(req);
  if (accountRole !== "owner" && accountRole !== "admin") {
    return res.status(403).json({ error: "Only account owners and administrators can manage grade locks and snapshots" });
  }
  next();
};

const gradeSchema = z.string().trim().min(1).transform(normalizeGradeValue).refine((grade) => grade.length > 0);
const saveSchema = z.object({ grade: gradeSchema, name: z.string().trim().min(1), description: z.string().optional() });
const lockSchema = z.object({ grade: gradeSchema, locked: z.boolean() });
const restoreSchema = z.object({ expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });

type GradeStorage = Pick<DatabaseStorage, "getGradeLocks" | "upsertGradeLock" | "getGradeSnapshots" | "saveGradeSnapshot" | "restoreGradeSnapshot" | "deleteGradeSnapshot">;

export async function readBackendDatabaseRole() {
  // This uses the same pool as application writes, not the SQL Editor's session.
  const result = await pool.query(`
    SELECT current_user AS "currentRole", session_user AS "sessionRole",
      r.rolsuper AS "isSuperuser", r.rolbypassrls AS "bypassesRls",
      (SELECT jsonb_agg(jsonb_build_object(
        'table', c.relname, 'rlsEnabled', c.relrowsecurity,
        'isOwner', c.relowner = r.oid,
        'canSelect', has_table_privilege(current_user, c.oid, 'SELECT'),
        'canInsert', has_table_privilege(current_user, c.oid, 'INSERT'),
        'canUpdate', has_table_privilege(current_user, c.oid, 'UPDATE'),
        'canDelete', has_table_privilege(current_user, c.oid, 'DELETE')
      )) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('grade_locks', 'grade_snapshots')) AS tables
    FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
  `);
  return result.rows[0];
}

export function registerGradeRoutes(app: Express, authenticated: RequestHandler, writable: RequestHandler,
  storage: GradeStorage = defaultStorage, readRole = readBackendDatabaseRole) {
  const accountId = (req: Express.Request) => getAccountContext(req).accountId;
  const write = [authenticated, writable, requireGradeAdministrator];
  const fail = (res: Response, error: unknown) => {
    const code = (error as { code?: string; cause?: { code?: string } })?.code
      ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (error instanceof PlacementRevisionConflictError || code === "40001" || code === "40P01") {
      return res.status(409).json({ error: "Account data changed. Refresh and retry." });
    }
    if (error instanceof PlacementNotFoundError) return res.status(404).json({ error: "Snapshot not found" });
    if (error instanceof InvalidPlacementError) return res.status(error.message.includes("is locked") ? 409 : 400).json({ error: error.message });
    return res.status(500).json({ error: "Grade operation failed" });
  };
  app.get("/api/admin/database-role", authenticated, requireGradeAdministrator, async (_req, res) => {
    try { res.json(await readRole()); } catch { res.status(500).json({ error: "Unable to read database role" }); }
  });
  app.get("/api/grade-locks", authenticated, async (req, res) => {
    try { res.json(await storage.getGradeLocks(accountId(req))); } catch (error) { fail(res, error); }
  });
  app.post("/api/grade-locks", ...write, async (req, res) => {
    const input = lockSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Grade and boolean locked status are required" });
    const userId = req.supabaseUser?.id ?? (req.user as { claims?: { sub?: string } } | undefined)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try { res.json(await storage.upsertGradeLock(accountId(req), input.data.grade, input.data.locked, userId)); }
    catch (error) { fail(res, error); }
  });
  app.get("/api/grade-snapshots", authenticated, async (req, res) => {
    const grade = req.query.grade === undefined ? undefined : gradeSchema.safeParse(req.query.grade);
    if (grade && !grade.success) return res.status(400).json({ error: "Invalid grade" });
    try { res.json(await storage.getGradeSnapshots(accountId(req), grade?.data)); } catch (error) { fail(res, error); }
  });
  app.post("/api/grade-snapshots", ...write, async (req, res) => {
    const input = saveSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Grade and snapshot name are required" });
    const userId = req.supabaseUser?.id ?? (req.user as { claims?: { sub?: string } } | undefined)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    try { res.status(201).json(await storage.saveGradeSnapshot(accountId(req), { ...input.data, savedBy: userId })); }
    catch (error) { fail(res, error); }
  });
  app.post("/api/grade-snapshots/:id/restore", ...write, async (req, res) => {
    const input = restoreSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "A valid placement revision is required" });
    try {
      const revision = await storage.restoreGradeSnapshot(accountId(req), req.params.id, input.data.expectedRevision);
      res.json({ success: true, revision });
    } catch (error) { fail(res, error); }
  });
  app.delete("/api/grade-snapshots/:id", ...write, async (req, res) => {
    try {
      if (!await storage.deleteGradeSnapshot(accountId(req), req.params.id)) return res.status(404).json({ error: "Snapshot not found" });
      res.status(204).send();
    } catch (error) { fail(res, error); }
  });
}
