import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { DatabaseStorage } from "./storage";
import { db } from "./db";
import { studentRosterPatchSchema } from "./studentRosterValidation";
import { applyStudentPatch, changedStudentFields, normalizeRosterGrade, previousStudentPatch, rollbackStudentPatch, updateRosterRows } from "@shared/student-roster";
import type { Student } from "@shared/schema";

const learner = (id = "s1", grade = "3"): Student => ({
  id, accountId: "school-a", studentId: id, firstName: "Ada", lastName: "Learner", grade,
  currentClass: "3A", gender: "F", notes: null, parentRequests: null, parentNotes: null,
  isNew: false, isLeaving: false, characteristics: { Race: "A", "English %": "75", newGrade: "4", Other: ["Keep"] },
});

test("normalizes stored and selected grades without changing stored learner data", () => {
  for (const grade of ["3", "Grade 3", " grade 3 "]) assert.equal(normalizeRosterGrade(grade), "3");
  assert.equal(normalizeRosterGrade("Grade r"), "R");
});

test("atomic partial characteristic projections preserve unrelated data and references", () => {
  const original = learner(), untouched = learner("s2");
  const rows = updateRosterRows([original, untouched], original, { characteristics: { "English %": "85" } }, "3");
  assert.equal(rows[1], untouched);
  assert.deepEqual(rows[0].characteristics, { ...original.characteristics, "English %": "85" });
  assert.equal(rows[0].currentClass, "3A");
  assert.equal(rows[0].grade, "3");
  assert.equal(original.characteristics?.["English %"], "75");
});

test("rollback restores only failed fields without undoing another completed edit", () => {
  const original = learner();
  const failed = { characteristics: { Race: "Failed", Unset: "New" } };
  const optimistic = applyStudentPatch(original, failed);
  const otherSave = applyStudentPatch(optimistic, { characteristics: { "English %": "90" }, notes: "Saved independently" });
  const rolledBack = rollbackStudentPatch(otherSave, original, failed);
  assert.equal(rolledBack.characteristics?.Race, "A");
  assert.equal(rolledBack.characteristics?.["English %"], "90");
  assert.equal(rolledBack.notes, "Saved independently");
  assert.ok(!Object.prototype.hasOwnProperty.call(rolledBack.characteristics, "Unset"));
  assert.equal(rolledBack.characteristics?.newGrade, "4");
  assert.equal(rolledBack.currentClass, "3A");
});

test("rollback preserves null characteristic storage when a new value fails", () => {
  const original = { ...learner(), characteristics: null };
  const patch = { characteristics: { Race: "New" } };
  assert.equal(rollbackStudentPatch(applyStudentPatch(original, patch), original, patch).characteristics, null);
});

test("grade edits update cached membership and roll back both old and new grade views", () => {
  const original = learner(), patch = { grade: "4" };
  const oldGrade = updateRosterRows([original], original, patch, "3");
  const newGrade = updateRosterRows([], original, patch, "4");
  assert.equal(oldGrade.length, 0);
  assert.equal(newGrade[0].grade, "4");
  assert.equal(newGrade[0].currentClass, "3A");
  assert.deepEqual(updateRosterRows(oldGrade, original, patch, "3", true), [original]);
  assert.deepEqual(updateRosterRows(newGrade, original, patch, "4", true), []);
});

test("characteristic saves cannot inject learners into another school or resurrect deleted rows", () => {
  const original = learner(), foreign = { ...learner("foreign"), accountId: "school-b" };
  const foreignRows = [foreign];
  assert.equal(updateRosterRows(foreignRows, original, { characteristics: { Race: "New" } }), foreignRows);
  const deletedRows: Student[] = [];
  assert.equal(updateRosterRows(deletedRows, original, { characteristics: { Race: "New" } }, "all", true), deletedRows);
  assert.equal(updateRosterRows(deletedRows, original, { characteristics: { Race: "New" } }, "all"), deletedRows);
});

