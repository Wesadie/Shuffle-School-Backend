import {
  type User,
  type UpsertUser,
  type Student,
  type InsertStudent,
  type Rule,
  type InsertRule,
  type Characteristic,
  type InsertCharacteristic,
  type CharacteristicResponse,
  type ClassConfig,
  type InsertClassConfig,
  type Placement,
  type InsertPlacement,
  type Teacher,
  type InsertTeacher,
  type PlacementRequest,
  type InsertPlacementRequest,
  type Profile,
  type AccountMembership,
  type InsertAccountMembership,
  type AccountBillingDetails,
  type InsertAccountBillingDetails,
  type Survey,
  type InsertSurvey,
  type Scenario,
  type InsertScenario,
  type AppSettings,
  type InsertAppSettings,
  students,
  rules,
  characteristics,
  classConfigs,
  placements,
  teachers,
  placementRequests,
  profiles,
  accountMemberships,
  accountBillingDetails,
  surveys,
  scenarios,
  users,
  appSettings,
  accounts,
} from "@shared/schema";
import { db, pool } from "./db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildSwapPlacements, PlacementNotFoundError, runRevisionedMutation, validatePlacements } from "./placementSafety";

type StorageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CharacteristicSettingsInput {
  id?: string;
  name: string;
  type: "category" | "scale" | "percentage";
  priority: number;
  options: string[];
  responseConfig: CharacteristicResponse[];
  tagOnly: boolean;
  multiSelect: boolean;
  adminOnly: boolean;
  applyToAllGrades: boolean;
  applicableGrades: string[];
}

function requireAccountId(accountId: string): string {
  if (!accountId) {
    throw new Error("Account ID is required for school-owned storage operations");
  }
  return accountId;
}

