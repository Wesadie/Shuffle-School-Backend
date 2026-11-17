import { insertStudentSchema, type Student, type Characteristic, type InsertStudent, type InsertCharacteristic } from "@shared/schema";
import { learnerFields, learnerImportSchema, normalizeHeading, columnMappingErrors, characteristicImportError, type ImportReview } from "@shared/learner-import";
import { defaultResponseColor, getStableResponseId, normalizeResponses } from "@shared/characteristics";
import { importedStudentIsNew, importedStudentNewGrade, partitionStudentImportRows } from "./studentImport";
import { createHash } from "node:crypto";

export interface LearnerImportPlan {
  review: ImportReview;
  inserts: InsertStudent[];
  updates: { id: string; characteristics: Record<string, string> }[];
  createCharacteristics: InsertCharacteristic[];
  updateCharacteristics: { id: string; data: Partial<InsertCharacteristic> }[];
}
const unsafeNames = new Set(["__proto__", "prototype", "constructor", "newGrade"]);

export function buildLearnerImportPlan(body: unknown, students: Student[], characteristics: Characteristic[]): LearnerImportPlan {
  const input = learnerImportSchema.parse(body);
  const revision = createHash("sha256").update(JSON.stringify({
    mode: input.mode, columns: input.columns, rows: input.rows,
    students: [...students].sort((a, b) => a.id.localeCompare(b.id)),
    characteristics: [...characteristics].sort((a, b) => a.id.localeCompare(b.id)),
  })).digest("hex");
  const review: ImportReview = { revision, count: 0, errors: [], warnings: [], rows: [], newCharacteristics: [] };
  if (input.reviewedRevision && input.reviewedRevision !== revision) review.errors.push("The roster, characteristics or spreadsheet changed since your preview. Validate and review again; no data was changed.");
  const plan: LearnerImportPlan = { review, inserts: [], updates: [], createCharacteristics: [], updateCharacteristics: [] };
  review.errors.push(...columnMappingErrors(input.columns, input.mode));
  const known = new Map(characteristics.map((c) => [normalizeHeading(c.name), c]));
  const valuesByName = new Map<string, Set<string>>();
  const charColumns = input.columns.filter((c) => c.kind === "characteristic");
  input.columns.forEach((column, index) => {
    if (column.kind === "ignore") {
      const populated = input.rows.filter((cells) => cells[index]?.trim()).length;
      review.warnings.push(`Ignored column ${index + 1} (${column.heading || "no heading"}): ${populated} non-blank values will not be imported. This is an explicit mapping choice.`);
    }
  });
  for (const column of input.columns) {
    if (column.kind === "characteristic") {
      if (unsafeNames.has(column.target) || Object.prototype.hasOwnProperty.call(learnerFields, column.target)) review.errors.push(`Reserved characteristic name: ${column.target}.`);
      const existing = known.get(normalizeHeading(column.target));
      if (existing && existing.name !== column.target) review.errors.push(`Use the saved characteristic name ${existing.name}.`);
      if (!existing && (!column.create || !column.type)) review.errors.push(`Confirm creation and type for ${column.target}.`);
      if (!existing) review.newCharacteristics.push(column.target);
      valuesByName.set(column.target, new Set());
    }
  }
  const required = input.mode === "update" ? ["studentId"] : ["studentId", "firstName", "lastName", "gender", "grade"];
  if (characteristics.length + review.newCharacteristics.length > 50) review.errors.push("A maximum of 50 active characteristics is supported.");
  if (input.mode === "update") {
    review.warnings.push("Only non-blank marks and characteristics will be updated. Blank cells preserve saved values. Learner identity, grades, class placements and teacher allocations remain unchanged.");
    const protectedColumns = input.columns.filter((c) => c.kind === "field" && c.target !== "studentId").map((c) => c.heading);
    if (protectedColumns.length) review.warnings.push(`Read-only columns in update mode (not applied): ${protectedColumns.join(", ")}.`);
  }
  const records = input.rows.map((cells) => Object.fromEntries(input.columns.flatMap((c, i) =>
    c.kind === "field" || c.kind === "characteristic" ? [[c.target, (cells[i] || "").trim()]] : [],
  )));
  const existingPartition = partitionStudentImportRows(records, students);
  if (existingPartition.existingDuplicateStudentIds.length) {
    review.errors.push(`This school's roster has duplicate Student IDs. Resolve these before importing: ${existingPartition.existingDuplicateStudentIds.join(", ")}.`);
  }
  const existingById = new Map(students.filter((s) => s.studentId).map((s) => [s.studentId!.trim().toLowerCase(), s]));
  const seenIds = new Map<string, number>();
  for (let index = 0; index < input.rows.length; index++) {
    const rowNumber = index + 2, cells = input.rows[index], record = records[index];
    const studentId = record.studentId || "", id = studentId.toLowerCase();
    const outcome: ImportReview["rows"][number] = { row: rowNumber, studentId, status: "ready", explanation: input.mode === "add" ? "Add new learner" : "Update non-blank characteristics only" };
    review.rows.push(outcome);
    const errors: string[] = [];
    if (cells.length > input.columns.length) errors.push("More values than column headings; no extra cells may be discarded.");
    if (!cells.some((cell) => cell.trim())) {
      outcome.status = "skipped"; outcome.explanation = "Blank spreadsheet row"; continue;
    }
    for (const field of required) if (!record[field]) errors.push(`${learnerFields[field as keyof typeof learnerFields]} is required`);
    if (record.isNew && !["true", "false", "yes", "no", "1", "0", "y", "n"].includes(record.isNew.toLowerCase()) && input.mode === "add") errors.push("New Student must be yes/no or true/false");
    if (record.isLeaving && !["true", "false", "yes", "no", "1", "0", "y", "n"].includes(record.isLeaving.toLowerCase()) && input.mode === "add") errors.push("Leaving Student must be yes/no or true/false");
    const responses: Record<string, string> = {};
    for (const column of charColumns) {
      let value = record[column.target];
      if (!value) continue;
      const type = known.get(normalizeHeading(column.target))?.type || column.type;
      const valueError = characteristicImportError(value, type);
      if (valueError) errors.push(`${column.target} ${valueError}`);
      else if (type === "scale" || type === "percentage") {
        value = String(Number(type === "percentage" ? value.replace(/%$/, "").trim() : value));
      }
      responses[column.target] = value;
    }
    if (errors.length) {
      outcome.status = "error"; outcome.explanation = errors.join("; ");
      review.errors.push(`Row ${rowNumber}: ${outcome.explanation}.`); continue;
    }
    if (seenIds.has(id)) {
      outcome.status = "skipped"; outcome.explanation = `Duplicate Student ID in upload; first occurrence is row ${seenIds.get(id)}`;
      continue;
    }
    seenIds.set(id, rowNumber);
    const existing = existingById.get(id);
    if (input.mode === "add" && existing) {
      outcome.status = "skipped"; outcome.explanation = "Student ID already exists in this school; use Update Existing Learners"; continue;
    }
    if (input.mode === "update" && !existing) {
      outcome.status = "skipped"; outcome.explanation = "No matching Student ID in this school; use Add New Learners"; continue;
    }
    if (input.mode === "update" && !Object.keys(responses).length) {
      outcome.status = "skipped"; outcome.explanation = "No non-blank marks or characteristics to update"; continue;
    }
    if (input.mode === "add") {
      const incoming = { grade: record.grade, currentClass: record.currentClass, isNew: ["true", "yes", "1", "y"].includes((record.isNew || "").toLowerCase()), newGrade: record.newGrade };
      const parsed = insertStudentSchema.safeParse({
        studentId, firstName: record.firstName, lastName: record.lastName, grade: record.grade,
        currentClass: record.currentClass || null, gender: record.gender, notes: record.notes || null,
        parentRequests: record.parentRequests || null, parentNotes: record.parentNotes || null,
        isNew: importedStudentIsNew(incoming), isLeaving: ["true", "yes", "1", "y"].includes((record.isLeaving || "").toLowerCase()),
        characteristics: { ...responses, ...(importedStudentNewGrade(incoming) !== undefined ? { newGrade: importedStudentNewGrade(incoming)! } : {}) },
      });
      if (!parsed.success) {
        outcome.status = "error"; outcome.explanation = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        review.errors.push(`Row ${rowNumber}: ${outcome.explanation}`); continue;
      }
      plan.inserts.push(parsed.data);
    } else plan.updates.push({ id: existing!.id, characteristics: responses });
    for (const [name, value] of Object.entries(responses)) valuesByName.get(name)!.add(value);
  }
  for (const column of charColumns) {
    const existing = known.get(normalizeHeading(column.target));
    const type = existing?.type || column.type!;
    const responses = existing ? normalizeResponses(existing) : [];
    const names = new Set(responses.map((r) => r.name));
    if (type === "category") for (const value of valuesByName.get(column.target) || []) {
      if (names.has(value)) continue;
      responses.push({ id: getStableResponseId(existing?.id || column.target, value), name: value, color: defaultResponseColor(responses.length), description: "", sortOrder: responses.length + 1 });
      names.add(value);
    }
    const data = { options: responses.map((r) => r.name), responseConfig: responses };
    if (!existing) plan.createCharacteristics.push({ name: column.target, type, priority: 1, ...data });
    else if (type === "category") plan.updateCharacteristics.push({ id: existing.id, data });
  }
  review.count = plan.inserts.length + plan.updates.length;
  return plan;
}
