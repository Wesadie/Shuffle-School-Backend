import assert from "node:assert/strict";
import test from "node:test";
import { getNextGrade, getStudentTargetGrade, isIncomingGradeRAwaitingAllocation } from "./grades";

test("incoming unallocated Grade R has no placement target and awaits allocation", () => {
  const student = { grade: "R", currentClass: null, characteristics: {} };
  assert.equal(isIncomingGradeRAwaitingAllocation(student), true);
  assert.equal(getStudentTargetGrade(student), "");
});

test("Grade R advances to Grade 1 when explicitly given a destination class or New Grade", () => {
  assert.equal(getNextGrade("R"), "1");
  assert.equal(getStudentTargetGrade({ grade: "R", currentClass: "Grade 1 A", characteristics: {} }), "1");
  assert.equal(getStudentTargetGrade({ grade: "R", currentClass: null, characteristics: { newGrade: "Grade 1" } }), "1");
});

test("numeric grade progression is unchanged", () => {
  assert.equal(getStudentTargetGrade({ grade: "6", currentClass: null, characteristics: {} }), "7");
});
