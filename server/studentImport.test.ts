import assert from "node:assert/strict";
import test from "node:test";
import { getStudentTargetGrade, isIncomingGradeRAwaitingAllocation } from "@shared/grades";
import { importedStudentIsNew, importedStudentNewGrade, isIncomingGradeRStudent, partitionStudentImportRows } from "./studentImport";

const row = (studentId: string, firstName = "Learner") => ({ studentId, firstName });

test("re-importing the same file skips every existing non-empty student ID", () => {
  const file = [row("S-1", "One"), row("S-2", "Two")];
  const firstImport = partitionStudentImportRows(file, []);
  assert.equal(firstImport.rowsToImport.length, 2);

  const secondImport = partitionStudentImportRows(file, firstImport.rowsToImport);
  assert.deepEqual(secondImport.rowsToImport, []);
  assert.equal(secondImport.skippedExisting, 2);
  assert.equal(secondImport.duplicateRows, 0);
});

test("skips duplicate IDs in the upload without overwriting existing rows", () => {
  const uploaded = [row("S-1", "Original"), row(" s-1 ", "Repeat"), row("S-2")];
  const result = partitionStudentImportRows(uploaded, [row("S-1", "Existing")]);
  assert.deepEqual(result.rowsToImport, [uploaded[2]]);
  assert.equal(result.skippedExisting, 1);
  assert.equal(result.duplicateRows, 1);
});

test("imports rows with blank student IDs without treating blanks as duplicates", () => {
  const uploaded = [row(""), row("  ")];
  const result = partitionStudentImportRows(uploaded, []);
  assert.deepEqual(result.rowsToImport, uploaded);
  assert.equal(result.skippedExisting, 0);
  assert.equal(result.duplicateRows, 0);
});

test("reports pre-existing duplicate IDs for manual review", () => {
  const result = partitionStudentImportRows(
    [row("S-1"), row("S-3")],
    [row("S-1"), row("s-1 "), row("S-2")],
  );
  assert.deepEqual(result.rowsToImport, []);
  assert.equal(result.skippedExisting, 2);
  assert.deepEqual(result.existingDuplicateStudentIds, ["s-1"]);
});

test("incoming Grade R import allows no class, sets New Student, and waits without destination", () => {
  const student = { grade: "R", currentClass: "", isNew: undefined };
  const imported = {
    ...student,
    isNew: importedStudentIsNew(student),
    characteristics: { newGrade: importedStudentNewGrade(student) ?? "" },
  };
  assert.equal(isIncomingGradeRStudent(student.grade, student.currentClass), true);
  assert.equal(imported.isNew, true);
  assert.equal(isIncomingGradeRAwaitingAllocation(imported), true);
  assert.equal(getStudentTargetGrade(imported), "");
});

test("Grade R with explicit New Grade 1 can be targeted for solver placement", () => {
  const student = { grade: "R", currentClass: "", newGrade: "1" };
  const imported = {
    ...student,
    isNew: importedStudentIsNew(student),
    characteristics: { newGrade: importedStudentNewGrade(student) ?? "" },
  };
  assert.equal(imported.isNew, true);
  assert.equal(isIncomingGradeRAwaitingAllocation(imported), false);
  assert.equal(getStudentTargetGrade(imported), "1");
});


import { buildLearnerImportPlan } from "./learnerImportPlan";
import { parseLearnerCsv, recognizeColumn, type LearnerImportInput } from "@shared/learner-import";
import type { Student, Characteristic } from "@shared/schema";
import { readLearnerSpreadsheet } from "../client/src/lib/learner-spreadsheet";
import ExcelJS from "exceljs";

