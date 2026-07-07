import {
  type User,
  type UpsertUser,
  type Student,
  type InsertStudent,
  type Rule,
  type InsertRule,
  type Characteristic,
  type InsertCharacteristic,
  type ClassConfig,
  type InsertClassConfig,
  type Placement,
  type InsertPlacement,
  type Teacher,
  type InsertTeacher,
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
  surveys,
  scenarios,
  users,
  appSettings,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student | undefined>;
  deleteStudent(id: string): Promise<boolean>;
  bulkImportStudents(students: InsertStudent[]): Promise<{ count: number }>;
  deleteAllStudents(): Promise<void>;

  getRules(): Promise<Rule[]>;
  getRule(id: string): Promise<Rule | undefined>;
  createRule(rule: InsertRule): Promise<Rule>;
  updateRule(id: string, rule: Partial<InsertRule>): Promise<Rule | undefined>;
  deleteRule(id: string): Promise<boolean>;

  getCharacteristics(): Promise<Characteristic[]>;
  getCharacteristic(id: string): Promise<Characteristic | undefined>;
  createCharacteristic(characteristic: InsertCharacteristic): Promise<Characteristic>;
  updateCharacteristic(id: string, characteristic: Partial<InsertCharacteristic>): Promise<Characteristic | undefined>;
  deleteCharacteristic(id: string): Promise<boolean>;

  getClassConfigs(): Promise<ClassConfig[]>;
  getClassConfig(id: string): Promise<ClassConfig | undefined>;
  createClassConfig(config: InsertClassConfig): Promise<ClassConfig>;
  updateClassConfig(id: string, config: Partial<InsertClassConfig>): Promise<ClassConfig | undefined>;
  deleteClassConfig(id: string): Promise<boolean>;
  deleteAllClassConfigs(): Promise<void>;

  getPlacements(): Promise<Placement[]>;
  getPlacement(id: string): Promise<Placement | undefined>;
  createPlacement(placement: InsertPlacement): Promise<Placement>;
  updatePlacement(id: string, placement: Partial<InsertPlacement>): Promise<Placement | undefined>;
  deletePlacement(id: string): Promise<boolean>;
  deleteAllPlacements(): Promise<void>;
  bulkCreatePlacements(placements: InsertPlacement[]): Promise<{ count: number }>;

  getSurveys(): Promise<Survey[]>;
  getSurvey(id: string): Promise<Survey | undefined>;
  getSurveysByStudent(studentId: string): Promise<Survey[]>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: string, survey: Partial<InsertSurvey>): Promise<Survey | undefined>;
  deleteSurvey(id: string): Promise<boolean>;

  getScenarios(): Promise<Scenario[]>;
  getScenario(id: string): Promise<Scenario | undefined>;
  createScenario(scenario: InsertScenario): Promise<Scenario>;
  deleteScenario(id: string): Promise<boolean>;

  getTeachers(): Promise<Teacher[]>;
  getTeacher(id: string): Promise<Teacher | undefined>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  updateTeacher(id: string, teacher: Partial<InsertTeacher>): Promise<Teacher | undefined>;
  deleteTeacher(id: string): Promise<boolean>;
  bulkImportTeachers(teachers: InsertTeacher[]): Promise<{ count: number }>;

  getAppSettings(): Promise<AppSettings>;
  updateAppSettings(settings: Partial<InsertAppSettings>): Promise<AppSettings>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getStudents(): Promise<Student[]> {
    return await db.select().from(students);
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student || undefined;
  }

  async createStudent(insertStudent: InsertStudent): Promise<Student> {
    const id = randomUUID();
    const [student] = await db.insert(students).values({
      id,
      firstName: insertStudent.firstName,
      lastName: insertStudent.lastName,
      grade: insertStudent.grade,
      currentClass: insertStudent.currentClass ?? null,
      gender: insertStudent.gender ?? null,
      characteristics: insertStudent.characteristics ?? {},
      notes: insertStudent.notes ?? null,
      parentRequests: insertStudent.parentRequests ?? null,
      parentNotes: insertStudent.parentNotes ?? null,
    }).returning();
    return student;
  }

  async updateStudent(id: string, updates: Partial<InsertStudent>): Promise<Student | undefined> {
    const [updated] = await db.update(students).set(updates).where(eq(students.id, id)).returning();
    return updated || undefined;
  }

  async deleteStudent(id: string): Promise<boolean> {
    const result = await db.delete(students).where(eq(students.id, id)).returning();
    return result.length > 0;
  }

  async bulkImportStudents(studentList: InsertStudent[]): Promise<{ count: number }> {
    let count = 0;
    for (const student of studentList) {
      await this.createStudent(student);
      count++;
    }
    return { count };
  }

  async deleteAllStudents(): Promise<void> {
    await db.delete(students);
  }

  async getRules(): Promise<Rule[]> {
    return await db.select().from(rules);
  }

  async getRule(id: string): Promise<Rule | undefined> {
    const [rule] = await db.select().from(rules).where(eq(rules.id, id));
    return rule || undefined;
  }

  async createRule(insertRule: InsertRule): Promise<Rule> {
    const id = randomUUID();
    const [rule] = await db.insert(rules).values({
      id,
      type: insertRule.type,
      studentId1: insertRule.studentId1,
      studentId2: insertRule.studentId2,
      reason: insertRule.reason ?? null,
    }).returning();
    return rule;
  }

  async updateRule(id: string, updates: Partial<InsertRule>): Promise<Rule | undefined> {
    const [updated] = await db.update(rules).set(updates).where(eq(rules.id, id)).returning();
    return updated || undefined;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await db.delete(rules).where(eq(rules.id, id)).returning();
    return result.length > 0;
  }

  async getCharacteristics(): Promise<Characteristic[]> {
    return await db.select().from(characteristics);
  }

  async getCharacteristic(id: string): Promise<Characteristic | undefined> {
    const [char] = await db.select().from(characteristics).where(eq(characteristics.id, id));
    return char || undefined;
  }

  async createCharacteristic(insertChar: InsertCharacteristic): Promise<Characteristic> {
    const id = randomUUID();
    const [char] = await db.insert(characteristics).values({
      id,
      name: insertChar.name,
      type: insertChar.type,
      options: insertChar.options ?? [],
      priority: insertChar.priority ?? 1,
    }).returning();
    return char;
  }

  async updateCharacteristic(id: string, updates: Partial<InsertCharacteristic>): Promise<Characteristic | undefined> {
    const [updated] = await db.update(characteristics).set(updates).where(eq(characteristics.id, id)).returning();
    return updated || undefined;
  }

  async deleteCharacteristic(id: string): Promise<boolean> {
    const result = await db.delete(characteristics).where(eq(characteristics.id, id)).returning();
    return result.length > 0;
  }

  async getClassConfigs(): Promise<ClassConfig[]> {
    return await db.select().from(classConfigs);
  }

  async getClassConfig(id: string): Promise<ClassConfig | undefined> {
    const [config] = await db.select().from(classConfigs).where(eq(classConfigs.id, id));
    return config || undefined;
  }

  async createClassConfig(insertConfig: InsertClassConfig): Promise<ClassConfig> {
    const id = randomUUID();
    const [config] = await db.insert(classConfigs).values({
      id,
      name: insertConfig.name,
      grade: insertConfig.grade,
      capacity: insertConfig.capacity ?? 30,
    }).returning();
    return config;
  }

  async updateClassConfig(id: string, updates: Partial<InsertClassConfig>): Promise<ClassConfig | undefined> {
    const [updated] = await db.update(classConfigs).set(updates).where(eq(classConfigs.id, id)).returning();
    return updated || undefined;
  }

  async deleteClassConfig(id: string): Promise<boolean> {
    const result = await db.delete(classConfigs).where(eq(classConfigs.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllClassConfigs(): Promise<void> {
    await db.delete(classConfigs);
  }

  async getPlacements(): Promise<Placement[]> {
    return await db.select().from(placements);
  }

  async getPlacement(id: string): Promise<Placement | undefined> {
    const [placement] = await db.select().from(placements).where(eq(placements.id, id));
    return placement || undefined;
  }

  async createPlacement(insertPlacement: InsertPlacement): Promise<Placement> {
    const id = randomUUID();
    const [placement] = await db.insert(placements).values({
      id,
      studentId: insertPlacement.studentId,
      classId: insertPlacement.classId,
      locked: insertPlacement.locked ?? false,
    }).returning();
    return placement;
  }

  async updatePlacement(id: string, updates: Partial<InsertPlacement>): Promise<Placement | undefined> {
    const [updated] = await db.update(placements).set(updates).where(eq(placements.id, id)).returning();
    return updated || undefined;
  }

  async deletePlacement(id: string): Promise<boolean> {
    const result = await db.delete(placements).where(eq(placements.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllPlacements(): Promise<void> {
    await db.delete(placements);
  }

  async bulkCreatePlacements(placementList: InsertPlacement[]): Promise<{ count: number }> {
    let count = 0;
    for (const placement of placementList) {
      await this.createPlacement(placement);
      count++;
    }
    return { count };
  }

  async getSurveys(): Promise<Survey[]> {
    return await db.select().from(surveys);
  }

  async getSurvey(id: string): Promise<Survey | undefined> {
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
    return survey || undefined;
  }

  async getSurveysByStudent(studentId: string): Promise<Survey[]> {
    return await db.select().from(surveys).where(eq(surveys.studentId, studentId));
  }

  async createSurvey(insertSurvey: InsertSurvey): Promise<Survey> {
    const id = randomUUID();
    const [survey] = await db.insert(surveys).values({
      id,
      teacherName: insertSurvey.teacherName,
      studentId: insertSurvey.studentId,
      characteristicRatings: insertSurvey.characteristicRatings ?? {},
      pairWith: insertSurvey.pairWith ?? [],
      separateFrom: insertSurvey.separateFrom ?? [],
      notes: insertSurvey.notes ?? null,
      submittedAt: insertSurvey.submittedAt,
    }).returning();
    return survey;
  }

  async updateSurvey(id: string, updates: Partial<InsertSurvey>): Promise<Survey | undefined> {
    const [updated] = await db.update(surveys).set(updates).where(eq(surveys.id, id)).returning();
    return updated || undefined;
  }

  async deleteSurvey(id: string): Promise<boolean> {
    const result = await db.delete(surveys).where(eq(surveys.id, id)).returning();
    return result.length > 0;
  }

  async getScenarios(): Promise<Scenario[]> {
    return await db.select().from(scenarios);
  }

  async getScenario(id: string): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return scenario || undefined;
  }

  async createScenario(insertScenario: InsertScenario): Promise<Scenario> {
    const id = randomUUID();
    const [scenario] = await db.insert(scenarios).values({
      id,
      name: insertScenario.name,
      createdAt: insertScenario.createdAt,
      placements: insertScenario.placements ?? [],
      balanceMetrics: insertScenario.balanceMetrics ?? { overallBalance: 0, classBalances: [] },
    }).returning();
    return scenario;
  }

  async deleteScenario(id: string): Promise<boolean> {
    const result = await db.delete(scenarios).where(eq(scenarios.id, id)).returning();
    return result.length > 0;
  }

  async getTeachers(): Promise<Teacher[]> {
    return await db.select().from(teachers);
  }

  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher || undefined;
  }

  async createTeacher(insertTeacher: InsertTeacher): Promise<Teacher> {
    const id = randomUUID();
    const [teacher] = await db.insert(teachers).values({
      id,
      firstName: insertTeacher.firstName,
      lastName: insertTeacher.lastName,
      email: insertTeacher.email,
      currentClass: insertTeacher.currentClass ?? null,
      allocatedClass: insertTeacher.allocatedClass ?? null,
      surveyStatus: insertTeacher.surveyStatus ?? "Not Sent",
      surveyDate: insertTeacher.surveyDate ?? null,
    }).returning();
    return teacher;
  }

  async updateTeacher(id: string, updates: Partial<InsertTeacher>): Promise<Teacher | undefined> {
    const [updated] = await db.update(teachers).set(updates).where(eq(teachers.id, id)).returning();
    return updated || undefined;
  }

  async deleteTeacher(id: string): Promise<boolean> {
    const result = await db.delete(teachers).where(eq(teachers.id, id)).returning();
    return result.length > 0;
  }

  async bulkImportTeachers(teacherList: InsertTeacher[]): Promise<{ count: number }> {
    let count = 0;
    for (const teacher of teacherList) {
      await this.createTeacher(teacher);
      count++;
    }
    return { count };
  }

  async getAppSettings(): Promise<AppSettings> {
    const [settings] = await db.select().from(appSettings);
    if (!settings) {
      const id = randomUUID();
      const [newSettings] = await db.insert(appSettings).values({
        id,
        maxFriendNominations: 1,
        allowTeacherStudentRequests: true,
        allowTeacherTeacherRequests: true,
      }).returning();
      return newSettings;
    }
    return settings;
  }

  async updateAppSettings(updates: Partial<InsertAppSettings>): Promise<AppSettings> {
    const current = await this.getAppSettings();
    const [updated] = await db.update(appSettings).set(updates).where(eq(appSettings.id, current.id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
