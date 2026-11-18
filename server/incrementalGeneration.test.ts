import assert from "node:assert/strict";
import test from "node:test";
import type { Characteristic, ClassConfig, Placement, Rule, Student, Teacher } from "@shared/schema";
import { buildIncrementalGeneration } from "./incrementalGeneration";
import { generateBalancedClasses } from "./routes";
import { InvalidPlacementError } from "./placementSafety";

function makeStudent(
  id: string,
  grade: string,
  gender: string = "male",
  characteristics: Record<string, string> = {},
  currentClass: string | null = null,
): Student {
  return {
    id,
    accountId: "account",
    studentId: id,
    firstName: id,
    lastName: "Learner",
    grade,
    currentClass,
    gender,
    characteristics,
    notes: null,
    parentRequests: null,
    parentNotes: null,
    isNew: false,
    isLeaving: false,
  };
}

function makeClass(id: string, grade: string, capacity: number = 30): ClassConfig {
  return { id, accountId: "account", name: id, grade, capacity };
}

function makePlacement(studentId: string, classId: string): Placement {
  return { id: `placement-${studentId}`, accountId: "account", studentId, classId, locked: false };
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

function makePlacementRequest(studentId: string, teacherId: string): { studentId: string; classId: string } {
  return { studentId, classId: "" }; // classId will be set by mapTeacherPlacementRequests
}

test("buildIncrementalGeneration unallocated mode: throws when zero unallocated learners", async () => {
  // Setup: 98 Grade 2 learners, all already placed
  const grade2Students = Array.from({ length: 98 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  const grade2Classes = [makeClass("2A", "2", 50), makeClass("2B", "2", 48)];
  const placements = grade2Students.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));

  // Other grades with placements
  const grade1Students = Array.from({ length: 50 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade1Classes = [makeClass("1A", "1", 25), makeClass("1B", "1", 25)];
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students];
  const allPlacements = [...grade1Placements, ...placements];
  const allClasses = [...grade1Classes, ...grade2Classes];

  await assert.rejects(
    buildIncrementalGeneration(
      {
        students: allStudents,
        classConfigs: allClasses,
        placements: allPlacements,
        rules: [],
        characteristics: [],
        teacherPlacementPreferences: [],
        targetGrade: "2",
        mode: "unallocated",
      },
      generateBalancedClasses,
    ),
    (err: Error) => {
      assert.ok(err instanceof InvalidPlacementError);
      assert.match(err.message, /No unallocated learners with destination Grade 2 need placement/);
      return true;
    },
  );
});

test("buildIncrementalGeneration unallocated mode: only places unallocated learners, preserves existing placements", async () => {
  // Setup: Grade 2 has 100 learners, 98 already placed, 2 unallocated
  const grade2Students = Array.from({ length: 100 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  const grade2Classes = [makeClass("2A", "2", 50), makeClass("2B", "2", 50)];
  
  // 98 already placed (49 in each class)
  const placedStudents = grade2Students.slice(0, 98);
  const unallocatedStudents = grade2Students.slice(98);
  const placements = placedStudents.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));

  // Other grades
  const grade1Students = Array.from({ length: 50 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade1Classes = [makeClass("1A", "1", 25), makeClass("1B", "1", 25)];
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students];
  const allPlacements = [...grade1Placements, ...placements];
  const allClasses = [...grade1Classes, ...grade2Classes];

  const result = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: allPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "unallocated",
    },
    generateBalancedClasses,
  );

  // Should only place the 2 unallocated students
  assert.equal(result.affectedStudentIds.length, 2);
  assert.deepEqual(new Set(result.affectedStudentIds), new Set(unallocatedStudents.map(s => s.id)));
  
  // Should not affect Grade 1 placements
  const grade1PlacementIds = new Set(grade1Placements.map(p => p.studentId));
  for (const placement of result.placementList) {
    assert.ok(!grade1PlacementIds.has(placement.studentId), "Grade 1 placement should not be affected");
  }
});

test("buildIncrementalGeneration regenerate-grade mode: regenerates all Grade 2 placements, preserves other grades", async () => {
  // Setup: Grade 2 has 100 learners, all placed
  const grade2Students = Array.from({ length: 100 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  const grade2Classes = [makeClass("2A", "2", 50), makeClass("2B", "2", 50)];
  const placements = grade2Students.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));

  // Other grades
  const grade1Students = Array.from({ length: 50 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade1Classes = [makeClass("1A", "1", 25), makeClass("1B", "1", 25)];
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students];
  const allPlacements = [...grade1Placements, ...placements];
  const allClasses = [...grade1Classes, ...grade2Classes];

  const result = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: allPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "regenerate-grade",
    },
    generateBalancedClasses,
  );

  // Should regenerate all 100 Grade 2 students
  assert.equal(result.affectedStudentIds.length, 100);
  assert.deepEqual(new Set(result.affectedStudentIds), new Set(grade2Students.map(s => s.id)));
  
  // Should not affect Grade 1 placements
  const grade1PlacementIds = new Set(grade1Placements.map(p => p.studentId));
  for (const placement of result.placementList) {
    assert.ok(!grade1PlacementIds.has(placement.studentId), "Grade 1 placement should not be affected");
  }
});

