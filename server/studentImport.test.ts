import assert from "node:assert/strict";
import test from "node:test";
import { partitionStudentImportRows } from "./studentImport";

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
