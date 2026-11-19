import { z } from "zod";
import type { ClassConfig, GradeSnapshot, Placement, Student, Teacher } from "@shared/schema";
import { getStudentTargetGrade, normalizeGradeValue } from "@shared/grades";
import { InvalidPlacementError } from "./placementSafety";

const snapshotDataSchema = z.object({
  placements: z.array(z.object({ studentId: z.string().min(1), classId: z.string().min(1) })),
  classConfigs: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), grade: z.string().min(1), capacity: z.number().int().positive() })),
  teacherAllocations: z.array(z.object({ teacherId: z.string().min(1), className: z.string().min(1) })),
});

export interface GradeSnapshotState {
  students: Student[];
  placements: Placement[];
  classConfigs: ClassConfig[];
  teachers: Teacher[];
}

function assertAccountState(accountId: string, state: GradeSnapshotState) {
  const rows = [...state.students, ...state.placements, ...state.classConfigs, ...state.teachers];
  if (!accountId || rows.some((row) => row.accountId !== accountId)) {
    throw new InvalidPlacementError("Snapshot references must belong to the current account");
  }
}

export function captureGradeSnapshot(accountId: string, grade: string, state: GradeSnapshotState) {
  assertAccountState(accountId, state);
  grade = normalizeGradeValue(grade);
  const studentIds = new Set(state.students.filter((student) => getStudentTargetGrade(student) === grade).map((student) => student.id));
  const configs = state.classConfigs.filter((config) => normalizeGradeValue(config.grade) === grade);
  const classIds = new Set(configs.map((config) => config.id));
  const classNames = new Set(configs.map((config) => config.name));
  const gradePlacements = state.placements.filter((placement) => studentIds.has(placement.studentId));
  if (gradePlacements.some((placement) => !classIds.has(placement.classId))) {
    throw new InvalidPlacementError("Grade placements must reference classes in the saved grade");
  }
  return {
    placements: gradePlacements.map(({ studentId, classId }) => ({ studentId, classId })),
    classConfigs: configs.map(({ id, name, grade, capacity }) => ({ id, name, grade, capacity: capacity ?? 30 })),
    teacherAllocations: state.teachers.filter((teacher) => teacher.allocatedClass && classNames.has(teacher.allocatedClass))
      .map((teacher) => ({ teacherId: teacher.id, className: teacher.allocatedClass! })),
  };
}

export function planGradeSnapshotRestore(accountId: string, snapshot: GradeSnapshot, state: GradeSnapshotState) {
  assertAccountState(accountId, state);
  if (snapshot.accountId !== accountId) throw new InvalidPlacementError("Snapshot belongs to another account");
  const parsed = snapshotDataSchema.safeParse(snapshot);
  if (!parsed.success) throw new InvalidPlacementError("Snapshot data is invalid");
  const saved = parsed.data;
  const grade = normalizeGradeValue(snapshot.grade);
  const gradeStudents = new Set(state.students.filter((student) => getStudentTargetGrade(student) === grade).map((student) => student.id));
  const currentConfigs = state.classConfigs.filter((config) => normalizeGradeValue(config.grade) === grade);
  const otherConfigs = state.classConfigs.filter((config) => normalizeGradeValue(config.grade) !== grade);
  const savedClassIds = new Set(saved.classConfigs.map((config) => config.id));
  const savedNames = new Set(saved.classConfigs.map((config) => config.name));
  if (savedClassIds.size !== saved.classConfigs.length || savedNames.size !== saved.classConfigs.length
    || saved.classConfigs.some((config) => normalizeGradeValue(config.grade) !== grade)
    || otherConfigs.some((config) => savedClassIds.has(config.id) || savedNames.has(config.name))) {
    throw new InvalidPlacementError("Snapshot classes conflict with another grade or contain duplicates");
  }
  if (saved.placements.some((placement) => !gradeStudents.has(placement.studentId) || !savedClassIds.has(placement.classId))) {
    throw new InvalidPlacementError("Snapshot learners and classes must belong to the current account and grade");
  }
  const affectedClassIds = new Set([...currentConfigs.map((config) => config.id), ...savedClassIds]);
  if (state.placements.some((placement) => affectedClassIds.has(placement.classId) && !gradeStudents.has(placement.studentId))) {
    throw new InvalidPlacementError("Another grade has placements in the classes being restored");
  }
  const affectedNames = new Set([...currentConfigs.map((config) => config.name), ...savedNames]);
  if (otherConfigs.some((config) => affectedNames.has(config.name))) {
    throw new InvalidPlacementError("Class names must be unambiguous across grades to restore teacher allocations");
  }
  const teacherById = new Map(state.teachers.map((teacher) => [teacher.id, teacher]));
  const savedTeacherIds = new Set(saved.teacherAllocations.map((allocation) => allocation.teacherId));
  if (savedTeacherIds.size !== saved.teacherAllocations.length || saved.teacherAllocations.some((allocation) => {
    const teacher = teacherById.get(allocation.teacherId);
    return !teacher || !savedNames.has(allocation.className)
      || (teacher.allocatedClass && !affectedNames.has(teacher.allocatedClass));
  })) {
    throw new InvalidPlacementError("Snapshot teachers must belong to this account and cannot be reassigned from another grade");
  }
  const allocations = new Map(saved.teacherAllocations.map((allocation) => [allocation.teacherId, allocation.className]));
  return {
    classConfigs: [...otherConfigs, ...saved.classConfigs.map((config) => ({ ...config, accountId }))],
    placements: [...state.placements.filter((placement) => !gradeStudents.has(placement.studentId)), ...saved.placements],
    studentIds: [...gradeStudents],
    removedClassIds: currentConfigs.filter((config) => !savedClassIds.has(config.id)).map((config) => config.id),
    savedClassConfigs: saved.classConfigs,
    savedPlacements: saved.placements,
    teacherUpdates: state.teachers.filter((teacher) => allocations.has(teacher.id) || (teacher.allocatedClass && affectedNames.has(teacher.allocatedClass)))
      .map((teacher) => ({ id: teacher.id, allocatedClass: allocations.get(teacher.id) ?? null })),
  };
}
