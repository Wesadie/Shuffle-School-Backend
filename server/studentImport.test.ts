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
