import assert from "node:assert/strict";
import test from "node:test";
import type { Characteristic, ClassConfig, ClassGenerationResult, Placement, PlacementRequest, Rule, Student, Teacher } from "@shared/schema";
import { generateBalancedClasses } from "./routes";
import { mapTeacherPlacementRequests, persistCompleteGeneration } from "./generationSafety";
import {
  buildSwapPlacements,
  InvalidPlacementError,
  PlacementRevisionConflictError,
  runRevisionedMutation,
  validatePlacements,
} from "./placementSafety";

function makeStudent(id: string, gender: string, characteristics: Record<string, string> = {}): Student {
  return {
    id,
    accountId: "account",
    studentId: id,
    firstName: id,
    lastName: "Learner",
    grade: "4",
    currentClass: null,
    gender,
    characteristics,
    notes: null,
    parentRequests: null,
    parentNotes: null,
    isNew: false,
    isLeaving: false,
  };
}

function makeClass(id: string, capacity: number): ClassConfig {
  return { id, accountId: "account", name: id, grade: "5", capacity };
}

function makeCategoryCharacteristic(id: string, name: string, priority: number): Characteristic {
  return {
    id,
    accountId: "account",
    name,
    type: "category",
    options: ["A", "B"],
    responseConfig: [],
    priority,
    tagOnly: false,
    multiSelect: false,
    adminOnly: false,
    applyToAllGrades: true,
    applicableGrades: [],
  };
}

function makeRule(type: "pair" | "separate", studentId1: string, studentId2: string): Rule {
  return {
    id: `${type}-${studentId1}-${studentId2}`,
    accountId: "account",
    type,
    studentId1,
    studentId2,
    reason: null,
    importance: "mandatory",
    comment: null,
  };
}

function makeTeacher(id: string, allocatedClass: string | null): Teacher {
  return {
    id,
    accountId: "account",
    firstName: id,
    lastName: "Teacher",
    email: `${id}@example.test`,
    currentClass: null,
    allocatedClass,
    surveyStatus: "Completed",
    surveyDate: null,
    surveyMessage: null,
    surveySettings: null,
  };
}

function makePlacementRequest(studentId: string, teacherId: string): PlacementRequest {
  return {
    id: `request-${studentId}`,
    accountId: "account",
    studentId,
    teacherId,
    requestedByTeacherId: "requester",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function classForStudent(result: ClassGenerationResult, studentId: string) {
  return result.classes.find((generatedClass) =>
    generatedClass.students.some((student) => student.id === studentId),
  );
}

test("normalizes gender aliases and distributes a balanced cohort evenly", async () => {
  const students = [
    makeStudent("m1", "MALE"),
    makeStudent("m2", " m "),
    makeStudent("m3", "Boy"),
    makeStudent("m4", "male"),
    makeStudent("f1", "FEMALE"),
    makeStudent("f2", " f "),
    makeStudent("f3", "Girl"),
    makeStudent("f4", "female"),
  ];
  const result = await generateBalancedClasses(students, [makeClass("A", 4), makeClass("B", 4)], [], []);

  assert.deepEqual(result.unassignedStudentIds, []);
  for (const generatedClass of result.classes) {
    assert.equal(generatedClass.students.length, 4);
    assert.equal(generatedClass.students.filter((student) => ["male", "m", "boy"].includes(student.gender!.trim().toLowerCase())).length, 2, JSON.stringify({ classes: result.classes.map((entry) => entry.students.map((student) => student.gender)), conflicts: result.conflicts }));
    assert.equal(generatedClass.students.filter((student) => ["female", "f", "girl"].includes(student.gender!.trim().toLowerCase())).length, 2);
  }
});

test("improves configured category balance without reducing gender balance", async () => {
  const students = [
    makeStudent("m1", "male", { Aggregate: "A" }),
    makeStudent("m2", "male", { Aggregate: "A" }),
    makeStudent("m3", "male", { Aggregate: "B" }),
    makeStudent("m4", "male", { Aggregate: "B" }),
    makeStudent("f1", "female", { Aggregate: "A" }),
    makeStudent("f2", "female", { Aggregate: "A" }),
    makeStudent("f3", "female", { Aggregate: "B" }),
    makeStudent("f4", "female", { Aggregate: "B" }),
  ];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 4), makeClass("B", 4)],
    [],
    [makeCategoryCharacteristic("aggregate", "Aggregate", 3)],
  );

  for (const generatedClass of result.classes) {
    assert.equal(generatedClass.students.filter((student) => student.gender === "male").length, 2);
    assert.equal(generatedClass.students.filter((student) => student.gender === "female").length, 2);
    assert.equal(generatedClass.students.filter((student) => student.characteristics.Aggregate === "A").length, 2);
    assert.equal(generatedClass.students.filter((student) => student.characteristics.Aggregate === "B").length, 2);
  }
});

