import type { Student } from "./schema";

export const normalizeGradeValue = (grade?: string | null) =>
  (grade || "").replace(/^grade\s+/i, "").trim();

export const getStudentTargetGrade = (
  student: Pick<Student, "grade" | "characteristics">,
): string => {
  const storedNewGrade = (student.characteristics as Record<string, string | string[]> | null)?.newGrade;
  const explicitNewGrade = Array.isArray(storedNewGrade)
    ? storedNewGrade.find((value) => value.trim())
    : storedNewGrade;

  if (explicitNewGrade?.trim()) return normalizeGradeValue(explicitNewGrade);

  const currentGrade = normalizeGradeValue(student.grade);
  return /^\d+$/.test(currentGrade) ? String(Number(currentGrade) + 1) : "";
};
