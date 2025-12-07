import { pgTable, text, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Student model
export const students = pgTable("students", {
  id: varchar("id", { length: 36 }).primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  grade: text("grade").notNull(),
  currentClass: text("current_class"),
  gender: text("gender"),
  characteristics: jsonb("characteristics").$type<Record<string, string>>().default({}),
  notes: text("notes"),
  parentRequests: text("parent_requests"),
  parentNotes: text("parent_notes"),
});

export const insertStudentSchema = createInsertSchema(students).omit({ id: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof students.$inferSelect;

// Rule model (pairing/separation)
export const rules = pgTable("rules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: text("type").notNull(), // "pair" or "separate"
  studentId1: varchar("student_id_1", { length: 36 }).notNull(),
  studentId2: varchar("student_id_2", { length: 36 }).notNull(),
  reason: text("reason"),
});

export const insertRuleSchema = createInsertSchema(rules).omit({ id: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rules.$inferSelect;

// Characteristic definition model
export const characteristics = pgTable("characteristics", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "category" or "scale"
  options: jsonb("options").$type<string[]>().default([]),
  priority: integer("priority").default(1),
});

export const insertCharacteristicSchema = createInsertSchema(characteristics).omit({ id: true });
export type InsertCharacteristic = z.infer<typeof insertCharacteristicSchema>;
export type Characteristic = typeof characteristics.$inferSelect;

// Class configuration
export const classConfigs = pgTable("class_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  grade: text("grade").notNull(),
  capacity: integer("capacity").default(30),
});

export const insertClassConfigSchema = createInsertSchema(classConfigs).omit({ id: true });
export type InsertClassConfig = z.infer<typeof insertClassConfigSchema>;
export type ClassConfig = typeof classConfigs.$inferSelect;

// Generated class placements
export const placements = pgTable("placements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  studentId: varchar("student_id", { length: 36 }).notNull(),
  classId: varchar("class_id", { length: 36 }).notNull(),
  locked: boolean("locked").default(false),
});

export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true });
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;
export type Placement = typeof placements.$inferSelect;

// Frontend types for class generation result
export interface GeneratedClass {
  classConfig: ClassConfig;
  students: Student[];
  balanceScores: Record<string, number>;
}

export interface ClassGenerationResult {
  classes: GeneratedClass[];
  overallBalance: number;
  conflicts: ConflictWarning[];
}

export interface ConflictWarning {
  type: "separation" | "pairing" | "capacity";
  message: string;
  studentIds: string[];
  ruleId?: string;
}

export interface BalanceMetric {
  characteristicId: string;
  name: string;
  distribution: { className: string; values: Record<string, number> }[];
  score: number;
}

export interface BoostSuggestion {
  id: string;
  type: "swap";
  student1: {
    id: string;
    name: string;
    currentClass: string;
    currentClassId: string;
  };
  student2: {
    id: string;
    name: string;
    currentClass: string;
    currentClassId: string;
  };
  improvement: number;
  reason: string;
}

export interface BoostResponse {
  currentBalance: number;
  suggestions: BoostSuggestion[];
}

// Keep legacy user for compatibility
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
