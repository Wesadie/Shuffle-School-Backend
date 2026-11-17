import type { InsertStudent, Student } from "./schema";
import { normalizeGradeValue } from "./grades";

export interface StudentRosterOptions {
  grades: string[];
  currentClasses: string[];
  genders: string[];
  newGrades: string[];
  totalCount: number;
}

export const normalizeRosterGrade = (grade?: string | null) => normalizeGradeValue(grade?.trim()).toUpperCase();
export const rosterSpecialFilters = new Set(["all", "new", "unallocated", "no-id", "leaving", "duplicates"]);

export function applyStudentPatch(student: Student, patch: Partial<InsertStudent>): Student {
  return { ...student, ...patch, characteristics: patch.characteristics
    ? { ...student.characteristics, ...patch.characteristics }
    : student.characteristics } as Student;
}

// Capture only edited fields so server responses cannot overwrite another pending cell.
export function previousStudentPatch(student: Student, patch: Partial<InsertStudent>): Partial<InsertStudent> {
  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "characteristics") previous.characteristics = Object.fromEntries(
      Object.keys(patch.characteristics || {}).map((name) => [name, student.characteristics?.[name] ?? ""]),
    );
    else previous[key] = student[key as keyof Student];
  }
  return previous as Partial<InsertStudent>;
}

export function rollbackStudentPatch(current: Student, before: Student, patch: Partial<InsertStudent>): Student {
  const restored = applyStudentPatch(current, previousStudentPatch(before, patch));
  if (patch.characteristics) {
    const values = { ...restored.characteristics };
    for (const name of Object.keys(patch.characteristics)) {
      if (!Object.prototype.hasOwnProperty.call(before.characteristics || {}, name)) delete values[name];
    }
    restored.characteristics = before.characteristics === null && !Object.keys(values).length ? null : values;
  }
  return restored;
}

export function updateRosterRows(rows: Student[], before: Student, patch: Partial<InsertStudent>, grade = "all", rollback = false): Student[] {
  if (rows.some((s) => s.accountId !== before.accountId)) return rows;
  const index = rows.findIndex((s) => s.id === before.id);
  if (index < 0 && !("grade" in patch)) return rows;
  const current = index < 0 ? before : rows[index];
  const updated = rollback ? rollbackStudentPatch(current, before, patch) : applyStudentPatch(current, patch);
  if (grade !== "all" && normalizeRosterGrade(updated.grade) !== grade) return index < 0 ? rows : rows.filter((s) => s.id !== before.id);
  if (index < 0) return [...rows, updated];
  return rows.map((s, i) => i === index ? updated : s);
}

export function changedStudentFields(before: Student, draft: Partial<InsertStudent>): Partial<InsertStudent> {
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key === "characteristics") {
      const values = Object.fromEntries(Object.entries(draft.characteristics || {}).filter(([name, next]) =>
        JSON.stringify(before.characteristics?.[name] ?? "") !== JSON.stringify(next),
      ));
      if (Object.keys(values).length) changed.characteristics = values;
    } else if (value !== before[key as keyof Student] && !(value === "" && before[key as keyof Student] == null)) changed[key] = value;
  }
  return changed as Partial<InsertStudent>;
}
