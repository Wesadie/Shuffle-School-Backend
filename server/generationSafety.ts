import type { ClassConfig, ClassGenerationResult, Placement, PlacementRequest, Rule, Student, Teacher } from "@shared/schema";
import { getStudentTargetGrade, normalizeGradeValue } from "@shared/grades";

export interface TeacherPlacementPreference {
  studentId: string;
  classId: string;
}

export interface GenerationValidation {
  complete: boolean;
  error?: string;
}

export type PlacementGenerationMode = "unallocated" | "regenerate-grade" | "full";

export function partitionPlacementGeneration(
  mode: PlacementGenerationMode,
  selectedGrade: string | null,
  eligibleStudents: Student[],
  existingPlacements: Placement[],
  classConfigs: ClassConfig[],
) {
  const targetGrade = selectedGrade ? normalizeGradeValue(selectedGrade) : null;
  const inTargetGrade = (student: Student) => !targetGrade || getStudentTargetGrade(student) === targetGrade;
  const existingStudentIds = new Set(existingPlacements.map((placement) => placement.studentId));
  const affectedStudents = mode === "unallocated"
    ? eligibleStudents.filter((student) => inTargetGrade(student) && !existingStudentIds.has(student.id))
    : mode === "regenerate-grade"
      ? eligibleStudents.filter(inTargetGrade)
      : eligibleStudents;
  const affectedIds = new Set(affectedStudents.map((student) => student.id));
  const protectedPlacements = existingPlacements.filter((placement) => !affectedIds.has(placement.studentId));
  const affectedClasses = targetGrade
    ? classConfigs.filter((config) => normalizeGradeValue(config.grade) === targetGrade)
    : classConfigs;
  return { affectedStudents, affectedIds, protectedPlacements, affectedClasses };
}

export function validateCompleteGeneration(
  students: Student[],
  result: ClassGenerationResult,
): GenerationValidation {
  const expectedIds = new Set(students.map((student) => student.id));
  const assignedIds = new Set<string>();

  for (const generatedClass of result.classes) {
    const capacity = generatedClass.classConfig.capacity || 30;
    if (generatedClass.students.length > capacity) {
      return {
        complete: false,
        error: `${generatedClass.classConfig.name} exceeds capacity (${generatedClass.students.length}/${capacity})`,
      };
    }

    for (const student of generatedClass.students) {
      if (!expectedIds.has(student.id) || assignedIds.has(student.id)) {
        return { complete: false, error: "Generation contains an unexpected or duplicate learner assignment" };
      }
      if (getStudentTargetGrade(student) !== normalizeGradeValue(generatedClass.classConfig.grade)) {
        return { complete: false, error: `Learner ${student.id} was assigned to the wrong target grade` };
      }
      assignedIds.add(student.id);
    }
  }

  const unassignedStudentIds = students
    .filter((student) => !assignedIds.has(student.id))
    .map((student) => student.id);
  if (unassignedStudentIds.length > 0 || result.unassignedStudentIds.length > 0) {
    return {
      complete: false,
      error: `${unassignedStudentIds.length || result.unassignedStudentIds.length} learner${unassignedStudentIds.length === 1 ? " is" : "s are"} unassigned`,
    };
  }

  const hardConflict = result.conflicts.find((conflict) =>
    conflict.type === "capacity" || conflict.type === "pairing" || conflict.type === "separation",
  );
  if (hardConflict) return { complete: false, error: hardConflict.message };

  return { complete: true };
}

export async function persistCompleteGeneration(
  students: Student[],
  result: ClassGenerationResult,
  persist: () => Promise<unknown>,
): Promise<GenerationValidation> {
  const validation = validateCompleteGeneration(students, result);
  if (!validation.complete) return validation;
  await persist();
  return validation;
}

export function mapTeacherPlacementRequests(
  students: Student[],
  requests: PlacementRequest[],
  teachers: Teacher[],
  targetConfigs: ClassConfig[],
): { preferences?: TeacherPlacementPreference[]; error?: string } {
  const studentById = new Map(students.map((student) => [student.id, student]));
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const preferencesByStudent = new Map<string, Set<string>>();

  for (const request of requests) {
    const student = studentById.get(request.studentId);
    if (!student) continue;
    const teacher = teacherById.get(request.teacherId);
    const targetClassName = teacher?.allocatedClass?.trim().toLowerCase();
    const targetGrade = getStudentTargetGrade(student);
    const matches = targetConfigs.filter((config) =>
      !!targetClassName &&
      config.name.trim().toLowerCase() === targetClassName &&
      normalizeGradeValue(config.grade) === targetGrade,
    );
    if (matches.length !== 1) {
      return {
        error: `Placement request for ${student.firstName} ${student.lastName} cannot be mapped to exactly one target class. Check the requested teacher's allocated class.`,
      };
    }

    const classes = preferencesByStudent.get(student.id) ?? new Set<string>();
    classes.add(matches[0].id);
    preferencesByStudent.set(student.id, classes);
  }

  return {
    preferences: Array.from(preferencesByStudent, ([studentId, classIds]) =>
      Array.from(classIds, (classId) => ({ studentId, classId })),
    ).flat(),
  };
}
