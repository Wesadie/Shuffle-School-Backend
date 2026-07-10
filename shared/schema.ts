import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, index, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const DEVELOPMENT_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const developmentAccountSql = sql`'00000000-0000-4000-8000-000000000001'::uuid`;

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Multi-school SaaS account model
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  type: text("type").notNull().default("school"),
  status: text("status").notNull().default("trialing"),
  workspaceMode: text("workspace_mode").notNull().default("demo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountMemberships = pgTable(
  "account_memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("staff"),
    status: text("status").notNull().default("active"),
    invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("account_memberships_account_user_unique").on(table.accountId, table.userId)],
);

export const accountSubscriptions = pgTable("account_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("trialing"),
  planType: text("plan_type"),
  licensedLearnerCount: integer("licensed_learner_count"),
  licenseStartedAt: timestamp("license_started_at", { withTimezone: true }),
  licenseEndsAt: timestamp("license_ends_at", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStartedAt: timestamp("current_period_started_at", { withTimezone: true }),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
  paymentProvider: text("payment_provider"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  providerPriceId: text("provider_price_id"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountPaymentTransactions = pgTable(
  "account_payment_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    transactionType: text("transaction_type").notNull(),
    paymentStatus: text("payment_status").notNull(),
    learnerQuantity: integer("learner_quantity").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentProvider: text("payment_provider"),
    providerPaymentId: text("provider_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("account_payment_transactions_account_id_idx").on(table.accountId)],
);

export const accountUsage = pgTable("account_usage", {
  accountId: uuid("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  successfulSolverGenerations: integer("successful_solver_generations").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type AccountMembership = typeof accountMemberships.$inferSelect;
export type InsertAccountMembership = typeof accountMemberships.$inferInsert;
export type AccountSubscription = typeof accountSubscriptions.$inferSelect;
export type InsertAccountSubscription = typeof accountSubscriptions.$inferInsert;
export type AccountPaymentTransaction = typeof accountPaymentTransactions.$inferSelect;
export type InsertAccountPaymentTransaction = typeof accountPaymentTransactions.$inferInsert;
export type AccountUsage = typeof accountUsage.$inferSelect;
export type InsertAccountUsage = typeof accountUsage.$inferInsert;

// Short-lived, single-use cross-domain auth handoff codes
export const authHandoffs = pgTable("auth_handoffs", {
  code: text("code").primaryKey(),
  userId: uuid("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Student model
export const students = pgTable("students", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  studentId: text("student_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  grade: text("grade").notNull(),
  currentClass: text("current_class"),
  gender: text("gender"),
  characteristics: jsonb("characteristics").$type<Record<string, string | string[]>>().default({}),
  notes: text("notes"),
  parentRequests: text("parent_requests"),
  parentNotes: text("parent_notes"),
  isNew: boolean("is_new").default(false),
  isLeaving: boolean("is_leaving").default(false),
}, (table) => [index("students_account_id_idx").on(table.accountId)]);

export const insertStudentSchema = createInsertSchema(students).omit({ id: true, accountId: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof students.$inferSelect;

// Rule model (pairing/separation)
export const rules = pgTable("rules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "pair" or "separate"
  studentId1: varchar("student_id_1", { length: 36 }).notNull(),
  studentId2: varchar("student_id_2", { length: 36 }).notNull(),
  reason: text("reason"),
}, (table) => [index("rules_account_id_idx").on(table.accountId)]);

export const insertRuleSchema = createInsertSchema(rules).omit({ id: true, accountId: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rules.$inferSelect;

export interface CharacteristicResponse {
  id: string;
  name: string;
  color: string;
  description?: string;
  sortOrder: number;
}

// Characteristic definition model
export const characteristics = pgTable("characteristics", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "category", "scale", or "percentage"
  options: jsonb("options").$type<string[]>().default([]),
  responseConfig: jsonb("response_config").$type<CharacteristicResponse[]>().default([]),
  priority: integer("priority").default(1),
  tagOnly: boolean("tag_only").default(false),
  multiSelect: boolean("multi_select").default(false),
  adminOnly: boolean("admin_only").default(false),
  applyToAllGrades: boolean("apply_to_all_grades").default(true),
  applicableGrades: jsonb("applicable_grades").$type<string[]>().default([]),
}, (table) => [index("characteristics_account_id_idx").on(table.accountId)]);

export const insertCharacteristicSchema = createInsertSchema(characteristics).omit({ id: true, accountId: true });
export type InsertCharacteristic = z.infer<typeof insertCharacteristicSchema>;
export type Characteristic = typeof characteristics.$inferSelect;

// Class configuration
export const classConfigs = pgTable("class_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grade: text("grade").notNull(),
  capacity: integer("capacity").default(30),
}, (table) => [index("class_configs_account_id_idx").on(table.accountId)]);

export const insertClassConfigSchema = createInsertSchema(classConfigs).omit({ id: true, accountId: true });
export type InsertClassConfig = z.infer<typeof insertClassConfigSchema>;
export type ClassConfig = typeof classConfigs.$inferSelect;

// Generated class placements
export const placements = pgTable("placements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 36 }).notNull(),
  classId: varchar("class_id", { length: 36 }).notNull(),
  locked: boolean("locked").default(false),
}, (table) => [index("placements_account_id_idx").on(table.accountId)]);

export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true, accountId: true });
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;
export type Placement = typeof placements.$inferSelect;

// Teacher model
export const teachers = pgTable("teachers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  currentClass: text("current_class"),
  allocatedClass: text("allocated_class"),
  surveyStatus: text("survey_status").default("Not Sent"),
  surveyDate: text("survey_date"),
}, (table) => [index("teachers_account_id_idx").on(table.accountId)]);

export const insertTeacherSchema = createInsertSchema(teachers).omit({ id: true, accountId: true });
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type Teacher = typeof teachers.$inferSelect;

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

// Teacher surveys for student characteristic ratings and pairing recommendations
export const surveys = pgTable("surveys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  teacherName: text("teacher_name").notNull(),
  studentId: varchar("student_id", { length: 36 }).notNull(),
  characteristicRatings: jsonb("characteristic_ratings").$type<Record<string, string>>().default({}),
  pairWith: jsonb("pair_with").$type<string[]>().default([]),
  separateFrom: jsonb("separate_from").$type<string[]>().default([]),
  notes: text("notes"),
  submittedAt: text("submitted_at").notNull(),
}, (table) => [index("surveys_account_id_idx").on(table.accountId)]);

export const insertSurveySchema = createInsertSchema(surveys).omit({ id: true, accountId: true });
export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveys.$inferSelect;

// Scenarios for saving and comparing placement snapshots
export const scenarios = pgTable("scenarios", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  placements: jsonb("placements").$type<{ studentId: string; classId: string }[]>().default([]),
  balanceMetrics: jsonb("balance_metrics").$type<{
    overallBalance: number;
    classBalances: { classId: string; className: string; balance: number }[];
  }>().default({ overallBalance: 0, classBalances: [] }),
}, (table) => [index("scenarios_account_id_idx").on(table.accountId)]);

export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true, accountId: true });
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenarios.$inferSelect;

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// App settings for survey configuration
export const appSettings = pgTable("app_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: uuid("account_id").notNull().default(developmentAccountSql).references(() => accounts.id, { onDelete: "cascade" }),
  maxFriendNominations: integer("max_friend_nominations").default(1),
  allowTeacherStudentRequests: boolean("allow_teacher_student_requests").default(true),
  allowTeacherTeacherRequests: boolean("allow_teacher_teacher_requests").default(true),
}, (table) => [index("app_settings_account_id_idx").on(table.accountId)]);

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ id: true, accountId: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