test("keeps unknown gender values as normalized independent categories", async () => {
  const students = [
    makeStudent("male", " M "),
    makeStudent("female", "F"),
    makeStudent("other1", " Other "),
    makeStudent("other2", "OTHER"),
  ];
  const result = await generateBalancedClasses(students, [makeClass("A", 2), makeClass("B", 2)], [], []);

  assert.equal(result.classes.reduce((count, generatedClass) =>
    count + generatedClass.students.filter((student) => student.gender?.trim().toLowerCase() === "other").length,
  0), 2);
  assert.deepEqual(result.unassignedStudentIds, []);
});

test("honors a teacher placement preference when it does not conflict with stronger objectives", async () => {
  const students = [makeStudent("a", "male"), makeStudent("b", "female")];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 2), makeClass("B", 2)],
    [],
    [],
    [{ studentId: "a", classId: "B" }],
  );

  assert.equal(classForStudent(result, "a")?.classConfig.id, "B");
  assert.equal(result.conflicts.some((conflict) => conflict.type === "teacher-placement"), false);
});

test("reports a teacher placement preference blocked by mandatory-pair capacity", async () => {
  const students = [makeStudent("requested", "female"), makeStudent("partner", "male")];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 1), makeClass("B", 1)],
    [makeRule("pair", "requested", "partner")],
    [],
    [{ studentId: "requested", classId: "A" }],
  );

  assert.equal(classForStudent(result, "requested"), undefined);
  assert.deepEqual(new Set(result.unassignedStudentIds), new Set(["requested", "partner"]));
  assert.equal(result.conflicts.some((conflict) => conflict.type === "capacity"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.type === "teacher-placement"), true);
});

test("moves Ryan to Kyle's requested class when a gender-neutral swap is feasible", async () => {
  const students = [
    makeStudent("male1", "male"),
    makeStudent("male2", "male"),
    makeStudent("male3", "male"),
    { ...makeStudent("ryan", "female"), firstName: "Ryan", lastName: "Ekerold" },
  ];
  const kyleClass = { ...makeClass("kyle", 2), name: "5BA" };
  const ruthClass = { ...makeClass("ruth", 2), name: "5A" };
  const result = await generateBalancedClasses(
    students,
    [kyleClass, ruthClass],
    [],
    [],
    [{ studentId: "ryan", classId: kyleClass.id }],
  );

  assert.equal(classForStudent(result, "ryan")?.classConfig.id, kyleClass.id);
  assert.equal(result.conflicts.some((conflict) => conflict.type === "teacher-placement"), false);
  assert.ok(result.classes.every((generatedClass) => generatedClass.students.length <= generatedClass.classConfig.capacity!));
});

test("keeps mandatory pairs together and separations apart", async () => {
  const students = [
    makeStudent("pair1", "male"),
    makeStudent("pair2", "female"),
    makeStudent("apart", "female"),
  ];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 2), makeClass("B", 2)],
    [makeRule("pair", "pair1", "pair2"), makeRule("separate", "pair1", "apart")],
    [],
  );

  assert.equal(classForStudent(result, "pair1")?.classConfig.id, classForStudent(result, "pair2")?.classConfig.id);
  assert.notEqual(classForStudent(result, "pair1")?.classConfig.id, classForStudent(result, "apart")?.classConfig.id);
  assert.equal(result.conflicts.some((conflict) => conflict.type === "pairing" || conflict.type === "separation"), false);
});

test("leaves an oversized mandatory pair unassigned instead of exceeding capacity", async () => {
  const students = [makeStudent("pair1", "male"), makeStudent("pair2", "female")];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 1), makeClass("B", 1)],
    [makeRule("pair", "pair1", "pair2")],
    [],
  );

  assert.deepEqual(new Set(result.unassignedStudentIds), new Set(["pair1", "pair2"]));
  assert.equal(result.conflicts.some((conflict) => conflict.type === "capacity"), true);
  assert.ok(result.classes.every((generatedClass) => generatedClass.students.length <= generatedClass.classConfig.capacity!));
});

test("does not invoke placement persistence for an incomplete generation", async () => {
  const students = [makeStudent("assigned", "male"), makeStudent("unassigned", "female")];
  const result = await generateBalancedClasses(
    students,
    [makeClass("A", 1)],
    [],
    [],
  );
  let persistCalled = false;

  const validation = await persistCompleteGeneration(students, result, async () => {
    persistCalled = true;
  });

  assert.equal(validation.complete, false);
  assert.equal(persistCalled, false);
});

