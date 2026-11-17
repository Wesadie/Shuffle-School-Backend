import { z } from "zod";

export const learnerFields = {
  studentId: "Student ID", firstName: "First Name", lastName: "Last Name", gender: "Gender",
  grade: "Current Grade", currentClass: "Current Class", newGrade: "New Grade", isNew: "New Student",
  notes: "Notes", parentRequests: "Parent Requests", parentNotes: "Parent Notes", isLeaving: "Leaving Student",
} as const;

export const normalizeHeading = (value: string) => value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\s-]+/g, "");
const aliases: Record<string, string[]> = {
  studentId: ["id", "learner id", "student number", "admission number"],
  firstName: ["first", "given name", "name"], lastName: ["last", "surname", "family name"],
  gender: ["sex"], grade: ["grade", "grade level", "year"], currentClass: ["class"],
  newGrade: ["next grade"], isNew: ["is new", "incoming student"], isLeaving: ["is leaving"],
};

export const importColumnSchema = z.object({
  heading: z.string(), target: z.string().trim(),
  kind: z.enum(["field", "characteristic", "ignore", "unmapped"]),
  create: z.boolean().optional(), type: z.enum(["category", "scale", "percentage"]).optional(),
}).strict();
export const learnerImportSchema = z.object({
  mode: z.enum(["add", "update"]).default("add"),
  columns: z.array(importColumnSchema).min(1).max(100),
  rows: z.array(z.array(z.string())).min(1).max(10000),
  preview: z.boolean().optional(),
  reviewedRevision: z.string().optional(),
}).strict();
export type ImportColumn = z.infer<typeof importColumnSchema>;
export type LearnerImportInput = z.infer<typeof learnerImportSchema>;
export interface ImportReview {
  revision?: string;
  count: number;
  errors: string[];
  warnings: string[];
  rows: { row: number; studentId: string; status: "ready" | "skipped" | "error"; explanation: string }[];
  newCharacteristics: string[];
}

export function columnMappingLabel(column: ImportColumn): string {
  if (column.kind === "ignore") return "Ignored — not imported";
  if (column.kind === "unmapped") return "Unmapped — choose a destination";
  if (column.kind === "field") return learnerFields[column.target as keyof typeof learnerFields] || column.target;
  return `${column.target || "Unnamed characteristic"}${column.create ? " (new)" : ""}`;
}

export function columnMappingErrors(columns: ImportColumn[], mode: "add" | "update"): string[] {
  const errors: string[] = [], targets = new Set<string>();
  columns.forEach((column, index) => {
    if (column.kind === "ignore") return;
    if (column.kind === "unmapped" || !column.target.trim()) {
      errors.push(`Column ${index + 1} (${column.heading || "no heading"}) is unmapped. Choose a destination or explicitly ignore it.`);
      return;
    }
    const key = `${column.kind}:${normalizeHeading(column.target)}`;
    if (targets.has(key)) errors.push(`Multiple columns map to ${column.target}. Resolve the duplicate mapping.`);
    targets.add(key);
    if (column.kind === "field" && !Object.prototype.hasOwnProperty.call(learnerFields, column.target)) errors.push(`Unknown learner field: ${column.target}.`);
    if (column.kind === "characteristic" && column.create && !column.type) errors.push(`Choose a characteristic type for ${column.target}.`);
  });
  const required = mode === "update" ? ["studentId"] : ["studentId", "firstName", "lastName", "gender", "grade"];
  for (const field of required) {
    if (!columns.some((c) => c.kind === "field" && c.target === field)) errors.push(`Missing required column: ${learnerFields[field as keyof typeof learnerFields]}.`);
  }
  if (mode === "update" && !columns.some((c) => c.kind === "characteristic")) errors.push("Include at least one characteristic or mark column to update.");
  return errors;
}

export function characteristicImportError(value: string, type?: string): string | null {
  if (!value.trim() || (type !== "scale" && type !== "percentage")) return null;
  const numericText = type === "percentage" ? value.trim().replace(/%$/, "").trim() : value.trim();
  const numeric = Number(numericText);
  if (!numericText || !Number.isFinite(numeric)) return "must be numeric";
  if (type === "percentage" && (numeric < 0 || numeric > 100)) return "must be between 0 and 100";
  return null;
}

export function recognizeColumn(heading: string, characteristics: { name: string; type: string }[]): ImportColumn {
  const normalized = normalizeHeading(heading);
  if (!normalized) return { heading, target: "", kind: "unmapped" };
  for (const [key, label] of Object.entries(learnerFields)) {
    if ([key, label, ...(aliases[key] || [])].some((alias) => normalizeHeading(alias) === normalized)) {
      return { heading, target: key, kind: "field" };
    }
  }
  const existing = characteristics.find((item) => normalizeHeading(item.name) === normalized);
  if (existing) return { heading, target: existing.name, kind: "characteristic" };
  const name = normalized === "previousschool" ? "Previous School" : normalized === "race" ? "Race"
    : normalized === "aggregate" ? "Aggregate" : heading.trim();
  return {
    heading, target: name, kind: "characteristic", create: true,
    type: heading.includes("%") || /percentage|percent/i.test(heading) ? "percentage" : normalized === "aggregate" ? "scale" : "category",
  };
}

// Preserve every physical CSV row, including blank rows, for an explicit review outcome.
export function parseLearnerCsv(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((delimiter) => {
    let quoted = false;
    let count = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') {
        if (quoted && firstLine[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && firstLine[i] === delimiter) count++;
    }
    return { delimiter, count };
  });
  const delimiter = counts.sort((a, b) => b.count - a.count)[0].delimiter;
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, ended = false, closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    ended = false;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted) { quoted = false; closedQuote = true; }
      else if (!value.trim() && !closedQuote) quoted = true;
      else throw new Error(`CSV row ${rows.length + 1}: unexpected quote. Use doubled quotes inside quoted values.`);
    } else if (char === delimiter && !quoted) { row.push(value); value = ""; closedQuote = false; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value); rows.push(row); row = []; value = ""; ended = true; closedQuote = false;
    } else {
      if (closedQuote && char.trim()) throw new Error(`CSV row ${rows.length + 1}: unexpected text after a quoted value.`);
      value += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  if (!ended || row.length || value) { row.push(value); rows.push(row); }
  return rows;
}