export class DatabaseStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({ target: users.id, set: { ...userData, updatedAt: new Date() } })
      .returning();
    return user;
  }

  async getStudents(accountId: string): Promise<Student[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(students).where(eq(students.accountId, accountId));
  }

  async getStudent(accountId: string, id: string): Promise<Student | undefined> {
    accountId = requireAccountId(accountId);
    const [student] = await db.select().from(students).where(and(eq(students.accountId, accountId), eq(students.id, id)));
    return student || undefined;
  }

  async createStudent(accountId: string, insertStudent: InsertStudent): Promise<Student> {
    accountId = requireAccountId(accountId);
    const [student] = await db.insert(students).values({
      id: randomUUID(), accountId, studentId: insertStudent.studentId ?? null,
      firstName: insertStudent.firstName, lastName: insertStudent.lastName, grade: insertStudent.grade,
      currentClass: insertStudent.currentClass ?? null, gender: insertStudent.gender ?? null,
      characteristics: insertStudent.characteristics ?? {}, notes: insertStudent.notes ?? null,
      parentRequests: insertStudent.parentRequests ?? null, parentNotes: insertStudent.parentNotes ?? null,
      isNew: insertStudent.isNew ?? false, isLeaving: insertStudent.isLeaving ?? false,
    }).returning();
    return student;
  }

  async updateStudent(accountId: string, id: string, updates: Partial<InsertStudent>): Promise<Student | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db.update(students).set(updates).where(and(eq(students.accountId, accountId), eq(students.id, id))).returning();
    return updated || undefined;
  }

  async deleteStudent(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(students).where(and(eq(students.accountId, accountId), eq(students.id, id))).returning();
    return result.length > 0;
  }

  async bulkImportStudents(accountId: string, studentList: InsertStudent[]): Promise<{ count: number }> {
    accountId = requireAccountId(accountId);
    let count = 0;
    for (const student of studentList) {
      await this.createStudent(accountId, student);
      count++;
    }
    return { count };
  }

  async deleteAllStudents(accountId: string): Promise<void> {
    accountId = requireAccountId(accountId);
    await db.delete(students).where(eq(students.accountId, accountId));
  }

  async getRules(accountId: string): Promise<Rule[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(rules).where(eq(rules.accountId, accountId));
  }

  async getRule(accountId: string, id: string): Promise<Rule | undefined> {
    accountId = requireAccountId(accountId);
    const [rule] = await db.select().from(rules).where(and(eq(rules.accountId, accountId), eq(rules.id, id)));
    return rule || undefined;
  }

  async createRule(accountId: string, insertRule: InsertRule): Promise<Rule> {
    accountId = requireAccountId(accountId);
    const studentIds = [insertRule.studentId1, insertRule.studentId2];
    const linkedStudents = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), inArray(students.id, studentIds)));
    if (linkedStudents.length !== 2) throw new Error("Rule students must belong to the current account");
    const [rule] = await db.insert(rules).values({ id: randomUUID(), accountId, ...insertRule, reason: insertRule.reason ?? null }).returning();
    return rule;
  }

  async updateRule(accountId: string, id: string, updates: Partial<InsertRule>): Promise<Rule | undefined> {
    accountId = requireAccountId(accountId);
    if (updates.studentId1 || updates.studentId2) {
      const existing = await this.getRule(accountId, id);
      if (!existing) return undefined;
      const studentIds = [updates.studentId1 ?? existing.studentId1, updates.studentId2 ?? existing.studentId2];
      const linkedStudents = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), inArray(students.id, studentIds)));
      if (linkedStudents.length !== 2) throw new Error("Rule students must belong to the current account");
    }
    const [updated] = await db.update(rules).set(updates).where(and(eq(rules.accountId, accountId), eq(rules.id, id))).returning();
    return updated || undefined;
  }

  async deleteRule(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(rules).where(and(eq(rules.accountId, accountId), eq(rules.id, id))).returning();
    return result.length > 0;
  }

  async getPlacementRequests(accountId: string): Promise<PlacementRequest[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(placementRequests).where(eq(placementRequests.accountId, accountId));
  }

  async createPlacementRequest(accountId: string, insertRequest: InsertPlacementRequest): Promise<PlacementRequest> {
    accountId = requireAccountId(accountId);
    const [linkedStudent] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.accountId, accountId), eq(students.id, insertRequest.studentId)));
    const teacherIds = Array.from(new Set([insertRequest.teacherId, insertRequest.requestedByTeacherId]));
    const linkedTeachers = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(and(eq(teachers.accountId, accountId), inArray(teachers.id, teacherIds)));
    if (!linkedStudent || linkedTeachers.length !== teacherIds.length) {
      throw new Error("Placement request must reference learners and teachers of the current account");
    }
    const [request] = await db
      .insert(placementRequests)
      .values({ id: randomUUID(), accountId, ...insertRequest })
      .returning();
    return request;
  }

  async updatePlacementRequest(
    accountId: string,
    id: string,
    updates: Partial<InsertPlacementRequest>,
  ): Promise<PlacementRequest | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db
      .update(placementRequests)
      .set(updates)
      .where(and(eq(placementRequests.accountId, accountId), eq(placementRequests.id, id)))
      .returning();
    return updated || undefined;
  }

  async deletePlacementRequest(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db
      .delete(placementRequests)
      .where(and(eq(placementRequests.accountId, accountId), eq(placementRequests.id, id)))
      .returning();
    return result.length > 0;
  }

  // ---- Administrator management (reuses account memberships + profiles) ----

  async getAccountMembershipsWithProfiles(
    accountId: string,
  ): Promise<Array<AccountMembership & { email: string | null; firstName: string | null; lastName: string | null }>> {
    accountId = requireAccountId(accountId);
    return await db
      .select({
        id: accountMemberships.id,
        accountId: accountMemberships.accountId,
        userId: accountMemberships.userId,
        role: accountMemberships.role,
        status: accountMemberships.status,
        invitedBy: accountMemberships.invitedBy,
        invitedAt: accountMemberships.invitedAt,
        acceptedAt: accountMemberships.acceptedAt,
        createdAt: accountMemberships.createdAt,
        updatedAt: accountMemberships.updatedAt,
        email: profiles.email,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
      })
      .from(accountMemberships)
      .leftJoin(profiles, eq(accountMemberships.userId, profiles.id))
      .where(eq(accountMemberships.accountId, accountId));
  }

  async findProfileByEmail(email: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(sql`lower(${profiles.email}) = lower(${email})`)
      .limit(1);
    return profile ?? undefined;
  }

  async upsertProfile(input: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<Profile> {
    const [profile] = await db
      .insert(profiles)
      .values({
        id: input.id,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: input.email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  }

  async updateProfileEmail(userId: string, email: string): Promise<void> {
    await db.update(profiles).set({ email, updatedAt: new Date() }).where(eq(profiles.id, userId));
  }

  async createAccountMembership(
    accountId: string,
    input: { userId: string; role: string; status: string; invitedBy?: string | null; invitedAt?: Date | null; acceptedAt?: Date | null },
  ): Promise<AccountMembership> {
    accountId = requireAccountId(accountId);
    const [membership] = await db
      .insert(accountMemberships)
      .values({ accountId, ...input })
      .returning();
    return membership;
  }

  async updateAccountMembership(
    accountId: string,
    id: string,
    updates: Partial<InsertAccountMembership>,
  ): Promise<AccountMembership | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db
      .update(accountMemberships)
      .set(updates)
      .where(and(eq(accountMemberships.accountId, accountId), eq(accountMemberships.id, id)))
      .returning();
    return updated || undefined;
  }

  async deleteAccountMembership(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db
      .delete(accountMemberships)
      .where(and(eq(accountMemberships.accountId, accountId), eq(accountMemberships.id, id)))
      .returning();
    return result.length > 0;
  }

  // ---- Account billing details (customer "bill to" record) ----

  async getAccountBillingDetails(accountId: string): Promise<AccountBillingDetails | undefined> {
    accountId = requireAccountId(accountId);
    const [row] = await db
      .select()
      .from(accountBillingDetails)
      .where(eq(accountBillingDetails.accountId, accountId));
    return row || undefined;
  }

  /** Backfill billing details from signup; never overwrites an existing row. */
  async insertAccountBillingDetailsIfAbsent(
    accountId: string,
    values: Omit<InsertAccountBillingDetails, "accountId">,
  ): Promise<AccountBillingDetails | undefined> {
    accountId = requireAccountId(accountId);
    const inserted = await db
      .insert(accountBillingDetails)
      .values({ ...values, accountId })
      .onConflictDoNothing({ target: accountBillingDetails.accountId })
      .returning();
    return inserted[0] || undefined;
  }

  async saveAccountBillingDetails(
    accountId: string,
    values: Omit<InsertAccountBillingDetails, "accountId">,
  ): Promise<AccountBillingDetails> {
    accountId = requireAccountId(accountId);
    const [row] = await db
      .insert(accountBillingDetails)
      .values({ ...values, accountId })
      .onConflictDoUpdate({
        target: accountBillingDetails.accountId,
        set: {
          billingName: values.billingName,
          organisationName: values.organisationName,
          addressLine1: values.addressLine1,
          addressLine2: values.addressLine2,
          city: values.city,
          province: values.province,
          postalCode: values.postalCode,
          country: values.country,
          billingEmail: values.billingEmail,
          phone: values.phone,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getCharacteristics(accountId: string): Promise<Characteristic[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(characteristics).where(eq(characteristics.accountId, accountId));
  }

  async getCharacteristic(accountId: string, id: string): Promise<Characteristic | undefined> {
    accountId = requireAccountId(accountId);
    const [char] = await db.select().from(characteristics).where(and(eq(characteristics.accountId, accountId), eq(characteristics.id, id)));
    return char || undefined;
  }

  async createCharacteristic(accountId: string, insertChar: InsertCharacteristic): Promise<Characteristic> {
    accountId = requireAccountId(accountId);
    const [char] = await db.insert(characteristics).values({
      id: randomUUID(), accountId, name: insertChar.name, type: insertChar.type,
      options: insertChar.options ?? [], responseConfig: insertChar.responseConfig ?? [], priority: insertChar.priority ?? 1,
      tagOnly: insertChar.tagOnly ?? false, multiSelect: insertChar.multiSelect ?? false, adminOnly: insertChar.adminOnly ?? false,
      applyToAllGrades: insertChar.applyToAllGrades ?? true, applicableGrades: insertChar.applicableGrades ?? [],
    }).returning();
    return char;
  }

  async updateCharacteristic(accountId: string, id: string, updates: Partial<InsertCharacteristic>): Promise<Characteristic | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db.update(characteristics).set(updates).where(and(eq(characteristics.accountId, accountId), eq(characteristics.id, id))).returning();
    return updated || undefined;
  }

  async deleteCharacteristic(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(characteristics).where(and(eq(characteristics.accountId, accountId), eq(characteristics.id, id))).returning();
    return result.length > 0;
  }

  async saveCharacteristicSettings(accountId: string, nextCharacteristics: CharacteristicSettingsInput[]): Promise<Characteristic[]> {
    accountId = requireAccountId(accountId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<{ id: string; name: string }>("SELECT id, name FROM characteristics WHERE account_id = $1", [accountId]);
      const existingById = new Map(existingResult.rows.map((row) => [row.id, row]));
      const nextIds = new Set(nextCharacteristics.map((char) => char.id).filter((id): id is string => Boolean(id)));
      for (const char of nextCharacteristics) {
        const existing = char.id ? existingById.get(char.id) : undefined;
        const id = char.id || randomUUID();
        const responseConfig = char.type === "category" ? char.responseConfig : [];
        const options = char.type === "category" ? responseConfig.map((response) => response.name) : [];
        if (existing && existing.name !== char.name) {
          const conflicts = await client.query("SELECT id FROM students WHERE account_id = $1 AND characteristics ? $2 AND characteristics ? $3 LIMIT 1", [accountId, existing.name, char.name]);
          if (conflicts.rowCount && conflicts.rowCount > 0) throw new Error(`Cannot rename \"${existing.name}\" to \"${char.name}\" because at least one student already has both characteristic keys.`);
          await client.query(`UPDATE students SET characteristics = (characteristics - $2) || jsonb_build_object($3, characteristics -> $2) WHERE account_id = $1 AND characteristics ? $2 AND NOT (characteristics ? $3)`, [accountId, existing.name, char.name]);
        }
        if (existing) {
          await client.query(`UPDATE characteristics SET name = $3, type = $4, options = $5::jsonb, response_config = $6::jsonb, priority = $7, tag_only = $8, multi_select = $9, admin_only = $10, apply_to_all_grades = $11, applicable_grades = $12::jsonb WHERE account_id = $1 AND id = $2`, [accountId, id, char.name, char.type, JSON.stringify(options), JSON.stringify(responseConfig), char.priority, char.tagOnly, char.multiSelect, char.adminOnly, char.applyToAllGrades, JSON.stringify(char.applicableGrades)]);
        } else {
          await client.query(`INSERT INTO characteristics (id, account_id, name, type, options, response_config, priority, tag_only, multi_select, admin_only, apply_to_all_grades, applicable_grades) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)`, [id, accountId, char.name, char.type, JSON.stringify(options), JSON.stringify(responseConfig), char.priority, char.tagOnly, char.multiSelect, char.adminOnly, char.applyToAllGrades, JSON.stringify(char.applicableGrades)]);
        }
      }
      const idsToDelete = existingResult.rows.map((row) => row.id).filter((id) => !nextIds.has(id));
      for (const id of idsToDelete) await client.query("DELETE FROM characteristics WHERE account_id = $1 AND id = $2", [accountId, id]);
      await client.query("COMMIT");
      return await this.getCharacteristics(accountId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getClassConfigs(accountId: string): Promise<ClassConfig[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(classConfigs).where(eq(classConfigs.accountId, accountId));
  }

  async getClassConfig(accountId: string, id: string): Promise<ClassConfig | undefined> {
    accountId = requireAccountId(accountId);
    const [config] = await db.select().from(classConfigs).where(and(eq(classConfigs.accountId, accountId), eq(classConfigs.id, id)));
    return config || undefined;
  }

  async createClassConfig(accountId: string, insertConfig: InsertClassConfig): Promise<ClassConfig> {
    accountId = requireAccountId(accountId);
    const [config] = await db.insert(classConfigs).values({ id: randomUUID(), accountId, name: insertConfig.name, grade: insertConfig.grade, capacity: insertConfig.capacity ?? 30 }).returning();
    return config;
  }

  async updateClassConfig(accountId: string, id: string, updates: Partial<InsertClassConfig>): Promise<ClassConfig | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db.update(classConfigs).set(updates).where(and(eq(classConfigs.accountId, accountId), eq(classConfigs.id, id))).returning();
    return updated || undefined;
  }

  async deleteClassConfig(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(classConfigs).where(and(eq(classConfigs.accountId, accountId), eq(classConfigs.id, id))).returning();
    return result.length > 0;
  }

  async deleteAllClassConfigs(accountId: string): Promise<void> {
    accountId = requireAccountId(accountId);
    await db.delete(classConfigs).where(eq(classConfigs.accountId, accountId));
  }

  async getPlacements(accountId: string): Promise<Placement[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(placements).where(eq(placements.accountId, accountId));
  }

  async getPlacementState(accountId: string): Promise<{ placements: Placement[]; revision: number }> {
    accountId = requireAccountId(accountId);
    return db.transaction(async (transaction) => {
      const [account] = await transaction
        .select({ revision: accounts.solverRevision })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("share");
      if (!account) throw new Error("Account not found");
      const currentPlacements = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      return { placements: currentPlacements, revision: account.revision };
    });
  }

  private async withPlacementRevision<T>(
    accountId: string,
    expectedRevision: number,
    mutate: (transaction: StorageTransaction, nextRevision: number) => Promise<T>,
  ): Promise<T> {
    accountId = requireAccountId(accountId);
    return db.transaction(async (transaction) => runRevisionedMutation(
      expectedRevision,
      async (expected) => {
        const [account] = await transaction
          .update(accounts)
          .set({ solverRevision: sql`${accounts.solverRevision} + 1` })
          .where(and(eq(accounts.id, accountId), eq(accounts.solverRevision, expected)))
          .returning({ revision: accounts.solverRevision });
        return account?.revision ?? null;
      },
      (nextRevision) => mutate(transaction, nextRevision),
    ));
  }

  private async validatePlacementCandidate(
    transaction: StorageTransaction,
    accountId: string,
    candidate: Pick<Placement, "studentId" | "classId">[],
  ): Promise<void> {
    const [accountStudents, configs, accountRules] = await Promise.all([
      transaction.select().from(students).where(eq(students.accountId, accountId)),
      transaction.select().from(classConfigs).where(eq(classConfigs.accountId, accountId)),
      transaction.select().from(rules).where(eq(rules.accountId, accountId)),
    ]);
    validatePlacements(candidate, accountStudents, configs, accountRules);
  }

  async getPlacement(accountId: string, id: string): Promise<Placement | undefined> {
    accountId = requireAccountId(accountId);
    const [placement] = await db.select().from(placements).where(and(eq(placements.accountId, accountId), eq(placements.id, id)));
    return placement || undefined;
  }

  async createPlacement(
    accountId: string,
    insertPlacement: InsertPlacement,
    expectedRevision: number,
  ): Promise<{ placement: Placement; revision: number }> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const candidate = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      validatePlacements(
        [...candidate, insertPlacement],
        await transaction.select().from(students).where(eq(students.accountId, accountId)),
        await transaction.select().from(classConfigs).where(eq(classConfigs.accountId, accountId)),
        await transaction.select().from(rules).where(eq(rules.accountId, accountId)),
      );
      const [placement] = await transaction.insert(placements).values({
        id: randomUUID(),
        accountId,
        studentId: insertPlacement.studentId,
        classId: insertPlacement.classId,
        locked: insertPlacement.locked ?? false,
      }).returning();
      return { placement, revision };
    });
  }

  async updatePlacement(
    accountId: string,
    id: string,
    updates: Partial<InsertPlacement>,
    expectedRevision: number,
  ): Promise<{ placement: Placement | undefined; revision: number }> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const current = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      const existing = current.find((placement) => placement.id === id);
      if (!existing) throw new PlacementNotFoundError();
      const candidate = current.map((placement) => placement.id === id
        ? { ...placement, ...updates }
        : placement);
      await this.validatePlacementCandidate(transaction, accountId, candidate);
      const [placement] = await transaction.update(placements)
        .set(updates)
        .where(and(eq(placements.accountId, accountId), eq(placements.id, id)))
        .returning();
      return { placement, revision };
    });
  }

  async movePlacement(
    accountId: string,
    studentId: string,
    targetClassId: string,
    expectedRevision: number,
  ): Promise<{ placement: Placement; revision: number }> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const current = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      const existing = current.find((placement) => placement.studentId === studentId);
      const candidate = existing
        ? current.map((placement) => placement.id === existing.id ? { ...placement, classId: targetClassId } : placement)
        : [...current, { studentId, classId: targetClassId }];
      await this.validatePlacementCandidate(transaction, accountId, candidate);
      if (existing) {
        const [placement] = await transaction.update(placements)
          .set({ classId: targetClassId })
          .where(and(eq(placements.accountId, accountId), eq(placements.id, existing.id)))
          .returning();
        return { placement, revision };
      }
      const [placement] = await transaction.insert(placements)
        .values({ id: randomUUID(), accountId, studentId, classId: targetClassId, locked: false })
        .returning();
      return { placement, revision };
    });
  }

  async deletePlacement(
    accountId: string,
    id: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean; revision: number }> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const result = await transaction.delete(placements)
        .where(and(eq(placements.accountId, accountId), eq(placements.id, id)))
        .returning();
      if (result.length === 0) throw new PlacementNotFoundError();
      return { deleted: result.length > 0, revision };
    });
  }

  async deleteAllPlacements(accountId: string, expectedRevision: number): Promise<number> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      await transaction.delete(placements).where(eq(placements.accountId, accountId));
      return revision;
    });
  }

  async swapPlacements(
    accountId: string,
    student1Id: string,
    class1Id: string,
    student2Id: string,
    class2Id: string,
    expectedRevision: number,
  ): Promise<number> {
    accountId = requireAccountId(accountId);
    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const current = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      const candidate = buildSwapPlacements(current, student1Id, class1Id, student2Id, class2Id);
      await this.validatePlacementCandidate(transaction, accountId, candidate);
      const first = current.find((placement) => placement.studentId === student1Id)!;
      const second = current.find((placement) => placement.studentId === student2Id)!;
      const updated = await transaction.update(placements)
        .set({ classId: sql`CASE WHEN ${placements.id} = ${first.id} THEN ${class1Id} ELSE ${class2Id} END` })
        .where(and(eq(placements.accountId, accountId), inArray(placements.id, [first.id, second.id])))
        .returning({ id: placements.id });
      if (updated.length !== 2) throw new Error("Both swap placements must still exist");
      return revision;
    });
  }

  async replacePlacements(
    accountId: string,
    placementList: InsertPlacement[],
    expectedRevision: number,
    studentIds?: string[],
  ): Promise<number> {
    accountId = requireAccountId(accountId);
    const assignedStudentIds = placementList.map((placement) => placement.studentId);
    if (new Set(assignedStudentIds).size !== assignedStudentIds.length) {
      throw new Error("A learner can only be assigned once");
    }
    const scopedStudentIds = studentIds ? Array.from(new Set(studentIds)) : undefined;
    if (scopedStudentIds && assignedStudentIds.some((id) => !scopedStudentIds.includes(id))) {
      throw new Error("Replacement placements contain a learner outside the requested scope");
    }

    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const currentPlacements = await transaction.select().from(placements).where(eq(placements.accountId, accountId));
      const currentStudents = await transaction.select().from(students).where(eq(students.accountId, accountId));
      const configs = await transaction.select().from(classConfigs).where(eq(classConfigs.accountId, accountId));
      const accountRules = await transaction.select().from(rules).where(eq(rules.accountId, accountId));
      const scopedSet = scopedStudentIds ? new Set(scopedStudentIds) : null;
      const retained = scopedSet
        ? currentPlacements.filter((placement) => !scopedSet.has(placement.studentId))
        : [];
      validatePlacements([...retained, ...placementList], currentStudents, configs, accountRules);

      if (scopedStudentIds?.length) {
        const linkedStudents = await transaction
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.accountId, accountId), inArray(students.id, scopedStudentIds)));
        if (linkedStudents.length !== scopedStudentIds.length) {
          throw new Error("Replacement learners must belong to the current account");
        }
      }

      const classIds = Array.from(new Set(placementList.map((placement) => placement.classId)));
      if (classIds.length > 0) {
        const linkedClasses = await transaction
          .select({ id: classConfigs.id })
          .from(classConfigs)
          .where(and(eq(classConfigs.accountId, accountId), inArray(classConfigs.id, classIds)));
        if (linkedClasses.length !== classIds.length) {
          throw new Error("Replacement classes must belong to the current account");
        }
      }

      const placementStudentIds = Array.from(new Set(assignedStudentIds));
      if (placementStudentIds.length > 0) {
        const linkedStudents = await transaction
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.accountId, accountId), inArray(students.id, placementStudentIds)));
        if (linkedStudents.length !== placementStudentIds.length) {
          throw new Error("Replacement learners must belong to the current account");
        }
      }

      if (scopedStudentIds) {
        if (scopedStudentIds.length > 0) {
          await transaction
            .delete(placements)
            .where(and(eq(placements.accountId, accountId), inArray(placements.studentId, scopedStudentIds)));
        }
      } else {
        await transaction.delete(placements).where(eq(placements.accountId, accountId));
      }

      if (placementList.length > 0) {
        await transaction.insert(placements).values(
          placementList.map((placement) => ({
            id: randomUUID(),
            accountId,
            studentId: placement.studentId,
            classId: placement.classId,
            locked: placement.locked ?? false,
          })),
        );
      }
      return revision;
    });
  }

  async bulkCreatePlacements(
    accountId: string,
    placementList: InsertPlacement[],
    expectedRevision: number,
  ): Promise<{ count: number; revision: number }> {
    accountId = requireAccountId(accountId);
    if (placementList.length === 0) {
      throw new Error("No new placements were supplied");
    }

    return this.withPlacementRevision(accountId, expectedRevision, async (transaction, revision) => {
      const [currentPlacements, accountStudents, configs, accountRules] = await Promise.all([
        transaction.select().from(placements).where(eq(placements.accountId, accountId)),
        transaction.select().from(students).where(eq(students.accountId, accountId)),
        transaction.select().from(classConfigs).where(eq(classConfigs.accountId, accountId)),
        transaction.select().from(rules).where(eq(rules.accountId, accountId)),
      ]);

      // Validate the combined result, but insert only the new rows. Existing
      // placement IDs, class assignments, and lock flags remain untouched.
      validatePlacements([...currentPlacements, ...placementList], accountStudents, configs, accountRules);

      const studentIds = Array.from(new Set(placementList.map((placement) => placement.studentId)));
      const classIds = Array.from(new Set(placementList.map((placement) => placement.classId)));
      const linkedStudents = await transaction
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.accountId, accountId), inArray(students.id, studentIds)));
      if (linkedStudents.length !== studentIds.length) {
        throw new Error("New placement learners must belong to the current account");
      }
      const linkedClasses = await transaction
        .select({ id: classConfigs.id })
        .from(classConfigs)
        .where(and(eq(classConfigs.accountId, accountId), inArray(classConfigs.id, classIds)));
      if (linkedClasses.length !== classIds.length) {
        throw new Error("New placement classes must belong to the current account");
      }

      await transaction.insert(placements).values(
        placementList.map((placement) => ({
          id: randomUUID(),
          accountId,
          studentId: placement.studentId,
          classId: placement.classId,
          locked: placement.locked ?? false,
        })),
      );
      return { count: placementList.length, revision };
    });
  }

  async getSurveys(accountId: string): Promise<Survey[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(surveys).where(eq(surveys.accountId, accountId));
  }

  async getSurvey(accountId: string, id: string): Promise<Survey | undefined> {
    accountId = requireAccountId(accountId);
    const [survey] = await db.select().from(surveys).where(and(eq(surveys.accountId, accountId), eq(surveys.id, id)));
    return survey || undefined;
  }

  async getSurveysByStudent(accountId: string, studentId: string): Promise<Survey[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(surveys).where(and(eq(surveys.accountId, accountId), eq(surveys.studentId, studentId)));
  }

  async createSurvey(accountId: string, insertSurvey: InsertSurvey): Promise<Survey> {
    accountId = requireAccountId(accountId);
    const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), eq(students.id, insertSurvey.studentId)));
    if (!student) throw new Error("Survey student must belong to the current account");
    const referencedIds = [...(insertSurvey.pairWith ?? []), ...(insertSurvey.separateFrom ?? [])];
    if (referencedIds.length) {
      const linkedStudents = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), inArray(students.id, referencedIds)));
      if (linkedStudents.length !== new Set(referencedIds).size) throw new Error("Survey references must belong to the current account");
    }
    const [survey] = await db.insert(surveys).values({ id: randomUUID(), accountId, teacherName: insertSurvey.teacherName, studentId: insertSurvey.studentId, characteristicRatings: insertSurvey.characteristicRatings ?? {}, pairWith: insertSurvey.pairWith ?? [], separateFrom: insertSurvey.separateFrom ?? [], notes: insertSurvey.notes ?? null, submittedAt: insertSurvey.submittedAt }).returning();
    return survey;
  }

  async updateSurvey(accountId: string, id: string, updates: Partial<InsertSurvey>): Promise<Survey | undefined> {
    accountId = requireAccountId(accountId);
    const existing = await this.getSurvey(accountId, id);
    if (!existing) return undefined;
    if (updates.studentId) {
      const [student] = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), eq(students.id, updates.studentId)));
      if (!student) throw new Error("Survey student must belong to the current account");
    }
    const referencedIds = [...(updates.pairWith ?? []), ...(updates.separateFrom ?? [])];
    if (referencedIds.length) {
      const linkedStudents = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), inArray(students.id, referencedIds)));
      if (linkedStudents.length !== new Set(referencedIds).size) throw new Error("Survey references must belong to the current account");
    }
    const [updated] = await db.update(surveys).set(updates).where(and(eq(surveys.accountId, accountId), eq(surveys.id, id))).returning();
    return updated || undefined;
  }

  async deleteSurvey(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(surveys).where(and(eq(surveys.accountId, accountId), eq(surveys.id, id))).returning();
    return result.length > 0;
  }

  async getScenarios(accountId: string): Promise<Scenario[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(scenarios).where(eq(scenarios.accountId, accountId));
  }

  async getScenario(accountId: string, id: string): Promise<Scenario | undefined> {
    accountId = requireAccountId(accountId);
    const [scenario] = await db.select().from(scenarios).where(and(eq(scenarios.accountId, accountId), eq(scenarios.id, id)));
    return scenario || undefined;
  }

  async createScenario(accountId: string, insertScenario: InsertScenario): Promise<Scenario> {
    accountId = requireAccountId(accountId);
    await this.validateScenarioPlacements(accountId, insertScenario.placements ?? []);
    const [scenario] = await db.insert(scenarios).values({ id: randomUUID(), accountId, name: insertScenario.name, createdAt: insertScenario.createdAt, placements: insertScenario.placements ?? [], balanceMetrics: insertScenario.balanceMetrics ?? { overallBalance: 0, classBalances: [] } }).returning();
    return scenario;
  }

  async deleteScenario(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(scenarios).where(and(eq(scenarios.accountId, accountId), eq(scenarios.id, id))).returning();
    return result.length > 0;
  }

  async getTeachers(accountId: string): Promise<Teacher[]> {
    accountId = requireAccountId(accountId);
    return await db.select().from(teachers).where(eq(teachers.accountId, accountId));
  }

  async getTeacher(accountId: string, id: string): Promise<Teacher | undefined> {
    accountId = requireAccountId(accountId);
    const [teacher] = await db.select().from(teachers).where(and(eq(teachers.accountId, accountId), eq(teachers.id, id)));
    return teacher || undefined;
  }

  async createTeacher(accountId: string, insertTeacher: InsertTeacher): Promise<Teacher> {
    accountId = requireAccountId(accountId);
    const [teacher] = await db.insert(teachers).values({
      id: randomUUID(),
      accountId,
      firstName: insertTeacher.firstName,
      lastName: insertTeacher.lastName,
      email: insertTeacher.email,
      currentClass: insertTeacher.currentClass ?? null,
      allocatedClass: insertTeacher.allocatedClass ?? null,
      surveyStatus: insertTeacher.surveyStatus ?? "Not Sent",
      surveyDate: insertTeacher.surveyDate ?? null,
      surveyMessage: insertTeacher.surveyMessage ?? null,
      surveySettings: insertTeacher.surveySettings ?? null,
    }).returning();
    return teacher;
  }

  async updateTeacher(accountId: string, id: string, updates: Partial<InsertTeacher>): Promise<Teacher | undefined> {
    accountId = requireAccountId(accountId);
    const [updated] = await db.update(teachers).set(updates).where(and(eq(teachers.accountId, accountId), eq(teachers.id, id))).returning();
    return updated || undefined;
  }

  async deleteTeacher(accountId: string, id: string): Promise<boolean> {
    accountId = requireAccountId(accountId);
    const result = await db.delete(teachers).where(and(eq(teachers.accountId, accountId), eq(teachers.id, id))).returning();
    return result.length > 0;
  }

  async bulkImportTeachers(accountId: string, teacherList: InsertTeacher[]): Promise<{ count: number }> {
    accountId = requireAccountId(accountId);
    let count = 0;
    for (const teacher of teacherList) {
      await this.createTeacher(accountId, teacher);
      count++;
    }
    return { count };
  }

  async getAppSettings(accountId: string): Promise<AppSettings> {
    accountId = requireAccountId(accountId);
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.accountId, accountId));
    if (!settings) {
      const [newSettings] = await db.insert(appSettings).values({ id: randomUUID(), accountId, maxFriendNominations: 1, allowTeacherStudentRequests: true, allowTeacherTeacherRequests: true }).returning();
      return newSettings;
    }
    return settings;
  }

  async updateAppSettings(accountId: string, updates: Partial<InsertAppSettings>): Promise<AppSettings> {
    accountId = requireAccountId(accountId);
    const current = await this.getAppSettings(accountId);
    const [updated] = await db.update(appSettings).set(updates).where(and(eq(appSettings.accountId, accountId), eq(appSettings.id, current.id))).returning();
    return updated;
  }

  private async validateScenarioPlacements(accountId: string, scenarioPlacements: { studentId: string; classId: string }[]): Promise<void> {
    accountId = requireAccountId(accountId);
    const studentIds = Array.from(new Set(scenarioPlacements.map((placement) => placement.studentId)));
    const classIds = Array.from(new Set(scenarioPlacements.map((placement) => placement.classId)));
    if (studentIds.length) {
      const linkedStudents = await db.select({ id: students.id }).from(students).where(and(eq(students.accountId, accountId), inArray(students.id, studentIds)));
      if (linkedStudents.length !== studentIds.length) throw new Error("Scenario students must belong to the current account");
    }
    if (classIds.length) {
      const linkedClasses = await db.select({ id: classConfigs.id }).from(classConfigs).where(and(eq(classConfigs.accountId, accountId), inArray(classConfigs.id, classIds)));
      if (linkedClasses.length !== classIds.length) throw new Error("Scenario classes must belong to the current account");
    }
  }
}

export const storage = new DatabaseStorage();
