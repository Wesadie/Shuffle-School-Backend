import type { Student } from "./schema";

export const normalizeGradeValue = (grade?: string | null) =>
  (grade || "").replace(/^grade\s+/i, "").trim();

export const getNextGrade = (grade?: string | null) => {
  const normalized = normalizeGradeValue(grade);
  if (normalized.toLowerCase() === "r") return "1";
  if (!/^\d+$/.test(normalized)) return "";
  return String(Number(normalized) + 1);
};

const getExplicitNewGrade = (student: Pick<Student, "characteristics">) => {
  const stored = (student.characteristics as Record<string, string | string[]> | null)?.newGrade;
  return Array.isArray(stored) ? stored.find((value) => value.trim()) : stored;
};

export const isIncomingGradeRAwaitingAllocation = (
  student: Pick<Student, "grade" | "currentClass" | "characteristics">,
) => normalizeGradeValue(student.grade).toLowerCase() === "r"
  && !student.currentClass?.trim()
  && !getExplicitNewGrade(student)?.trim();

export const getStudentTargetGrade = (
  student: Pick<Student, "grade" | "currentClass" | "characteristics">,
): string => {
  const explicitNewGrade = getExplicitNewGrade(student);
  if (explicitNewGrade?.trim()) return normalizeGradeValue(explicitNewGrade);
  if (isIncomingGradeRAwaitingAllocation(student)) return "";
  return getNextGrade(student.grade);
};