const learner = (studentId: string): Student => ({
  id: "internal-" + studentId, accountId: "school-1", studentId, firstName: "Saved", lastName: "Learner",
  grade: "4", currentClass: "4A", gender: "F", characteristics: { Race: "Saved race", newGrade: "5", Other: "Keep" },
  notes: "Keep notes", parentNotes: null, parentRequests: null, isNew: false, isLeaving: false,
});
const characteristic = (name: string, type = "category"): Characteristic => ({
  id: "char-" + name, accountId: "school-1", name, type, options: [], responseConfig: [], priority: 1,
  tagOnly: false, multiSelect: false, adminOnly: false, applyToAllGrades: true, applicableGrades: [],
});
const spreadsheet = (headings: string[], rows: string[][], mode: "add" | "update" = "add", saved: Characteristic[] = []): LearnerImportInput => ({
  columns: headings.map((h) => recognizeColumn(h, saved)), rows, mode,
});
const allHeadings = ["Student ID", "First Name", "Last Name", "Gender", "Current Grade", "Current Class", "Aggregate", "English %", "Maths %", "Race", "Previous School"];
const allValues = ["S1", "Ada", "Learner", "F", "4", "4A", "75", "85%", "90", "Race A", "School A"];

test("recognizes learner aliases and every requested characteristic without dropping values", () => {
  const plan = buildLearnerImportPlan(spreadsheet(allHeadings, [allValues]), [], []);
  assert.deepEqual(plan.review.errors, []);
  assert.equal(plan.review.count, 1);
  assert.deepEqual(plan.inserts[0].characteristics, { Aggregate: "75", "English %": "85", "Maths %": "90", Race: "Race A", "Previous School": "School A" });
  assert.equal(plan.createCharacteristics.length, 5);
  assert.equal(recognizeColumn(" student_id ", []).target, "studentId");
  assert.equal(recognizeColumn("Surname", []).target, "lastName");
  assert.equal(recognizeColumn("previous_school", [characteristic("Previous School")]).create, undefined);
  assert.equal(plan.createCharacteristics.find((c) => c.name === "Aggregate")?.type, "scale");
  assert.equal(plan.createCharacteristics.find((c) => c.name === "English %")?.type, "percentage");
});

test("every invalid, blank and duplicate spreadsheet row has an explicit outcome", () => {
  const values = [...allValues]; values[0] = "";
  const invalid = [...allValues]; invalid[0] = "S2"; invalid[7] = "101";
  const plan = buildLearnerImportPlan(spreadsheet(allHeadings, [allValues, values, [], allValues, invalid]), [], []);
  assert.equal(plan.review.rows.length, 5);
  assert.deepEqual(plan.review.rows.map((r) => r.status), ["ready", "error", "skipped", "skipped", "error"]);
  assert.ok(plan.review.errors.some((e) => e.includes("Row 3") && e.includes("Student ID")));
  assert.ok(plan.review.errors.some((e) => e.includes("Row 6") && e.includes("0 and 100")));
  assert.match(plan.review.rows[3].explanation, /Duplicate/);
});

test("add mode never overwrites existing learners and explains the skip", () => {
  const saved = learner("s1");
  const before = JSON.stringify(saved);
  const plan = buildLearnerImportPlan(spreadsheet(allHeadings, [allValues]), [saved], []);
  assert.equal(plan.review.count, 0);
  assert.equal(plan.updates.length, 0);
  assert.match(plan.review.rows[0].explanation, /already exists/);
  assert.equal(JSON.stringify(saved), before);
});

test("update matches IDs case-insensitively and only projects non-blank characteristics", () => {
  const saved = learner("s1"), before = JSON.stringify(saved);
  const headings = ["Student ID", "First Name", "Current Class", "Current Grade", "New Grade", "Race", "English %", "Other"];
  const chars = [characteristic("Race"), characteristic("English %", "percentage"), characteristic("Other")];
  const plan = buildLearnerImportPlan(spreadsheet(headings, [[" S1 ", "Replace identity", "9Z", "9", "10", "New race", "80%", ""]], "update", chars), [saved], chars);
  assert.deepEqual(plan.review.errors, []);
  assert.equal(plan.inserts.length, 0);
  assert.deepEqual(plan.updates, [{ id: saved.id, characteristics: { Race: "New race", "English %": "80" } }]);
  assert.equal(JSON.stringify(saved), before);
  assert.ok(plan.review.warnings.some((w) => w.includes("Read-only columns")));
});

test("update does not match learners outside the supplied school roster", () => {
  const plan = buildLearnerImportPlan(spreadsheet(["Student ID", "Race"], [["OTHER-SCHOOL-ID", "New"]], "update"), [learner("LOCAL")], []);
  assert.equal(plan.updates.length, 0);
  assert.match(plan.review.rows[0].explanation, /No matching Student ID in this school/);
});

