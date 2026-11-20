import type { ClassConfig, Placement, Rule, Student, Characteristic } from "@shared/schema";
import { getStudentTargetGrade, normalizeGradeValue } from "@shared/grades";
import type { TeacherPlacementPreference } from "./generationSafety";
import { InvalidPlacementError, retainAccountOwnedPlacements, validatePlacements } from "./placementSafety";

export interface IncrementalGenerationResult {
  placementList: { studentId: string; classId: string }[];
  affectedStudentIds: string[];
  studentsToPlace: Student[];
  conflicts: string[];
}

export async function buildIncrementalGeneration(
  input: {
    accountId?: string;
    students: Student[];
    classConfigs: ClassConfig[];
    placements: Placement[];
    rules: Rule[];
    characteristics: Characteristic[];
    teacherPlacementPreferences: TeacherPlacementPreference[];
    targetGrade: string;
    mode: "unallocated" | "regenerate-grade";
    existingPlacements?: Placement[];
  },
  generate: (
    students: Student[],
    classes: ClassConfig[],
    rules: Rule[],
    characteristics: Characteristic[],
    preferences: TeacherPlacementPreference[],
    context: { fixedStudentsByClass: Map<string, Student[]>; currentClassCounts: Map<string, number>; cohortStudents: Student[] },
  ) => Promise<{ classes: { classConfig: ClassConfig; students: Student[] }[]; unassignedStudentIds: string[]; conflicts: { message: string }[] }>,
): Promise<IncrementalGenerationResult> {
  const grade = normalizeGradeValue(input.targetGrade);
  const accountId = input.accountId ?? input.students[0]?.accountId ?? "";
  const allCurrentPlacements = input.existingPlacements ?? input.placements;
  const currentPlacements = retainAccountOwnedPlacements(
    allCurrentPlacements,
    input.students,
    input.classConfigs,
    accountId,
  );
  const gradeStudents = input.students.filter((student) => getStudentTargetGrade(student) === grade);
  const gradeIds = new Set(gradeStudents.map((student) => student.id));
  const placementByStudent = new Map(currentPlacements.map((placement) => [placement.studentId, placement]));
  const studentsToPlace = input.mode === "unallocated"
    ? gradeStudents.filter((student) => !placementByStudent.has(student.id))
    : gradeStudents;
  if (!studentsToPlace.length) throw new InvalidPlacementError(`No unallocated learners with destination Grade ${grade} need placement.`);

  const selectedGradeConfigs = input.classConfigs.filter((config) => normalizeGradeValue(config.grade) === grade);
  if (!selectedGradeConfigs.length) throw new InvalidPlacementError(`No target classes are configured for Grade ${grade}.`);

  const protectedPlacements = currentPlacements.filter((placement) =>
    !gradeIds.has(placement.studentId) || (input.mode === "unallocated" && gradeIds.has(placement.studentId)),
  );
  const fixedIds = new Set(protectedPlacements.map((placement) => placement.studentId));
  const fixedStudentsByClass = new Map<string, Student[]>();
  const currentClassCounts = new Map<string, number>();
  protectedPlacements.forEach((placement) => {
    currentClassCounts.set(placement.classId, (currentClassCounts.get(placement.classId) ?? 0) + 1);
    const student = input.students.find((entry) => entry.id === placement.studentId);
    if (!student) return;
    const members = fixedStudentsByClass.get(placement.classId) ?? [];
    members.push(student);
    fixedStudentsByClass.set(placement.classId, members);
  });

  const boundaryPairing = input.rules.find((rule) =>
    rule.importance !== "important" && rule.type === "pair"
    && (gradeIds.has(rule.studentId1) !== gradeIds.has(rule.studentId2))
    && (fixedIds.has(rule.studentId1) || fixedIds.has(rule.studentId2)),
  );
  if (boundaryPairing) {
    throw new InvalidPlacementError("A mandatory pairing connects this grade to a protected learner. The placements cannot be satisfied without moving a protected learner.");
  }

  const selectedRules = input.rules.filter((rule) => gradeIds.has(rule.studentId1) && gradeIds.has(rule.studentId2));
  const selectedPreferences = input.teacherPlacementPreferences.filter((preference) =>
    studentsToPlace.some((student) => student.id === preference.studentId),
  );
  const remainingCapacity = selectedGradeConfigs.reduce((total, config) => {
    const protectedCount = currentClassCounts.get(config.id) ?? 0;
    return total + Math.max(0, (config.capacity || 30) - protectedCount);
  }, 0);
  if (remainingCapacity <= 0) throw new InvalidPlacementError(`Grade ${grade} has no target class capacity available without moving protected learners.`);
  // Keep full class capacities here. The solver already counts protected
  // learners in each class when checking capacity; reducing capacity here too
  // would count those learners twice.
  const classesWithRemainingCapacity = selectedGradeConfigs;

  const result = await generate(
    studentsToPlace,
    classesWithRemainingCapacity,
    selectedRules,
    input.characteristics,
    selectedPreferences,
    { fixedStudentsByClass, currentClassCounts, cohortStudents: gradeStudents },
  );
  if (result.unassignedStudentIds.length) {
    throw new InvalidPlacementError(`Mandatory rules or capacity prevented placing these learners: ${result.unassignedStudentIds.join(", ")}`);
  }

  const studentsToPlaceIds = new Set(studentsToPlace.map((student) => student.id));
  // Incremental solver results include protected learners for scoring and
  // class-balance summaries. Persist only newly generated/re-generated learners.
  const generatedPlacements = result.classes.flatMap((generatedClass) => generatedClass.students
    .filter((student) => studentsToPlaceIds.has(student.id))
    .map((student) => {
      if (student.accountId !== accountId || generatedClass.classConfig.accountId !== accountId) {
        throw new InvalidPlacementError("Placement references must belong to the current account");
      }
      return { studentId: student.id, classId: generatedClass.classConfig.id };
    }));
  const affectedStudentIds = studentsToPlace.map((student) => student.id);
  const preservedPlacements = retainAccountOwnedPlacements(
    input.placements,
    input.students,
    input.classConfigs,
    accountId,
    input.mode === "regenerate-grade" ? gradeIds : new Set(),
  );
  const nextPlacements = [
    ...preservedPlacements.map(({ studentId, classId }) => ({ studentId, classId })),
    ...generatedPlacements,
  ];
  validatePlacements(nextPlacements, input.students, input.classConfigs, input.rules, accountId, false, allCurrentPlacements);

  return {
    placementList: generatedPlacements,
    affectedStudentIds,
    studentsToPlace,
    conflicts: result.conflicts.map((conflict) => conflict.message),
  };
}
