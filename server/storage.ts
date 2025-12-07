import {
  type User,
  type InsertUser,
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
  type Survey,
  type InsertSurvey,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Students
  getStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student | undefined>;
  deleteStudent(id: string): Promise<boolean>;
  bulkImportStudents(students: InsertStudent[]): Promise<{ count: number }>;
  deleteAllStudents(): Promise<void>;

  // Rules
  getRules(): Promise<Rule[]>;
  getRule(id: string): Promise<Rule | undefined>;
  createRule(rule: InsertRule): Promise<Rule>;
  updateRule(id: string, rule: Partial<InsertRule>): Promise<Rule | undefined>;
  deleteRule(id: string): Promise<boolean>;

  // Characteristics
  getCharacteristics(): Promise<Characteristic[]>;
  getCharacteristic(id: string): Promise<Characteristic | undefined>;
  createCharacteristic(characteristic: InsertCharacteristic): Promise<Characteristic>;
  updateCharacteristic(id: string, characteristic: Partial<InsertCharacteristic>): Promise<Characteristic | undefined>;
  deleteCharacteristic(id: string): Promise<boolean>;

  // Class Configs
  getClassConfigs(): Promise<ClassConfig[]>;
  getClassConfig(id: string): Promise<ClassConfig | undefined>;
  createClassConfig(config: InsertClassConfig): Promise<ClassConfig>;
  updateClassConfig(id: string, config: Partial<InsertClassConfig>): Promise<ClassConfig | undefined>;
  deleteClassConfig(id: string): Promise<boolean>;
  deleteAllClassConfigs(): Promise<void>;

  // Placements
  getPlacements(): Promise<Placement[]>;
  getPlacement(id: string): Promise<Placement | undefined>;
  createPlacement(placement: InsertPlacement): Promise<Placement>;
  updatePlacement(id: string, placement: Partial<InsertPlacement>): Promise<Placement | undefined>;
  deletePlacement(id: string): Promise<boolean>;
  deleteAllPlacements(): Promise<void>;
  bulkCreatePlacements(placements: InsertPlacement[]): Promise<{ count: number }>;

  // Surveys
  getSurveys(): Promise<Survey[]>;
  getSurvey(id: string): Promise<Survey | undefined>;
  getSurveysByStudent(studentId: string): Promise<Survey[]>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: string, survey: Partial<InsertSurvey>): Promise<Survey | undefined>;
  deleteSurvey(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private students: Map<string, Student>;
  private rules: Map<string, Rule>;
  private characteristics: Map<string, Characteristic>;
  private classConfigs: Map<string, ClassConfig>;
  private placements: Map<string, Placement>;
  private surveys: Map<string, Survey>;

  constructor() {
    this.users = new Map();
    this.students = new Map();
    this.rules = new Map();
    this.characteristics = new Map();
    this.classConfigs = new Map();
    this.placements = new Map();
    this.surveys = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Students
  async getStudents(): Promise<Student[]> {
    return Array.from(this.students.values());
  }

  async getStudent(id: string): Promise<Student | undefined> {
    return this.students.get(id);
  }

  async createStudent(insertStudent: InsertStudent): Promise<Student> {
    const id = randomUUID();
    const student: Student = {
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
    };
    this.students.set(id, student);
    return student;
  }

  async updateStudent(id: string, updates: Partial<InsertStudent>): Promise<Student | undefined> {
    const student = this.students.get(id);
    if (!student) return undefined;
    const updated: Student = { ...student, ...updates };
    this.students.set(id, updated);
    return updated;
  }

  async deleteStudent(id: string): Promise<boolean> {
    return this.students.delete(id);
  }

  async bulkImportStudents(students: InsertStudent[]): Promise<{ count: number }> {
    let count = 0;
    for (const student of students) {
      await this.createStudent(student);
      count++;
    }
    return { count };
  }

  async deleteAllStudents(): Promise<void> {
    this.students.clear();
  }

  // Rules
  async getRules(): Promise<Rule[]> {
    return Array.from(this.rules.values());
  }

  async getRule(id: string): Promise<Rule | undefined> {
    return this.rules.get(id);
  }

  async createRule(insertRule: InsertRule): Promise<Rule> {
    const id = randomUUID();
    const rule: Rule = {
      id,
      type: insertRule.type,
      studentId1: insertRule.studentId1,
      studentId2: insertRule.studentId2,
      reason: insertRule.reason ?? null,
    };
    this.rules.set(id, rule);
    return rule;
  }

  async updateRule(id: string, updates: Partial<InsertRule>): Promise<Rule | undefined> {
    const rule = this.rules.get(id);
    if (!rule) return undefined;
    const updated: Rule = { ...rule, ...updates };
    this.rules.set(id, updated);
    return updated;
  }

  async deleteRule(id: string): Promise<boolean> {
    return this.rules.delete(id);
  }

  // Characteristics
  async getCharacteristics(): Promise<Characteristic[]> {
    return Array.from(this.characteristics.values());
  }

  async getCharacteristic(id: string): Promise<Characteristic | undefined> {
    return this.characteristics.get(id);
  }

  async createCharacteristic(insertChar: InsertCharacteristic): Promise<Characteristic> {
    const id = randomUUID();
    const characteristic: Characteristic = {
      id,
      name: insertChar.name,
      type: insertChar.type,
      options: insertChar.options ?? [],
      priority: insertChar.priority ?? 1,
    };
    this.characteristics.set(id, characteristic);
    return characteristic;
  }

  async updateCharacteristic(id: string, updates: Partial<InsertCharacteristic>): Promise<Characteristic | undefined> {
    const characteristic = this.characteristics.get(id);
    if (!characteristic) return undefined;
    const updated: Characteristic = { ...characteristic, ...updates };
    this.characteristics.set(id, updated);
    return updated;
  }

  async deleteCharacteristic(id: string): Promise<boolean> {
    return this.characteristics.delete(id);
  }

  // Class Configs
  async getClassConfigs(): Promise<ClassConfig[]> {
    return Array.from(this.classConfigs.values());
  }

  async getClassConfig(id: string): Promise<ClassConfig | undefined> {
    return this.classConfigs.get(id);
  }

  async createClassConfig(insertConfig: InsertClassConfig): Promise<ClassConfig> {
    const id = randomUUID();
    const config: ClassConfig = {
      id,
      name: insertConfig.name,
      grade: insertConfig.grade,
      capacity: insertConfig.capacity ?? 30,
    };
    this.classConfigs.set(id, config);
    return config;
  }

  async updateClassConfig(id: string, updates: Partial<InsertClassConfig>): Promise<ClassConfig | undefined> {
    const config = this.classConfigs.get(id);
    if (!config) return undefined;
    const updated: ClassConfig = { ...config, ...updates };
    this.classConfigs.set(id, updated);
    return updated;
  }

  async deleteClassConfig(id: string): Promise<boolean> {
    return this.classConfigs.delete(id);
  }

  async deleteAllClassConfigs(): Promise<void> {
    this.classConfigs.clear();
  }

  // Placements
  async getPlacements(): Promise<Placement[]> {
    return Array.from(this.placements.values());
  }

  async getPlacement(id: string): Promise<Placement | undefined> {
    return this.placements.get(id);
  }

  async createPlacement(insertPlacement: InsertPlacement): Promise<Placement> {
    const id = randomUUID();
    const placement: Placement = {
      id,
      studentId: insertPlacement.studentId,
      classId: insertPlacement.classId,
      locked: insertPlacement.locked ?? false,
    };
    this.placements.set(id, placement);
    return placement;
  }

  async updatePlacement(id: string, updates: Partial<InsertPlacement>): Promise<Placement | undefined> {
    const placement = this.placements.get(id);
    if (!placement) return undefined;
    const updated: Placement = { ...placement, ...updates };
    this.placements.set(id, updated);
    return updated;
  }

  async deletePlacement(id: string): Promise<boolean> {
    return this.placements.delete(id);
  }

  async deleteAllPlacements(): Promise<void> {
    this.placements.clear();
  }

  async bulkCreatePlacements(placements: InsertPlacement[]): Promise<{ count: number }> {
    let count = 0;
    for (const placement of placements) {
      await this.createPlacement(placement);
      count++;
    }
    return { count };
  }

  // Surveys
  async getSurveys(): Promise<Survey[]> {
    return Array.from(this.surveys.values());
  }

  async getSurvey(id: string): Promise<Survey | undefined> {
    return this.surveys.get(id);
  }

  async getSurveysByStudent(studentId: string): Promise<Survey[]> {
    return Array.from(this.surveys.values()).filter(s => s.studentId === studentId);
  }

  async createSurvey(insertSurvey: InsertSurvey): Promise<Survey> {
    const id = randomUUID();
    const survey: Survey = {
      id,
      teacherName: insertSurvey.teacherName,
      studentId: insertSurvey.studentId,
      characteristicRatings: insertSurvey.characteristicRatings ?? {},
      pairWith: insertSurvey.pairWith ?? [],
      separateFrom: insertSurvey.separateFrom ?? [],
      notes: insertSurvey.notes ?? null,
      submittedAt: insertSurvey.submittedAt,
    };
    this.surveys.set(id, survey);
    return survey;
  }

  async updateSurvey(id: string, updates: Partial<InsertSurvey>): Promise<Survey | undefined> {
    const survey = this.surveys.get(id);
    if (!survey) return undefined;
    const updated: Survey = {
      id: survey.id,
      teacherName: updates.teacherName ?? survey.teacherName,
      studentId: updates.studentId ?? survey.studentId,
      characteristicRatings: updates.characteristicRatings ?? survey.characteristicRatings,
      pairWith: updates.pairWith ?? survey.pairWith,
      separateFrom: updates.separateFrom ?? survey.separateFrom,
      notes: updates.notes !== undefined ? updates.notes : survey.notes,
      submittedAt: updates.submittedAt ?? survey.submittedAt,
    };
    this.surveys.set(id, updated);
    return updated;
  }

  async deleteSurvey(id: string): Promise<boolean> {
    return this.surveys.delete(id);
  }
}

export const storage = new MemStorage();