test("maps teacher placement requests through allocated class name and target grade", () => {
  const learner = makeStudent("learner", "female");
  const request = makePlacementRequest(learner.id, "teacher");
  const teacher = makeTeacher("teacher", "Room B");
  const configs = [makeClass("a", 10), { ...makeClass("b", 10), name: " room b " }];
  const mapped = mapTeacherPlacementRequests([learner], [request], [teacher], configs);

  assert.deepEqual(mapped.preferences, [{ studentId: learner.id, classId: "b" }]);
});

test("rejects teacher placement requests without an unambiguous same-grade class mapping", () => {
  const learner = makeStudent("learner", "female");
  const request = makePlacementRequest(learner.id, "teacher");

  assert.ok(mapTeacherPlacementRequests(
    [learner], [request], [makeTeacher("teacher", null)], [makeClass("a", 10)],
  ).error);
  assert.ok(mapTeacherPlacementRequests(
    [learner], [request], [makeTeacher("teacher", "Room B")], [{ ...makeClass("b", 10), name: "Room B", grade: "6" }],
  ).error);
  assert.ok(mapTeacherPlacementRequests(
    [learner], [request], [makeTeacher("teacher", "Room B")], [
      { ...makeClass("b1", 10), name: "Room B" },
      { ...makeClass("b2", 10), name: " room b " },
    ],
  ).error);
});

test("only one concurrent mutation can commit against the same placement revision", async () => {
  let revision = 4;
  let mutationCount = 0;
  const advance = async (expected: number) => {
    if (revision !== expected) return null;
    revision += 1;
    return revision;
  };
  const results = await Promise.allSettled([
    runRevisionedMutation(4, advance, async () => {
      mutationCount += 1;
    }),
    runRevisionedMutation(4, advance, async () => {
      mutationCount += 1;
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof PlacementRevisionConflictError);
  assert.equal(revision, 5);
  assert.equal(mutationCount, 1);
});

test("rejects duplicate placements for a learner", () => {
  const students = [makeStudent("one", "female")];
  const configs = [makeClass("A", 3), makeClass("B", 3)];
  const candidate = [
    { studentId: "one", classId: "A" },
    { studentId: "one", classId: "B" },
  ];

  assert.throws(() => validatePlacements(candidate, students, configs, []), InvalidPlacementError);
});

test("rejects placements over class capacity and invalid account references", () => {
  const students = [makeStudent("one", "female"), makeStudent("two", "male")];
  const configs = [makeClass("A", 1)];

  assert.throws(
    () => validatePlacements([{ studentId: "one", classId: "A" }, { studentId: "two", classId: "A" }], students, configs, []),
    /exceeds capacity/,
  );
  assert.throws(
    () => validatePlacements([{ studentId: "one", classId: "missing" }], students, configs, []),
    /current account/,
  );
});

test("rejects placements that violate mandatory pair and separation constraints", () => {
  const students = [makeStudent("one", "female"), makeStudent("two", "male")];
  const configs = [makeClass("A", 3), makeClass("B", 3)];

  assert.throws(
    () => validatePlacements(
      [{ studentId: "one", classId: "A" }, { studentId: "two", classId: "B" }],
      students,
      configs,
      [makeRule("pair", "one", "two")],
    ),
    /mandatory together/,
  );
  assert.throws(
    () => validatePlacements(
      [{ studentId: "one", classId: "A" }, { studentId: "two", classId: "A" }],
      students,
      configs,
      [makeRule("separate", "one", "two")],
    ),
    /mandatory separation/,
  );
});

test("a rejected swap leaves its placement snapshot unchanged", () => {
  const original: Placement[] = [
    { id: "p1", accountId: "account", studentId: "one", classId: "A", locked: false },
    { id: "p2", accountId: "account", studentId: "two", classId: "B", locked: false },
  ];
  const students = [makeStudent("one", "female"), makeStudent("two", "male")];
  const configs = [makeClass("A", 1), makeClass("B", 1)];
  const invalidSwap = buildSwapPlacements(original, "one", "B", "two", "B");

  assert.throws(() => validatePlacements(invalidSwap, students, configs, []), /exceeds capacity/);
  assert.deepEqual(original.map(({ studentId, classId }) => ({ studentId, classId })), [
    { studentId: "one", classId: "A" },
    { studentId: "two", classId: "B" },
  ]);
});