test("full dialog saves send only changed fields and do not normalize null fields on no-op saves", () => {
  const original = learner();
  assert.deepEqual(changedStudentFields(original, { firstName: "Ada", notes: "", parentNotes: "", characteristics: { ...original.characteristics } }), {});
  const draft = { firstName: "Changed", characteristics: { ...original.characteristics, Race: "B" } };
  assert.deepEqual(changedStudentFields(original, draft), { firstName: "Changed", characteristics: { Race: "B" } });
  const staleResponse = { ...original, characteristics: { ...original.characteristics, Race: "B", "English %": "70" } };
  assert.deepEqual(previousStudentPatch(staleResponse, { characteristics: { Race: "B" } }), { characteristics: { Race: "B" } });
});

test("roster save validation rejects ownership, placement fields, null replacements and invalid characteristic objects", () => {
  assert.deepEqual(studentRosterPatchSchema.parse({ characteristics: { Race: "B", Other: ["A", "B"] } }), { characteristics: { Race: "B", Other: ["A", "B"] } });
  for (const patch of [{}, { accountId: "other-school" }, { id: "other-id" }, { placement: "4B" }, { teacherId: "teacher" }, { characteristics: null }, { characteristics: { Race: {} } }, { characteristics: { constructor: "unsafe" } }]) {
    assert.equal(studentRosterPatchSchema.safeParse(patch).success, false);
  }
});

test("grade-scoped storage always includes the school predicate and parameterized grade", async (t) => {
  let condition: SQL | undefined;
  t.mock.method(db, "select", (() => ({ from: () => ({ where: async (sql: SQL) => { condition = sql; return [learner()]; } }) })) as unknown as typeof db.select);
  const storage = new DatabaseStorage();
  await storage.getStudents("school-a", " Grade 3 ");
  const query = new PgDialect().sqlToQuery(condition!);
  assert.match(query.sql, /account_id/);
  assert.match(query.sql, /regexp_replace/);
  assert.deepEqual(query.params, ["school-a", "3"]);
  await storage.getStudents("school-a");
  assert.deepEqual(new PgDialect().sqlToQuery(condition!).params, ["school-a"]);
  await assert.rejects(() => storage.getStudents("", "3"), /Account ID is required/);
});

test("partial saves issue one school-scoped UPDATE and merge JSON rather than replacing existing values", async (t) => {
  let condition: SQL | undefined;
  let updates: Record<string, unknown> = {};
  let calls = 0;
  t.mock.method(db, "update", (() => ({ set: (values: Record<string, unknown>) => {
    updates = values; calls++;
    return { where: (sql: SQL) => { condition = sql; return { returning: async () => [learner()] }; } };
  } })) as unknown as typeof db.update);
  const storage = new DatabaseStorage();
  await storage.updateStudentRosterFields("school-a", "s1", { characteristics: { Race: "B" } });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(updates), ["characteristics"]);
  const merge = new PgDialect().sqlToQuery(updates.characteristics as SQL);
  assert.match(merge.sql, /coalesce/);
  assert.match(merge.sql, /\|\|/);
  assert.deepEqual(merge.params, ['{"Race":"B"}']);
  assert.deepEqual(new PgDialect().sqlToQuery(condition!).params, ["school-a", "s1"]);
  await assert.rejects(() => storage.updateStudentRosterFields("", "s1", {}), /Account ID is required/);
});

test("roster choices use a single school-scoped aggregation rather than reloading learner records", async (t) => {
  let condition: SQL | undefined;
  let selected: Record<string, SQL> = {};
  let calls = 0;
  const options = { grades: ["3"], currentClasses: ["3A"], genders: ["F"], newGrades: ["4"], totalCount: 1 };
  t.mock.method(db, "select", ((fields: Record<string, SQL>) => {
    selected = fields; calls++;
    return { from: () => ({ where: async (sql: SQL) => { condition = sql; return [options]; } }) };
  }) as unknown as typeof db.select);
  const storage = new DatabaseStorage();
  assert.deepEqual(await storage.getStudentRosterOptions("school-a"), options);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(selected), ["grades", "currentClasses", "genders", "newGrades", "totalCount"]);
  assert.deepEqual(new PgDialect().sqlToQuery(condition!).params, ["school-a"]);
  assert.match(new PgDialect().sqlToQuery(selected.newGrades).sql, /jsonb_array_elements_text/);
  await assert.rejects(() => storage.getStudentRosterOptions(""), /Account ID is required/);
});
