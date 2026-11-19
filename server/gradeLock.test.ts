import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { DatabaseStorage } from "./storage";
import { registerGradeRoutes } from "./gradeRoutes";
import type { AccountContext } from "./accountContext";
import { accounts, profiles, students, classConfigs, placements, teachers, rules, gradeLocks, gradeSnapshots } from "@shared/schema";

// Embedded PostgreSQL only. Never connect to DATABASE_URL or reuse an existing account.
test("grade snapshots and locks — isolated PostgreSQL regression suite", async (t) => {
  const pg = new PGlite();
  const memory = drizzle(pg);
  t.after(() => pg.close());
  for (const table of [accounts, profiles, students, classConfigs, placements, teachers, rules, gradeLocks, gradeSnapshots]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => {
      const defaultValue = column.getSQLType().startsWith("timestamp") ? " DEFAULT now()"
        : column.name === "solver_revision" ? " DEFAULT 0"
        : column.name === "locked" ? " DEFAULT false" : "";
      return `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${defaultValue}`;
    });
    if (table === gradeLocks) columns.push("UNIQUE (account_id, grade)");
    if (table === placements) columns.push("UNIQUE (account_id, student_id)");
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(", ")})`);
  }
  let failTeachers = false;
  const transactionModes: unknown[] = [];
  t.mock.method(db, "transaction", (async (callback: (transaction: unknown) => unknown, options: unknown) => {
    transactionModes.push(options);
    return memory.transaction(async (transaction) => {
      const wrapped = new Proxy(transaction, {
        get(target, property) {
          if (property === "update") return (table: unknown) => {
            if (failTeachers && table === teachers) throw new Error("Injected teacher write failure");
            return target.update(table as typeof teachers);
          };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return callback(wrapped);
    }, options as Parameters<typeof memory.transaction>[1]);
  }) as unknown as typeof db.transaction);
  for (const method of ["select", "insert", "update", "delete"] as const) {
    t.mock.method(db, method, memory[method].bind(memory) as never);
  }
  const storage = new DatabaseStorage();
  const fixture = async () => {
    const accountId = randomUUID(), userId = randomUUID();
    await memory.insert(accounts).values({ id: accountId, name: "Isolated regression school", solverRevision: 0 });
    await memory.insert(profiles).values({ id: userId });
    const [student] = await memory.insert(students).values({ id: randomUUID(), accountId, firstName: "Test", lastName: "Learner", grade: "1", currentClass: "1A", characteristics: { newGrade: "2" } }).returning();
    const [config] = await memory.insert(classConfigs).values({ id: randomUUID(), accountId, name: "2A", grade: "2", capacity: 30 }).returning();
    const [otherConfig] = await memory.insert(classConfigs).values({ id: randomUUID(), accountId, name: "3A", grade: "3", capacity: 25 }).returning();
    const [teacher] = await memory.insert(teachers).values({ id: randomUUID(), accountId, firstName: "Test", lastName: "Teacher", email: "test@example.invalid", currentClass: "1A", allocatedClass: "2A" }).returning();
    const [otherTeacher] = await memory.insert(teachers).values({ id: randomUUID(), accountId, firstName: "Other", lastName: "Teacher", email: "other@example.invalid", allocatedClass: "3A" }).returning();
    await memory.insert(placements).values({ id: randomUUID(), accountId, studentId: student.id, classId: config.id });
    return { accountId, userId, student, config, otherConfig, teacher, otherTeacher };
  };
  const state = async (accountId: string) => ({
    placements: await storage.getPlacements(accountId),
    configs: await storage.getClassConfigs(accountId),
    teachers: await storage.getTeachers(accountId),
    revision: (await storage.getPlacementState(accountId)).revision,
  });

  await t.test("save captures account-scoped placements, configurations and allocatedClass, not roster currentClass", async () => {
    const a = await fixture(), b = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "Grade 2", name: "Saved", savedBy: a.userId });
    assert.equal(snapshot.accountId, a.accountId);
    assert.deepEqual(snapshot.placements, [{ studentId: a.student.id, classId: a.config.id }]);
    assert.deepEqual(snapshot.classConfigs, [{ id: a.config.id, name: "2A", grade: "2", capacity: 30 }]);
    assert.deepEqual(snapshot.teacherAllocations, [{ teacherId: a.teacher.id, className: "2A" }]);
    assert.equal((await storage.getGradeSnapshots(b.accountId)).length, 0);
    assert.equal(await storage.getGradeSnapshot(b.accountId, snapshot.id), undefined);
    assert.ok(transactionModes.some((mode) => (mode as { isolationLevel?: string })?.isolationLevel === "repeatable read"));
  });

  await t.test("locking blocks restore without changing state/revision; unlocking restores all three components", async () => {
    const a = await fixture(), b = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "2", name: "Saved", savedBy: a.userId });
    const [extra] = await memory.insert(classConfigs).values({ id: randomUUID(), accountId: a.accountId, name: "2B", grade: "2", capacity: 40 }).returning();
    await memory.update(classConfigs).set({ name: "Renamed", capacity: 20 }).where(eq(classConfigs.id, a.config.id));
    await memory.update(placements).set({ classId: extra.id }).where(eq(placements.studentId, a.student.id));
    await memory.update(teachers).set({ allocatedClass: "2B" }).where(eq(teachers.id, a.teacher.id));
    const [newTeacher] = await memory.insert(teachers).values({ id: randomUUID(), accountId: a.accountId, firstName: "New", lastName: "Teacher", email: "new@example.invalid", allocatedClass: "2B" }).returning();
    const before = await state(a.accountId), otherAccount = await state(b.accountId);
    const lock = await storage.upsertGradeLock(a.accountId, "Grade 2", true, a.userId);
    assert.equal(lock.lockedBy, a.userId); assert.ok(lock.lockedAt);
    assert.equal(await storage.getGradeLock(b.accountId, "2"), undefined);
    await assert.rejects(storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0), /locked/);
    assert.deepEqual(await state(a.accountId), before);
    const unlocked = await storage.upsertGradeLock(a.accountId, "2", false, a.userId);
    assert.equal(unlocked.unlockedBy, a.userId); assert.ok(unlocked.unlockedAt);
    assert.equal(await storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0), 1);
    const after = await state(a.accountId);
    assert.equal(after.configs.find((config) => config.id === a.config.id)?.name, "2A");
    assert.equal(after.configs.find((config) => config.id === a.config.id)?.capacity, 30);
    assert.ok(!after.configs.some((config) => config.id === extra.id));
    assert.equal(after.placements[0].classId, a.config.id);
    assert.equal(after.teachers.find((teacher) => teacher.id === a.teacher.id)?.allocatedClass, "2A");
    assert.equal(after.teachers.find((teacher) => teacher.id === a.teacher.id)?.currentClass, "1A");
    assert.equal(after.teachers.find((teacher) => teacher.id === newTeacher.id)?.allocatedClass, null);
    assert.deepEqual(after.configs.find((config) => config.id === a.otherConfig.id), a.otherConfig);
    assert.deepEqual(after.teachers.find((teacher) => teacher.id === a.otherTeacher.id), a.otherTeacher);
    assert.deepEqual(await state(b.accountId), otherAccount);
    assert.ok(transactionModes.some((mode) => (mode as { isolationLevel?: string })?.isolationLevel === "serializable"));
    await assert.rejects(storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0), /changed since/);
  });

  await t.test("teacher write failure rolls back configs, placements and revision in the PostgreSQL transaction", async () => {
    const a = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "2", name: "Saved", savedBy: a.userId });
    await memory.update(classConfigs).set({ capacity: 45 }).where(eq(classConfigs.id, a.config.id));
    await memory.update(teachers).set({ allocatedClass: null }).where(eq(teachers.id, a.teacher.id));
    const before = await state(a.accountId);
    failTeachers = true;
    try { await assert.rejects(storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0), /Injected teacher/); }
    finally { failTeachers = false; }
    assert.deepEqual(await state(a.accountId), before);
  });

  await t.test("cross-account snapshot IDs and malicious teacher/learner/class references cannot mutate either account", async () => {
    const a = await fixture(), b = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "2", name: "Saved", savedBy: a.userId });
    const beforeA = await state(a.accountId), beforeB = await state(b.accountId);
    await assert.rejects(storage.restoreGradeSnapshot(b.accountId, snapshot.id, 0), /not found/);
    assert.equal(await storage.deleteGradeSnapshot(b.accountId, snapshot.id), false);
    for (const patch of [
      { placements: [{ studentId: b.student.id, classId: a.config.id }] },
      { teacherAllocations: [{ teacherId: b.teacher.id, className: "2A" }] },
      { classConfigs: [{ id: b.config.id, name: "2A", grade: "2", capacity: 30 }], placements: [{ studentId: a.student.id, classId: b.config.id }] },
    ]) {
      await memory.update(gradeSnapshots).set({ placements: snapshot.placements, teacherAllocations: snapshot.teacherAllocations, classConfigs: snapshot.classConfigs, ...patch }).where(eq(gradeSnapshots.id, snapshot.id));
      await assert.rejects(storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0));
      assert.deepEqual(await state(a.accountId), beforeA);
      assert.deepEqual(await state(b.accountId), beforeB);
    }
    assert.equal(await storage.deleteGradeSnapshot(a.accountId, snapshot.id), true);
    assert.equal(await storage.getGradeSnapshot(a.accountId, snapshot.id), undefined);
  });

  await t.test("restore rejects teachers now allocated to another grade and preserves all state", async () => {
    const a = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "2", name: "Saved", savedBy: a.userId });
    await memory.update(teachers).set({ allocatedClass: "3A" }).where(eq(teachers.id, a.teacher.id));
    const before = await state(a.accountId);
    await assert.rejects(storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0), /another grade/);
    assert.deepEqual(await state(a.accountId), before);
  });

  await t.test("empty snapshot clears only the selected grade and re-creates deleted saved classes", async () => {
    const a = await fixture();
    const snapshot = await storage.saveGradeSnapshot(a.accountId, { grade: "2", name: "Saved", savedBy: a.userId });
    await memory.delete(placements).where(eq(placements.accountId, a.accountId));
    await memory.delete(classConfigs).where(eq(classConfigs.id, a.config.id));
    await memory.update(teachers).set({ allocatedClass: null }).where(eq(teachers.id, a.teacher.id));
    await storage.restoreGradeSnapshot(a.accountId, snapshot.id, 0);
    assert.ok(await storage.getClassConfig(a.accountId, a.config.id));
    await memory.update(gradeSnapshots).set({ placements: [], classConfigs: [], teacherAllocations: [] }).where(eq(gradeSnapshots.id, snapshot.id));
    await storage.restoreGradeSnapshot(a.accountId, snapshot.id, 1);
    assert.deepEqual(await storage.getPlacements(a.accountId), []);
    assert.equal(await storage.getClassConfig(a.accountId, a.config.id), undefined);
    assert.ok(await storage.getClassConfig(a.accountId, a.otherConfig.id));
    assert.equal((await storage.getTeachers(a.accountId)).find((teacher) => teacher.id === a.teacher.id)?.allocatedClass, null);
  });

  await t.test("API write authorization, validation, role diagnostic and account isolation", async (subtest) => {
    const a = await fixture(), b = await fixture();
    const app = express(); app.use(express.json());
    registerGradeRoutes(app, (req, res, next) => {
      if (!req.headers["x-test-role"]) return res.sendStatus(401);
      req.accountContext = { accountId: req.headers["x-test-account"] === "b" ? b.accountId : a.accountId, accountRole: String(req.headers["x-test-role"]) } as AccountContext;
      req.supabaseUser = { id: a.userId } as NonNullable<typeof req.supabaseUser>;
      next();
    }, (_req, _res, next) => next(), storage, async () => ({ currentRole: "isolated-test-role" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    subtest.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    const address = server.address() as { port: number };
    const request = (path: string, method = "GET", role = "owner", body?: unknown, account = "a") => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method, headers: { "content-type": "application/json", "x-test-role": role, "x-test-account": account },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const [path, method, body] of [
      ["/api/grade-locks", "POST", { grade: "2", locked: true }],
      ["/api/grade-snapshots", "POST", { grade: "2", name: "Saved" }],
      ["/api/grade-snapshots/unknown/restore", "POST", { expectedRevision: 0 }],
      ["/api/grade-snapshots/unknown", "DELETE", undefined],
    ] as const) assert.equal((await request(path, method, "staff", body)).status, 403);
    assert.equal((await request("/api/admin/database-role", "GET", "staff")).status, 403);
    assert.deepEqual(await (await request("/api/admin/database-role")).json(), { currentRole: "isolated-test-role" });
    assert.equal((await request("/api/grade-locks", "POST", "owner", { grade: "2", locked: "true" })).status, 400);
    const savedResponse = await request("/api/grade-snapshots", "POST", "admin", { grade: "2", name: "Saved", accountId: b.accountId });
    assert.equal(savedResponse.status, 201);
    const snapshot = await savedResponse.json() as { id: string; accountId: string };
    assert.equal(snapshot.accountId, a.accountId);
    assert.equal((await request(`/api/grade-snapshots/${snapshot.id}`, "DELETE", "owner", undefined, "b")).status, 404);
    assert.equal((await request(`/api/grade-snapshots/${snapshot.id}/restore`, "POST", "owner", { expectedRevision: 0 }, "b")).status, 404);
    assert.equal((await request(`/api/grade-snapshots/${snapshot.id}/restore`, "POST", "admin", { expectedRevision: 0 })).status, 200);
    assert.equal((await request(`/api/grade-snapshots/${snapshot.id}`, "DELETE", "admin")).status, 204);
  });
});
