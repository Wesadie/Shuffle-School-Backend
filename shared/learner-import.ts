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
  heading: z.string(), target: z.string().trim().min(1),
  kind: z.enum(["field", "characteristic"]),
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

export function recognizeColumn(heading: string, characteristics: { name: string; type: string }[]): ImportColumn {
  const normalized = normalizeHeading(heading);
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