test("buildIncrementalGeneration unallocated mode: does not modify placements outside target grade", async () => {
  // Setup: Multiple grades with placements
  const grade1Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade2Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  const grade3Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g3-${i}`, "3", i % 2 === 0 ? "male" : "female"));
  
  const grade1Classes = [makeClass("1A", "1", 15), makeClass("1B", "1", 15)];
  const grade2Classes = [makeClass("2A", "2", 15), makeClass("2B", "2", 15)];
  const grade3Classes = [makeClass("3A", "3", 15), makeClass("3B", "3", 15)];
  
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));
  const grade2Placements = grade2Students.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));
  const grade3Placements = grade3Students.map((s, i) => makePlacement(s.id, grade3Classes[i % 2].id));

  // Make 2 Grade 2 students unallocated
  const unallocatedGrade2 = grade2Students.slice(28);
  const placedGrade2 = grade2Students.slice(0, 28);
  const updatedGrade2Placements = placedGrade2.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students, ...grade3Students];
  const allPlacements = [...grade1Placements, ...updatedGrade2Placements, ...grade3Placements];
  const allClasses = [...grade1Classes, ...grade2Classes, ...grade3Classes];

  const result = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: allPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "unallocated",
    },
    generateBalancedClasses,
  );

  // Should only place the 2 unallocated Grade 2 students
  assert.equal(result.affectedStudentIds.length, 2);
  assert.deepEqual(new Set(result.affectedStudentIds), new Set(unallocatedGrade2.map(s => s.id)));

  // Verify no Grade 1 or Grade 3 placements are in the result
  const grade1PlacementIds = new Set(grade1Placements.map(p => p.studentId));
  const grade3PlacementIds = new Set(grade3Placements.map(p => p.studentId));
  for (const placement of result.placementList) {
    assert.ok(!grade1PlacementIds.has(placement.studentId), "Grade 1 placement should not be affected");
    assert.ok(!grade3PlacementIds.has(placement.studentId), "Grade 3 placement should not be affected");
  }
});

test("buildIncrementalGeneration regenerate-grade mode: only modifies target grade placements", async () => {
  // Setup: Multiple grades with placements
  const grade1Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade2Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  const grade3Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g3-${i}`, "3", i % 2 === 0 ? "male" : "female"));
  
  const grade1Classes = [makeClass("1A", "1", 15), makeClass("1B", "1", 15)];
  const grade2Classes = [makeClass("2A", "2", 15), makeClass("2B", "2", 15)];
  const grade3Classes = [makeClass("3A", "3", 15), makeClass("3B", "3", 15)];
  
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));
  const grade2Placements = grade2Students.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));
  const grade3Placements = grade3Students.map((s, i) => makePlacement(s.id, grade3Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students, ...grade3Students];
  const allPlacements = [...grade1Placements, ...grade2Placements, ...grade3Placements];
  const allClasses = [...grade1Classes, ...grade2Classes, ...grade3Classes];

  const result = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: allPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "regenerate-grade",
    },
    generateBalancedClasses,
  );

  // Should regenerate all 30 Grade 2 students
  assert.equal(result.affectedStudentIds.length, 30);
  assert.deepEqual(new Set(result.affectedStudentIds), new Set(grade2Students.map(s => s.id)));

  // Verify no Grade 1 or Grade 3 placements are in the result
  const grade1PlacementIds = new Set(grade1Placements.map(p => p.studentId));
  const grade3PlacementIds = new Set(grade3Placements.map(p => p.studentId));
  for (const placement of result.placementList) {
    assert.ok(!grade1PlacementIds.has(placement.studentId), "Grade 1 placement should not be affected");
    assert.ok(!grade3PlacementIds.has(placement.studentId), "Grade 3 placement should not be affected");
  }
});

