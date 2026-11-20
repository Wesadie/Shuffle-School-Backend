import assert from "node:assert/strict";
import test from "node:test";
import type { ClassConfig, Placement, Student } from "@shared/schema";
import { buildIncrementalGeneration } from "./incrementalGeneration";
import { retainAccountOwnedPlacements, validatePlacements, InvalidPlacementError } from "./placementSafety";

const accountA = "account-a";
const accountB = "account-b";

function student(id: string, grade: string, accountId = accountA): Student {
  return {
    id, accountId, studentId: id, firstName: id, lastName: "Learner", grade,
    currentClass: null, gender: "female", characteristics: { newGrade: grade }, notes: null,
    parentRequests: null, parentNotes: null, isNew: false, isLeaving: false,
  };
}

function classConfig(id: string, grade: string, accountId = accountA): ClassConfig {
  return { id, accountId, name: id, grade, capacity: 20 };
}

function placement(id: string, studentId: string, classId: string, accountId = accountA): Placement {
  return { id, studentId, classId, accountId, locked: false };
}

test("same-account learner move candidate validates across account-owned classes", () => {
  const learners = [student("g7-1", "7")];
  const classes = [classConfig("g7-a", "7"), classConfig("g7-b", "7")];
  const current = [placement("p1", "g7-1", "g7-a")];
  const moved = current.map((row) => ({ ...row, classId: "g7-b" }));
  validatePlacements(moved, learners, classes, [], accountA);
  assert.equal(moved[0].classId, "g7-b");
});

test("grade regeneration validates the selected grade and preserves valid placements from other grades", async () => {
  const grade6 = student("g6-1", "6");
  const grade7a = student("g7-1", "7");
  const grade7b = student("g7-2", "7");
  const classes = [classConfig("g6-a", "6"), classConfig("g7-a", "7"), classConfig("g7-b", "7")];
  const otherGradePlacement = placement("p6", grade6.id, "g6-a");
  const selectedGradePlacement = placement("p7", grade7a.id, "g7-a");
  const result = await buildIncrementalGeneration({
    accountId: accountA,
    students: [grade6, grade7a, grade7b],
    classConfigs: classes,
    placements: [otherGradePlacement, selectedGradePlacement],
    rules: [], characteristics: [], teacherPlacementPreferences: [],
    targetGrade: "7", mode: "regenerate-grade",
  }, async (toPlace, selectedClasses) => ({
    classes: selectedClasses.map((config) => ({
      classConfig: config,
      students: toPlace.filter((learner) => learner.id === grade7a.id ? config.id === "g7-b" : config.id === "g7-a"),
    })),
    unassignedStudentIds: [], conflicts: [],
  }));

  assert.deepEqual(result.placementList.map(({ studentId, classId }) => ({ studentId, classId })), [
    { studentId: grade7a.id, classId: "g7-b" },
    { studentId: grade7b.id, classId: "g7-a" },
  ]);
  assert.equal(otherGradePlacement.classId, "g6-a");
});

test("stale unrelated placements do not prevent a selected-grade candidate; cross-account refs are rejected", () => {
  const learner = student("g7-1", "7");
  const validClass = classConfig("g7-a", "7");
  const stale = placement("stale", "deleted-learner", "removed-class");
  const safeRetained = retainAccountOwnedPlacements([stale], [learner], [validClass], accountA);
  assert.deepEqual(safeRetained, []);
  assert.throws(
    () => validatePlacements([{ studentId: learner.id, classId: validClass.id }], [student(learner.id, "7", accountB)], [validClass], [], accountA),
    (error: unknown) => error instanceof InvalidPlacementError && /current account/.test(error.message),
  );
  assert.throws(
    () => validatePlacements([{ studentId: learner.id, classId: validClass.id }], [learner], [classConfig(validClass.id, "7", accountB)], [], accountA),
    (error: unknown) => error instanceof InvalidPlacementError && /current account/.test(error.message),
  );
});

test("an existing mandatory separation conflict elsewhere does not block an unrelated move", () => {
  const moving = student("moving", "7");
  const separatedA = student("separated-a", "7");
  const separatedB = student("separated-b", "7");
  const classes = [classConfig("7a", "7"), classConfig("7b", "7"), classConfig("7c", "7")];
  const baseline = [
    placement("pm", moving.id, "7a"),
    placement("pa", separatedA.id, "7b"),
    placement("pb", separatedB.id, "7b"),
  ];
  const rules = [{
    id: "existing-separation", accountId: accountA, type: "separate" as const,
    studentId1: separatedA.id, studentId2: separatedB.id,
    reason: null, importance: "mandatory" as const, comment: null,
  }];
  const candidate = baseline.map((row) => row.studentId === moving.id ? { ...row, classId: "7c" } : row);
  assert.doesNotThrow(() => validatePlacements(candidate, [moving, separatedA, separatedB], classes, rules, accountA, false, baseline));
});

test("a move that introduces a new mandatory separation conflict is still rejected", () => {
  const moving = student("moving", "7");
  const partner = student("partner", "7");
  const classes = [classConfig("7a", "7"), classConfig("7b", "7")];
  const baseline = [placement("pm", moving.id, "7a"), placement("pp", partner.id, "7b")];
  const candidate = [placement("pm", moving.id, "7b"), placement("pp", partner.id, "7b")];
  const rules = [{
    id: "new-separation", accountId: accountA, type: "separate" as const,
    studentId1: moving.id, studentId2: partner.id,
    reason: null, importance: "mandatory" as const, comment: null,
  }];
  assert.throws(
    () => validatePlacements(candidate, [moving, partner], classes, rules, accountA, false, baseline),
    /mandatory separation request/,
  );
});