test("ambiguous IDs in the existing roster block imports for manual review", () => {
  const plan = buildLearnerImportPlan(spreadsheet(["Student ID", "Race"], [["S1", "New"]], "update"), [learner("S1"), learner("s1")], []);
  assert.ok(plan.review.errors.some((e) => e.includes("duplicate Student IDs")));
});

test("unmapped, duplicate and reserved targets and surplus values cannot silently import", () => {
  const input = spreadsheet(["Student ID", "Race", "race"], [["S1", "A", "B", "Surplus"]], "update");
  const plan = buildLearnerImportPlan(input, [learner("S1")], []);
  assert.ok(plan.review.errors.some((e) => e.includes("Multiple columns")));
  assert.ok(plan.review.errors.some((e) => e.includes("More values")));
  input.columns[1] = { heading: "Race", target: "Unconfirmed", kind: "characteristic" };
  input.columns[2] = { heading: "race", target: "__proto__", kind: "characteristic", create: true, type: "category" };
  const unsafe = buildLearnerImportPlan(input, [learner("S1")], []);
  assert.ok(unsafe.review.errors.some((e) => e.includes("Confirm creation")));
  assert.ok(unsafe.review.errors.some((e) => e.includes("Reserved")));
});

test("changed roster or spreadsheet invalidates the reviewed import revision", () => {
  const input = spreadsheet(["Student ID", "Race"], [["S1", "New"]], "update");
  const saved = learner("S1"), reviewed = buildLearnerImportPlan(input, [saved], []);
  input.reviewedRevision = reviewed.review.revision;
  assert.deepEqual(buildLearnerImportPlan(input, [saved], []).review.errors, []);
  const changed = { ...saved, notes: "Changed since review" };
  assert.ok(buildLearnerImportPlan(input, [changed], []).review.errors.some((e) => e.includes("changed since")));
});

test("CSV retains semicolons, commas, tabs, BOM, quotes, multiline cells and blank rows", () => {
  assert.deepEqual(parseLearnerCsv('﻿Student ID;Notes;Race\r\n001;"Hello; ""friend""\nnext line";A\r\n\r\n002;;B\r\n'), [
    ['﻿Student ID', 'Notes', 'Race'], ['001', 'Hello; "friend"\nnext line', 'A'], [''], ['002', '', 'B'],
  ]);
  assert.deepEqual(parseLearnerCsv('Student ID,Race\n001,A\n'), [['Student ID', 'Race'], ['001', 'A']]);
  assert.deepEqual(parseLearnerCsv('Student ID\tRace\n001\tA'), [['Student ID', 'Race'], ['001', 'A']]);
  assert.throws(() => parseLearnerCsv('Student ID,Race\n001,"unclosed'), /unclosed/);
});

test("Excel loads every worksheet, all columns, percentages, formatted IDs and blank rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Learners");
  sheet.addRow(["Student ID", "English %", "Previous School"]);
  sheet.addRow([123, 0.85, "School A"]);
  sheet.getCell("A2").numFmt = "00000";
  sheet.getCell("B2").numFmt = "0%";
  sheet.addRow([]);
  sheet.addRow(["S2", 70, "School B"]);
  workbook.addWorksheet("More learners").addRow(["Student ID"]);
  const bytes = await workbook.xlsx.writeBuffer();
  const file = { name: "LEARNERS.XLSX", size: bytes.byteLength, arrayBuffer: async () => bytes } as unknown as File;
  const loaded = await readLearnerSpreadsheet(file);
  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded[0].rows, [["Student ID", "English %", "Previous School"], ["00123", "85%", "School A"], ["", "", ""], ["S2", "70", "School B"]]);
});

test("Excel formula without cached results is explained rather than dropped", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Learners");
  sheet.addRow(["Student ID", "Aggregate"]);
  sheet.addRow(["S1", { formula: "1+1" }]);
  const bytes = await workbook.xlsx.writeBuffer();
  const file = { name: "learners.xlsx", size: bytes.byteLength, arrayBuffer: async () => bytes } as unknown as File;
  await assert.rejects(() => readLearnerSpreadsheet(file), /formula has no cached value/);
});