test("buildIncrementalGeneration: respects capacity constraints with fixed students from other grades", async () => {
  // Setup: Grade 1 classes are full, Grade 2 has space
  const grade1Students = Array.from({ length: 60 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade2Students = Array.from({ length: 10 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  
  const grade1Classes = [makeClass("1A", "1", 30), makeClass("1B", "1", 30)];
  const grade2Classes = [makeClass("2A", "2", 10), makeClass("2B", "2", 10)];
  
  const grade1Placements = grade1Students.map((s, i) => makePlacement(s.id, grade1Classes[i % 2].id));
  const grade2Placements = grade2Students.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));

  const allStudents = [...grade1Students, ...grade2Students];
  const allPlacements = [...grade1Placements, ...grade2Placements];
  const allClasses = [...grade1Classes, ...grade2Classes];

  // Should work - Grade 2 has capacity for unallocated learners
  const result = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: allPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "unallocated",
    },
    generateBalancedClasses,
  );

  // All Grade 2 students are already placed, so should throw
  // Actually, let's make 2 unallocated
  const unallocatedGrade2 = grade2Students.slice(8);
  const placedGrade2 = grade2Students.slice(0, 8);
  const updatedGrade2Placements = placedGrade2.map((s, i) => makePlacement(s.id, grade2Classes[i % 2].id));
  const updatedAllPlacements = [...grade1Placements, ...updatedGrade2Placements];

  const result2 = await buildIncrementalGeneration(
    {
      students: allStudents,
      classConfigs: allClasses,
      placements: updatedAllPlacements,
      rules: [],
      characteristics: [],
      teacherPlacementPreferences: [],
      targetGrade: "2",
      mode: "unallocated",
    },
    generateBalancedClasses,
  );

  assert.equal(result2.affectedStudentIds.length, 2);
  assert.deepEqual(new Set(result2.affectedStudentIds), new Set(unallocatedGrade2.map(s => s.id)));
});

test("buildIncrementalGeneration: throws when no capacity available without moving protected learners", async () => {
  // Setup: Grade 2 classes are full with protected learners from other grades
  // This simulates a case where Grade 1 students are in Grade 2 classes (shouldn't happen normally)
  const grade1Students = Array.from({ length: 30 }, (_, i) => makeStudent(`g1-${i}`, "1", i % 2 === 0 ? "male" : "female"));
  const grade2Students = Array.from({ length: 10 }, (_, i) => makeStudent(`g2-${i}`, "2", i % 2 === 0 ? "male" : "female"));
  
  const grade1Classes = [makeClass("1A", "1", 30)];
  const grade2Classes = [makeClass("2A", "2", 10)];
  
  // Grade 1 students placed in Grade 1 class
  const grade1Placements = grade1Students.map((s) => makePlacement(s.id, grade1Classes[0].id));
  // Grade 2 students placed in Grade 2 class (full)
  const grade2Placements = grade2Students.map((s) => makePlacement(s.id, grade2Classes[0].id));

  const allStudents = [...grade1Students, ...grade2Students];
  const allPlacements = [...grade1Placements, ...grade2Placements];
  const allClasses = [...grade1Classes, ...grade2Classes];

  // Make 2 Grade 2 students unallocated
  const unallocatedGrade2 = grade2Students.slice(8);
  const placedGrade2 = grade2Students.slice(0, 8);
  const updatedGrade2Placements = placedGrade2.map((s) => makePlacement(s.id, grade2Classes[0].id));
  const updatedAllPlacements = [...grade1Placements, ...updatedGrade2Placements];

  await assert.rejects(
    buildIncrementalGeneration(
      {
        students: allStudents,
        classConfigs: allClasses,
        placements: updatedAllPlacements,
        rules: [],
        characteristics: [],
        teacherPlacementPreferences: [],
        targetGrade: "2",
        mode: "unallocated",
      },
      generateBalancedClasses,
    ),
    (err: Error) => {
      assert.ok(err instanceof InvalidPlacementError);
      assert.match(err.message, /no target class capacity available without moving protected learners/);
      return true;
    },
  );
});