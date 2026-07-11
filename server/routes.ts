import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { attachAccountContext, getAccountContext } from "./accountContext";
import { authenticateSupabaseJwt, requireSupabaseUser } from "./supabaseAuth";
import { onboardSupabaseUser } from "./onboarding";
import { createAuthHandoff, exchangeAuthHandoff } from "./authHandoff";
import {
  requireWritableWorkspace,
  requireFinalExportAccess,
  reserveTrialSolverGeneration,
  releaseTrialSolverGeneration,
  solverAccessResponse,
  wouldExceedLearnerCapacity,
  learnerCapacityExceededResponse,
} from "./accessControl";
import { buildPayfastInitiationUrl, verifyPayfastNotification } from "./payfast";

import {
  insertStudentSchema,
  insertRuleSchema,
  insertCharacteristicSchema,
  insertClassConfigSchema,
  insertPlacementSchema,
  insertSurveySchema,
  insertScenarioSchema,
  insertTeacherSchema,
  type Student,
  type Rule,
  type ClassConfig,
  type Characteristic,
  type CharacteristicResponse,
  type ConflictWarning,
  type ClassGenerationResult,
  type GeneratedClass,
} from "@shared/schema";
import { CHARACTERISTIC_TYPES, characteristicValueToArray, defaultResponseColor, getStableResponseId, isCharacteristicApplicableToGrade, normalizeResponses } from "@shared/characteristics";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const accountIdFor = (req: Express.Request) => getAccountContext(req).accountId;
  const isDemoWorkspace = (req: Express.Request) => {
    const context = getAccountContext(req);
    return context.workspaceMode === "demo" && context.subscriptionStatus !== "trialing" && context.subscriptionStatus !== "active";
  };
  const blockDemoWorkspace = (req: Express.Request, res: any, action: string) => {
    if (!isDemoWorkspace(req)) return false;
    res.status(403).json({ error: `${action} is disabled in demo workspaces` });
    return true;
  };
  const hasAnyField = (body: unknown, fields: string[]) => {
    if (!body || typeof body !== "object") return false;
    return fields.some((field) => Object.prototype.hasOwnProperty.call(body, field));
  };

  // Setup authentication
  await setupAuth(app);
  app.post("/api/onboarding/supabase", requireSupabaseUser, onboardSupabaseUser);
  app.post("/api/auth/handoff", requireSupabaseUser, createAuthHandoff);
  app.post("/api/auth/exchange", exchangeAuthHandoff);
  app.post("/api/payments/payfast/initiate", async (req, res) => {
    try {
      const body = z.object({
        planType: z.enum(["teacher", "school"]),
        learnerCount: z.coerce.number().int().positive(),
      }).parse(req.body);

      const { paymentReference, amount, redirectUrl } = buildPayfastInitiationUrl(body.planType, body.learnerCount);
      console.log("[api/payments/payfast/initiate] created payment initiation", {
        paymentReference,
        planType: body.planType,
        learnerCount: body.learnerCount,
        amount,
      });
      res.redirect(302, redirectUrl);
    } catch (error) {
      console.error("[api/payments/payfast/initiate] failed to create payment initiation", {
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to initiate payment" });
    }
  });
  app.post("/api/payments/payfast/itn", async (req, res) => {
    try {
      const body = z.record(z.string()).parse(req.body);
      if (!verifyPayfastNotification(body)) {
        console.warn("[api/payments/payfast/itn] invalid notification signature or status", {
          paymentReference: body.m_payment_id,
        });
        return res.status(400).send("Invalid notification");
      }

      const planType = body.custom_str1;
      const learnerCount = Number.parseInt(body.custom_int1 ?? "", 10);
      const amountPaidCents = Math.round(Number.parseFloat(body.amount) * 100);
      const paymentReference = body.m_payment_id;
      const transactionType = body.custom_str2;
      const accountId = body.custom_str3;

      if (planType !== "teacher" && planType !== "school") {
        return res.status(400).send("Invalid plan type");
      }

      if (!Number.isInteger(learnerCount) || learnerCount <= 0) {
        return res.status(400).send("Invalid learner count");
      }

      const amountCents = learnerCount * 25 * 100;
      if (amountPaidCents !== amountCents) {
        return res.status(400).send("Amount mismatch");
      }

      if (!accountId) {
        return res.status(400).send("Missing account identifier");
      }

      if (body.payment_status !== "COMPLETE") {
        return res.status(200).send("OK");
      }

      if (transactionType === "topup") {
        await import("./licenseService").then(({ addLearnerCapacity }) => addLearnerCapacity(accountId, learnerCount, amountCents, paymentReference));
      } else if (transactionType === "renewal") {
        await import("./licenseService").then(({ renewLicense }) => renewLicense(accountId, amountCents, paymentReference));
      } else {
        await import("./licenseService").then(({ activateInitialLicense }) => activateInitialLicense(accountId, planType, learnerCount, amountCents, paymentReference));
      }

      console.log("[api/payments/payfast/itn] processed successful payment", {
        paymentReference,
        planType,
        learnerCount,
        amountCents,
      });
      return res.status(200).send("OK");
    } catch (error) {
      console.error("[api/payments/payfast/itn] failed to process notification", {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).send("Bad Request");
    }
  });

  app.use("/api", authenticateSupabaseJwt, isAuthenticated, attachAccountContext);

  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (req.supabaseUser) {
        return res.json({
          id: req.supabaseUser.id,
          email: req.supabaseUser.email,
          accountContext: req.accountContext,
        });
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/exports/class-placements.csv", isAuthenticated, requireFinalExportAccess, async (req, res) => {
    const [students, placements, classConfigs] = await Promise.all([
      storage.getStudents(accountIdFor(req)),
      storage.getPlacements(accountIdFor(req)),
      storage.getClassConfigs(accountIdFor(req)),
    ]);
    const classMap = new Map(classConfigs.map((c) => [c.id, c.name]));
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["First Name", "Last Name", "Grade", "Assigned Class"].map(csvEscape).join(",")];
    for (const placement of placements) {
      const student = studentMap.get(placement.studentId);
      if (!student) continue;
      rows.push([student.firstName, student.lastName, student.grade, classMap.get(placement.classId) || "Unassigned"].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="class-placements-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(rows.join("\n"));
  });

  app.get("/api/exports/teachers.csv", isAuthenticated, requireFinalExportAccess, async (req, res) => {
    const teachers = await storage.getTeachers(accountIdFor(req));
    const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["First Name", "Last Name", "Email", "Current Class", "Allocated Class", "Survey Status", "Survey Date"].map(csvEscape).join(",")];
    for (const teacher of teachers) {
      rows.push([teacher.firstName, teacher.lastName, teacher.email, teacher.currentClass, teacher.allocatedClass, teacher.surveyStatus, teacher.surveyDate].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="teachers-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(rows.join("\n"));
  });

  // Students CRUD (protected)
  app.get("/api/students", isAuthenticated, async (req, res) => {
    console.log("[api/students] request entered GET /api/students");
    try {
      const students = await storage.getStudents(accountIdFor(req));
      console.log(`[api/students] request completed with row count: ${students.length}`);
      res.json(students);
    } catch (error) {
      console.error("[api/students] caught error", {
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get("/api/students/:id", isAuthenticated, async (req, res) => {
    const student = await storage.getStudent(accountIdFor(req), req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  });

  app.post("/api/students", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertStudentSchema.parse(req.body);
      const context = getAccountContext(req);
      const currentStudentCount = (await storage.getStudents(accountIdFor(req))).length;
      if (wouldExceedLearnerCapacity(context, currentStudentCount, 1)) {
        return res.status(403).json(learnerCapacityExceededResponse(context));
      }
      const student = await storage.createStudent(accountIdFor(req), data);
      res.status(201).json(student);
    } catch (error) {
      res.status(400).json({ error: "Invalid student data" });
    }
  });

  app.patch("/api/students/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (isDemoWorkspace(req) && hasAnyField(req.body, ["firstName", "lastName", "studentId"])) {
      return res.status(403).json({ error: "Student identity fields are disabled in demo workspaces" });
    }
    const student = await storage.updateStudent(accountIdFor(req), req.params.id, req.body);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  });

  app.delete("/api/students/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (isDemoWorkspace(req)) {
      const existingStudents = await storage.getStudents(accountIdFor(req));
      if (existingStudents.length <= 1) {
        return res.status(403).json({ error: "Deleting all students is disabled in demo workspaces" });
      }
    }
    const deleted = await storage.deleteStudent(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.status(204).send();
  });

  app.post("/api/students/bulk-import", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (blockDemoWorkspace(req, res, "Student import")) return;
    try {
      const { students } = req.body;
      if (!Array.isArray(students)) {
        return res.status(400).json({ error: "students must be an array" });
      }

      const context = getAccountContext(req);
      const currentStudentCount = (await storage.getStudents(accountIdFor(req))).length;
      if (wouldExceedLearnerCapacity(context, currentStudentCount, students.length)) {
        return res.status(403).json(learnerCapacityExceededResponse(context));
      }
      
      const standardFields = ["firstName", "lastName", "grade", "currentClass", "gender", "notes", "parentRequests", "parentNotes"];
      const existingCharacteristics = await storage.getCharacteristics(accountIdFor(req));
      const characteristicByName = new Map(existingCharacteristics.map((char) => [char.name, char]));
      const importedValuesByCharacteristic = new Map<string, Set<string>>();
      
      for (const student of students) {
        for (const [key, value] of Object.entries(student)) {
          if (!standardFields.includes(key) && value !== undefined && value !== null && value !== "") {
            if (!importedValuesByCharacteristic.has(key)) {
              importedValuesByCharacteristic.set(key, new Set());
            }
            importedValuesByCharacteristic.get(key)!.add(String(value));
          }
        }
      }

      const allCharacteristicNames = new Set([
        ...Array.from(characteristicByName.keys()),
        ...Array.from(importedValuesByCharacteristic.keys()),
      ]);
      if (allCharacteristicNames.size > 50) {
        return res.status(400).json({ error: "A maximum of 50 active characteristics is supported" });
      }
      
      for (const [name, values] of importedValuesByCharacteristic) {
        const existing = characteristicByName.get(name);
        const type = existing?.type || (name.includes("%") ? "percentage" : "category");
        if (!existing) {
          const responseConfig = type === "category"
            ? Array.from(values).map((value, index) => ({
                id: getStableResponseId(name, value),
                name: value,
                color: defaultResponseColor(index),
                description: "",
                sortOrder: index + 1,
              }))
            : [];
          const created = await storage.createCharacteristic(accountIdFor(req), {
            name,
            type,
            options: responseConfig.map((response) => response.name),
            responseConfig,
            priority: 1,
          });
          characteristicByName.set(name, created);
        } else if (type === "category") {
          const responses = normalizeResponses(existing);
          const existingResponseNames = new Set(responses.map((response) => response.name));
          for (const value of values) {
            if (!existingResponseNames.has(value)) {
              responses.push({
                id: getStableResponseId(existing.id, value),
                name: value,
                color: defaultResponseColor(responses.length),
                description: "",
                sortOrder: responses.length + 1,
              });
              existingResponseNames.add(value);
            }
          }
          await storage.updateCharacteristic(accountIdFor(req), existing.id, {
            options: responses.map((response) => response.name),
            responseConfig: responses,
          });
        }
      }
      
      // Process students and extract characteristics from extra columns
      const processedStudents = students.map(student => {
        const characteristics: Record<string, string> = {};
        for (const [key, value] of Object.entries(student)) {
          if (!standardFields.includes(key) && value !== undefined && value !== null && value !== "") {
            characteristics[key] = String(value);
          }
        }
        return {
          firstName: student.firstName,
          lastName: student.lastName,
          grade: student.grade,
          currentClass: student.currentClass,
          gender: student.gender,
          notes: student.notes,
          characteristics
        };
      });
      
      const result = await storage.bulkImportStudents(accountIdFor(req), processedStudents);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to import students" });
    }
  });

  app.delete("/api/students", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (blockDemoWorkspace(req, res, "Deleting all students")) return;
    await storage.deleteAllStudents(accountIdFor(req));
    res.status(204).send();
  });

  app.post("/api/students/bulk-delete", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }
      if (isDemoWorkspace(req)) {
        const existingStudents = await storage.getStudents(accountIdFor(req));
        const requestedIds = new Set(ids);
        if (existingStudents.length > 0 && existingStudents.every((student) => requestedIds.has(student.id))) {
          return res.status(403).json({ error: "Deleting all students is disabled in demo workspaces" });
        }
      }
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await storage.deleteStudent(accountIdFor(req), id);
        if (deleted) deletedCount++;
      }
      res.json({ count: deletedCount });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete students" });
    }
  });

  // Rules CRUD (protected)
  app.get("/api/rules", isAuthenticated, async (req, res) => {
    const rules = await storage.getRules(accountIdFor(req));
    res.json(rules);
  });

  app.get("/api/rules/:id", isAuthenticated, async (req, res) => {
    const rule = await storage.getRule(accountIdFor(req), req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  });

  app.post("/api/rules", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertRuleSchema.parse(req.body);
      const rule = await storage.createRule(accountIdFor(req), data);
      res.status(201).json(rule);
    } catch (error) {
      res.status(400).json({ error: "Invalid rule data" });
    }
  });

  app.patch("/api/rules/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const rule = await storage.updateRule(accountIdFor(req), req.params.id, req.body);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  });

  app.delete("/api/rules/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deleteRule(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.status(204).send();
  });

  // Characteristics CRUD (protected)
  app.get("/api/characteristics", isAuthenticated, async (req, res) => {
    const characteristicRows = await storage.getCharacteristics(accountIdFor(req));
    res.json(characteristicRows.map((char) => ({
      ...char,
      responseConfig: char.type === "category" ? normalizeResponses(char) : [],
      options: char.type === "category" ? normalizeResponses(char).map((response) => response.name) : char.options || [],
    })));
  });

  app.put("/api/characteristics/settings", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const responseSchema = z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      description: z.string().optional().default(""),
      sortOrder: z.number().int().positive(),
    });

    const characteristicSchema = z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1),
      type: z.enum(CHARACTERISTIC_TYPES),
      priority: z.number().int().positive(),
      responseConfig: z.array(responseSchema).default([]),
      tagOnly: z.boolean().default(false),
      multiSelect: z.boolean().default(false),
      adminOnly: z.boolean().default(false),
      applyToAllGrades: z.boolean().default(true),
      applicableGrades: z.array(z.string().trim().min(1)).default([]),
    });

    const bodySchema = z.object({
      characteristics: z.array(characteristicSchema).max(50),
    });

    try {
      const { characteristics } = bodySchema.parse(req.body);
      const normalizedNames = characteristics.map((char) => char.name.trim().toLowerCase());
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        return res.status(400).json({ error: "Characteristic names must be unique" });
      }

      const canonicalCharacteristics = characteristics.map((char, index) => {
        const responses = char.type === "category"
          ? char.responseConfig
              .map((response, responseIndex) => ({
                id: response.id || getStableResponseId(char.id || char.name, response.name),
                name: response.name.trim(),
                color: response.color,
                description: response.description || "",
                sortOrder: responseIndex + 1,
              }))
              .filter((response) => response.name)
          : [];
        const responseNames = responses.map((response) => response.name.toLowerCase());
        if (new Set(responseNames).size !== responseNames.length) {
          throw new Error(`Response names must be unique for ${char.name}`);
        }

        return {
          id: char.id,
          name: char.name.trim(),
          type: char.type,
          priority: characteristics.length - index,
          options: responses.map((response) => response.name),
          responseConfig: responses,
          tagOnly: char.tagOnly,
          multiSelect: char.type === "category" ? char.multiSelect : false,
          adminOnly: char.adminOnly,
          applyToAllGrades: char.applyToAllGrades,
          applicableGrades: char.applyToAllGrades ? [] : Array.from(new Set(char.applicableGrades.map((grade) => grade.trim()).filter(Boolean))),
        };
      });

      const saved = await storage.saveCharacteristicSettings(accountIdFor(req), canonicalCharacteristics);
      res.json(saved.map((char) => ({
        ...char,
        responseConfig: char.type === "category" ? normalizeResponses(char) : [],
        options: char.type === "category" ? normalizeResponses(char).map((response) => response.name) : char.options || [],
      })));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid characteristic settings",
      });
    }
  });

  app.get("/api/teacher-characteristics", isAuthenticated, async (req, res) => {
    const characteristicRows = await storage.getCharacteristics(accountIdFor(req));
    res.json(characteristicRows.filter((char) => !char.adminOnly).map((char) => ({
      ...char,
      responseConfig: char.type === "category" ? normalizeResponses(char) : [],
      options: char.type === "category" ? normalizeResponses(char).map((response) => response.name) : char.options || [],
    })));
  });

  app.get("/api/characteristics/:id", isAuthenticated, async (req, res) => {
    const characteristic = await storage.getCharacteristic(accountIdFor(req), req.params.id);
    if (!characteristic) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.json({
      ...characteristic,
      responseConfig: characteristic.type === "category" ? normalizeResponses(characteristic) : [],
      options: characteristic.type === "category" ? normalizeResponses(characteristic).map((response) => response.name) : characteristic.options || [],
    });
  });

  app.post("/api/characteristics", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const existing = await storage.getCharacteristics(accountIdFor(req));
      if (existing.length >= 50) {
        return res.status(400).json({ error: "A maximum of 50 active characteristics is supported" });
      }
      const data = insertCharacteristicSchema.parse(req.body);
      const responseConfig = data.type === "category" ? normalizeResponses({ id: "new", options: data.options || [], responseConfig: data.responseConfig || [] }) : [];
      const characteristic = await storage.createCharacteristic(accountIdFor(req), {
        ...data,
        options: data.type === "category" ? responseConfig.map((response) => response.name) : [],
        responseConfig,
        tagOnly: data.tagOnly ?? false,
        multiSelect: data.type === "category" ? data.multiSelect ?? false : false,
        adminOnly: data.adminOnly ?? false,
        applyToAllGrades: data.applyToAllGrades ?? true,
        applicableGrades: data.applyToAllGrades === false ? data.applicableGrades ?? [] : [],
      });
      res.status(201).json(characteristic);
    } catch (error) {
      res.status(400).json({ error: "Invalid characteristic data" });
    }
  });

  app.patch("/api/characteristics/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const characteristic = await storage.updateCharacteristic(accountIdFor(req), req.params.id, req.body);
    if (!characteristic) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.json(characteristic);
  });

  app.delete("/api/characteristics/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deleteCharacteristic(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.status(204).send();
  });

  app.post("/api/characteristics/reorder", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      const totalCount = orderedIds.length;
      for (let i = 0; i < orderedIds.length; i++) {
        const priority = totalCount - i;
        await storage.updateCharacteristic(accountIdFor(req), orderedIds[i], { priority });
      }
      const characteristics = await storage.getCharacteristics(accountIdFor(req));
      res.json(characteristics);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder characteristics" });
    }
  });

  // Class Configs CRUD (protected)
  app.get("/api/class-configs", isAuthenticated, async (req, res) => {
    const configs = await storage.getClassConfigs(accountIdFor(req));
    res.json(configs);
  });

  app.get("/api/class-configs/:id", isAuthenticated, async (req, res) => {
    const config = await storage.getClassConfig(accountIdFor(req), req.params.id);
    if (!config) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.json(config);
  });

  app.post("/api/class-configs", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertClassConfigSchema.parse(req.body);
      const config = await storage.createClassConfig(accountIdFor(req), data);
      res.status(201).json(config);
    } catch (error) {
      res.status(400).json({ error: "Invalid class config data" });
    }
  });

  app.patch("/api/class-configs/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const config = await storage.updateClassConfig(accountIdFor(req), req.params.id, req.body);
    if (!config) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.json(config);
  });

  app.delete("/api/class-configs/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deleteClassConfig(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.status(204).send();
  });

  app.delete("/api/class-configs", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    await storage.deleteAllClassConfigs(accountIdFor(req));
    res.status(204).send();
  });

  // Placements CRUD (protected)
  app.get("/api/placements", isAuthenticated, async (req, res) => {
    const placements = await storage.getPlacements(accountIdFor(req));
    res.json(placements);
  });

  app.get("/api/placements/:id", isAuthenticated, async (req, res) => {
    const placement = await storage.getPlacement(accountIdFor(req), req.params.id);
    if (!placement) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.json(placement);
  });

  app.post("/api/placements", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertPlacementSchema.parse(req.body);
      const placement = await storage.createPlacement(accountIdFor(req), data);
      res.status(201).json(placement);
    } catch (error) {
      res.status(400).json({ error: "Invalid placement data" });
    }
  });

  app.patch("/api/placements/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const placement = await storage.updatePlacement(accountIdFor(req), req.params.id, req.body);
    if (!placement) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.json(placement);
  });

  app.delete("/api/placements/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deletePlacement(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.status(204).send();
  });

  app.delete("/api/placements", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    await storage.deleteAllPlacements(accountIdFor(req));
    res.status(204).send();
  });

  // Move student (reassign to different class) (protected)
  app.post("/api/placements/move", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const { studentId, targetClassId } = req.body;
      
      const placements = await storage.getPlacements(accountIdFor(req));
      const existingPlacement = placements.find(p => p.studentId === studentId);
      
      if (existingPlacement) {
        const updated = await storage.updatePlacement(accountIdFor(req), existingPlacement.id, {
          classId: targetClassId,
        });
        
        // Check for conflicts after move
        const rules = await storage.getRules(accountIdFor(req));
        const conflicts = await checkConflicts(studentId, targetClassId, rules, placements.filter(p => p.id !== existingPlacement.id).concat(updated!));
        
        res.json({ placement: updated, conflicts });
      } else {
        const newPlacement = await storage.createPlacement(accountIdFor(req), {
          studentId,
          classId: targetClassId,
        });
        res.status(201).json({ placement: newPlacement, conflicts: [] });
      }
    } catch (error) {
      res.status(400).json({ error: "Failed to move student" });
    }
  });

  // Class generation algorithm (protected)
  app.post("/api/generate-classes", isAuthenticated, async (req, res) => {
    const context = getAccountContext(req);
    let reservedTrialUse = false;

    try {
      const { grade } = req.body;
      
      const allStudents = await storage.getStudents(accountIdFor(req));
      const students = grade ? allStudents.filter(s => s.grade === grade) : allStudents;
      const classConfigs = await storage.getClassConfigs(accountIdFor(req));
      const rules = await storage.getRules(accountIdFor(req));
      const characteristics = await storage.getCharacteristics(accountIdFor(req));

      const targetConfigs = grade ? classConfigs.filter(c => c.grade === grade) : classConfigs;

      if (targetConfigs.length === 0) {
        return res.status(400).json({ error: "No class configurations found for the specified grade" });
      }

      if (students.length === 0) {
        return res.status(400).json({ error: "No students found for the specified grade" });
      }

      if (characteristics.length > 50) {
        return res.status(400).json({ error: "A maximum of 50 active characteristics is supported" });
      }

      const reservation = await reserveTrialSolverGeneration(context);
      if (reservation === "expired" || reservation === "limit") {
        return res.status(403).json(solverAccessResponse(reservation));
      }
      reservedTrialUse = reservation === "reserved";

      // Clear existing placements for regeneration
      await storage.deleteAllPlacements(accountIdFor(req));

      // Generate balanced class assignments
      const result = await generateBalancedClasses(students, targetConfigs, rules, characteristics);

      // Save placements
      for (const generatedClass of result.classes) {
        for (const student of generatedClass.students) {
          await storage.createPlacement(accountIdFor(req), {
            studentId: student.id,
            classId: generatedClass.classConfig.id,
          });
        }
      }

      res.json({
        ...result,
        trial: {
          successfulSolverGenerations: context.successfulSolverGenerations,
          solverGenerationsLimit: 3,
          solverGenerationsRemaining: Math.max(0, 3 - context.successfulSolverGenerations),
        },
      });
    } catch (error) {
      if (reservedTrialUse) await releaseTrialSolverGeneration(context);
      console.error("Generation error:", error);
      res.status(500).json({ error: "Failed to generate classes" });
    }
  });

  // Boost optimization - suggest student swaps to improve balance (protected)
  app.post("/api/boost", isAuthenticated, async (req, res) => {
    try {
      const placements = await storage.getPlacements(accountIdFor(req));
      const students = await storage.getStudents(accountIdFor(req));
      const classConfigs = await storage.getClassConfigs(accountIdFor(req));
      const characteristics = await storage.getCharacteristics(accountIdFor(req));
      const rules = await storage.getRules(accountIdFor(req));

      if (placements.length === 0) {
        return res.status(400).json({ error: "No placements found. Generate classes first." });
      }

      // Calculate current balance scores for each class
      const classStudents: Map<string, Student[]> = new Map();
      for (const config of classConfigs) {
        const placementIds = placements.filter(p => p.classId === config.id).map(p => p.studentId);
        classStudents.set(config.id, students.filter(s => placementIds.includes(s.id)));
      }

      // Build separation constraints
      const separations: Map<string, Set<string>> = new Map();
      for (const rule of rules) {
        if (rule.type === "separate") {
          if (!separations.has(rule.studentId1)) separations.set(rule.studentId1, new Set());
          if (!separations.has(rule.studentId2)) separations.set(rule.studentId2, new Set());
          separations.get(rule.studentId1)!.add(rule.studentId2);
          separations.get(rule.studentId2)!.add(rule.studentId1);
        }
      }

      // Build pairing constraints 
      const pairings: Map<string, Set<string>> = new Map();
      for (const rule of rules) {
        if (rule.type === "pair") {
          if (!pairings.has(rule.studentId1)) pairings.set(rule.studentId1, new Set());
          if (!pairings.has(rule.studentId2)) pairings.set(rule.studentId2, new Set());
          pairings.get(rule.studentId1)!.add(rule.studentId2);
          pairings.get(rule.studentId2)!.add(rule.studentId1);
        }
      }

      const activeCharacteristics = [...characteristics]
        .filter((char) => !char.tagOnly)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, 50);
      const numericTargets = getNumericTargets(students, activeCharacteristics);

      // Calculate balance score for a class using the same category/numeric model as generation.
      const calculateClassBalance = (classStudentList: Student[]): number => {
        if (activeCharacteristics.length === 0 || classStudentList.length === 0) return 100;
        const totalScore = activeCharacteristics.reduce(
          (sum, char) => sum + calculateCharacteristicScore(classStudentList, char, numericTargets),
          0,
        );
        return totalScore / activeCharacteristics.length;
      };

      // Calculate overall balance
      const calculateOverallBalance = (): number => {
        let total = 0;
        let count = 0;
        for (const [_, classList] of classStudents) {
          total += calculateClassBalance(classList);
          count++;
        }
        return count > 0 ? total / count : 100;
      };

      // Check if a swap would violate rules
      const wouldViolateRules = (student: Student, targetClassId: string): boolean => {
        const targetStudents = classStudents.get(targetClassId) || [];
        
        // Check separation rules
        const mustSeparate = separations.get(student.id);
        if (mustSeparate) {
          for (const other of targetStudents) {
            if (mustSeparate.has(other.id)) return true;
          }
        }
        
        // Check if pairing partner would be left behind
        const mustPair = pairings.get(student.id);
        if (mustPair) {
          // Find student's current class
          const currentClassId = placements.find(p => p.studentId === student.id)?.classId;
          if (currentClassId) {
            const currentStudents = classStudents.get(currentClassId) || [];
            for (const partnerId of mustPair) {
              const partnerInCurrentClass = currentStudents.some(s => s.id === partnerId);
              const partnerInTargetClass = targetStudents.some(s => s.id === partnerId);
              if (partnerInCurrentClass && !partnerInTargetClass) {
                return true; // Would separate paired students
              }
            }
          }
        }
        
        return false;
      };

      const currentOverallBalance = calculateOverallBalance();
      const suggestions: BoostSuggestion[] = [];

      // Try swapping students between classes
      const classIds = Array.from(classStudents.keys());
      
      for (let i = 0; i < classIds.length; i++) {
        for (let j = i + 1; j < classIds.length; j++) {
          const class1Id = classIds[i];
          const class2Id = classIds[j];
          const class1Students = classStudents.get(class1Id) || [];
          const class2Students = classStudents.get(class2Id) || [];
          
          // Try each pair of students
          for (const student1 of class1Students) {
            for (const student2 of class2Students) {
              // Skip if either swap would violate rules
              if (wouldViolateRules(student1, class2Id) || wouldViolateRules(student2, class1Id)) {
                continue;
              }
              
              // Simulate the swap
              const newClass1 = class1Students.filter(s => s.id !== student1.id).concat([student2]);
              const newClass2 = class2Students.filter(s => s.id !== student2.id).concat([student1]);
              
              // Calculate new balance
              const tempClassStudents = new Map(classStudents);
              tempClassStudents.set(class1Id, newClass1);
              tempClassStudents.set(class2Id, newClass2);
              
              let newTotal = 0;
              for (const [cid, classList] of tempClassStudents) {
                newTotal += calculateClassBalance(classList);
              }
              const newOverallBalance = newTotal / classIds.length;
              
              // Only suggest swaps that improve balance
              const improvement = newOverallBalance - currentOverallBalance;
              if (improvement > 0.5) { // Minimum 0.5% improvement
                suggestions.push({
                  id: `swap-${student1.id}-${student2.id}`,
                  type: "swap",
                  student1: {
                    id: student1.id,
                    name: `${student1.firstName} ${student1.lastName}`,
                    currentClass: classConfigs.find(c => c.id === class1Id)?.name || class1Id,
                    currentClassId: class1Id,
                  },
                  student2: {
                    id: student2.id,
                    name: `${student2.firstName} ${student2.lastName}`,
                    currentClass: classConfigs.find(c => c.id === class2Id)?.name || class2Id,
                    currentClassId: class2Id,
                  },
                  improvement: Math.round(improvement * 10) / 10,
                  reason: `Swapping these students would improve overall balance by ${improvement.toFixed(1)}%`,
                });
              }
            }
          }
        }
      }

      // Sort suggestions by improvement (highest first)
      suggestions.sort((a, b) => b.improvement - a.improvement);

      // Return top 10 suggestions
      res.json({
        currentBalance: Math.round(currentOverallBalance * 10) / 10,
        suggestions: suggestions.slice(0, 10),
      });
    } catch (error) {
      console.error("Boost error:", error);
      res.status(500).json({ error: "Failed to generate optimization suggestions" });
    }
  });

  // Apply a boost suggestion (swap two students) (protected)
  app.post("/api/boost/apply", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const { student1Id, student1NewClassId, student2Id, student2NewClassId } = req.body;
      
      const placements = await storage.getPlacements(accountIdFor(req));
      
      const placement1 = placements.find(p => p.studentId === student1Id);
      const placement2 = placements.find(p => p.studentId === student2Id);
      
      if (!placement1 || !placement2) {
        return res.status(404).json({ error: "One or both students not found in placements" });
      }
      
      // Update both placements
      await storage.updatePlacement(accountIdFor(req), placement1.id, { classId: student1NewClassId });
      await storage.updatePlacement(accountIdFor(req), placement2.id, { classId: student2NewClassId });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to apply boost suggestion" });
    }
  });

  // Surveys CRUD (protected)
  app.get("/api/surveys", isAuthenticated, async (req, res) => {
    const surveys = await storage.getSurveys(accountIdFor(req));
    res.json(surveys);
  });

  app.get("/api/surveys/:id", isAuthenticated, async (req, res) => {
    const survey = await storage.getSurvey(accountIdFor(req), req.params.id);
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.json(survey);
  });

  app.get("/api/surveys/student/:studentId", isAuthenticated, async (req, res) => {
    const surveys = await storage.getSurveysByStudent(accountIdFor(req), req.params.studentId);
    res.json(surveys);
  });

  app.post("/api/surveys", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertSurveySchema.parse(req.body);
      const survey = await storage.createSurvey(accountIdFor(req), data);
      res.status(201).json(survey);
    } catch (error) {
      res.status(400).json({ error: "Invalid survey data" });
    }
  });

  app.patch("/api/surveys/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const survey = await storage.updateSurvey(accountIdFor(req), req.params.id, req.body);
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.json(survey);
  });

  app.delete("/api/surveys/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deleteSurvey(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.status(204).send();
  });

  // Scenarios CRUD (protected)
  app.get("/api/scenarios", isAuthenticated, async (req, res) => {
    const scenarios = await storage.getScenarios(accountIdFor(req));
    res.json(scenarios);
  });

  app.get("/api/scenarios/:id", isAuthenticated, async (req, res) => {
    const scenario = await storage.getScenario(accountIdFor(req), req.params.id);
    if (!scenario) {
      return res.status(404).json({ error: "Scenario not found" });
    }
    res.json(scenario);
  });

  app.post("/api/scenarios", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      // Get current placements and calculate balance metrics
      const placements = await storage.getPlacements(accountIdFor(req));
      const students = await storage.getStudents(accountIdFor(req));
      const classConfigs = await storage.getClassConfigs(accountIdFor(req));
      const characteristics = await storage.getCharacteristics(accountIdFor(req));

      if (placements.length === 0) {
        return res.status(400).json({ error: "No placements found. Generate classes first." });
      }

      // Calculate balance scores for each class using the same category/numeric model as generation.
      const classBalances: { classId: string; className: string; balance: number }[] = [];
      let totalBalance = 0;
      const activeCharacteristics = [...characteristics]
        .filter((char) => !char.tagOnly)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, 50);
      const numericTargets = getNumericTargets(students, activeCharacteristics);

      for (const config of classConfigs) {
        const classPlacementStudentIds = placements.filter(p => p.classId === config.id).map(p => p.studentId);
        const classStudents = students.filter(s => classPlacementStudentIds.includes(s.id));

        let classScore = 0;
        if (classStudents.length === 0) {
          classScore = 0;
        } else if (activeCharacteristics.length > 0) {
          classScore = activeCharacteristics.reduce(
            (sum, char) => sum + calculateCharacteristicScore(classStudents, char, numericTargets),
            0,
          ) / activeCharacteristics.length;
        } else {
          classScore = 100;
        }

        classBalances.push({
          classId: config.id,
          className: config.name,
          balance: Math.round(classScore * 10) / 10,
        });
        totalBalance += classScore;
      }

      const overallBalance = classBalances.length > 0 ? Math.round((totalBalance / classBalances.length) * 10) / 10 : 0;

      const scenarioData = {
        name: req.body.name,
        createdAt: new Date().toISOString(),
        placements: placements.map(p => ({ studentId: p.studentId, classId: p.classId })),
        balanceMetrics: { overallBalance, classBalances },
      };

      const data = insertScenarioSchema.parse(scenarioData);
      const scenario = await storage.createScenario(accountIdFor(req), data);
      res.status(201).json(scenario);
    } catch (error) {
      console.error("Scenario creation error:", error);
      res.status(400).json({ error: "Invalid scenario data" });
    }
  });

  app.delete("/api/scenarios/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    const deleted = await storage.deleteScenario(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Scenario not found" });
    }
    res.status(204).send();
  });

  // Restore placements from a scenario (protected)
  app.post("/api/scenarios/:id/restore", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const scenario = await storage.getScenario(accountIdFor(req), req.params.id);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const placementsToRestore = scenario.placements || [];
      if (placementsToRestore.length === 0) {
        return res.status(400).json({ error: "Scenario has no placements to restore" });
      }

      // Clear current placements
      await storage.deleteAllPlacements(accountIdFor(req));

      // Restore placements from scenario
      for (const placement of placementsToRestore) {
        await storage.createPlacement(accountIdFor(req), {
          studentId: placement.studentId,
          classId: placement.classId,
        });
      }

      res.json({ success: true, placementsRestored: placementsToRestore.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to restore scenario" });
    }
  });

  // Teachers CRUD (protected)
  app.get("/api/teachers", isAuthenticated, async (req, res) => {
    const teachers = await storage.getTeachers(accountIdFor(req));
    res.json(teachers);
  });

  app.get("/api/teachers/:id", isAuthenticated, async (req, res) => {
    const teacher = await storage.getTeacher(accountIdFor(req), req.params.id);
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }
    res.json(teacher);
  });

  app.post("/api/teachers", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const data = insertTeacherSchema.parse(req.body);
      const teacher = await storage.createTeacher(accountIdFor(req), data);
      res.status(201).json(teacher);
    } catch (error) {
      res.status(400).json({ error: "Invalid teacher data" });
    }
  });

  app.patch("/api/teachers/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (isDemoWorkspace(req) && hasAnyField(req.body, ["firstName", "lastName", "email"])) {
      return res.status(403).json({ error: "Teacher identity fields are disabled in demo workspaces" });
    }
    const teacher = await storage.updateTeacher(accountIdFor(req), req.params.id, req.body);
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }
    res.json(teacher);
  });

  app.delete("/api/teachers/:id", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (isDemoWorkspace(req)) {
      const existingTeachers = await storage.getTeachers(accountIdFor(req));
      if (existingTeachers.length <= 1) {
        return res.status(403).json({ error: "Deleting all teachers is disabled in demo workspaces" });
      }
    }
    const deleted = await storage.deleteTeacher(accountIdFor(req), req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Teacher not found" });
    }
    res.status(204).send();
  });

  app.post("/api/teachers/bulk-import", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    if (blockDemoWorkspace(req, res, "Teacher import")) return;
    try {
      const { teachers } = req.body;
      if (!Array.isArray(teachers)) {
        return res.status(400).json({ error: "teachers must be an array" });
      }
      const result = await storage.bulkImportTeachers(accountIdFor(req), teachers);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to import teachers" });
    }
  });

  app.post("/api/teachers/bulk-delete", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }
      if (isDemoWorkspace(req)) {
        const existingTeachers = await storage.getTeachers(accountIdFor(req));
        const requestedIds = new Set(ids);
        if (existingTeachers.length > 0 && existingTeachers.every((teacher) => requestedIds.has(teacher.id))) {
          return res.status(403).json({ error: "Deleting all teachers is disabled in demo workspaces" });
        }
      }
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await storage.deleteTeacher(accountIdFor(req), id);
        if (deleted) deletedCount++;
      }
      res.json({ count: deletedCount });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete teachers" });
    }
  });

  // App Settings routes
  app.get("/api/app-settings", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getAppSettings(accountIdFor(req));
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch app settings" });
    }
  });

  app.put("/api/app-settings", isAuthenticated, requireWritableWorkspace, async (req, res) => {
    try {
      const settings = await storage.updateAppSettings(accountIdFor(req), req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating app settings:", error);
      res.status(400).json({ error: "Failed to update settings" });
    }
  });

  return httpServer;
}

// Boost suggestion interface
interface BoostSuggestion {
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

// Helper function to check conflicts for a student placement
async function checkConflicts(
  studentId: string,
  classId: string,
  rules: Rule[],
  placements: { studentId: string; classId: string }[]
): Promise<ConflictWarning[]> {
  const conflicts: ConflictWarning[] = [];
  const classmates = placements.filter(p => p.classId === classId && p.studentId !== studentId);
  
  for (const rule of rules) {
    const isStudent1 = rule.studentId1 === studentId;
    const isStudent2 = rule.studentId2 === studentId;
    
    if (!isStudent1 && !isStudent2) continue;
    
    const otherId = isStudent1 ? rule.studentId2 : rule.studentId1;
    const otherInSameClass = classmates.some(p => p.studentId === otherId);
    
    if (rule.type === "separate" && otherInSameClass) {
      conflicts.push({
        type: "separation",
        message: `Students should be separated: ${rule.reason || "No reason given"}`,
        studentIds: [rule.studentId1, rule.studentId2],
        ruleId: rule.id,
      });
    }
    
    if (rule.type === "pair" && !otherInSameClass) {
      conflicts.push({
        type: "pairing",
        message: `Students should be together: ${rule.reason || "No reason given"}`,
        studentIds: [rule.studentId1, rule.studentId2],
        ruleId: rule.id,
      });
    }
  }
  
  return conflicts;
}

const isNumericCharacteristic = (char: Characteristic) => char.type === "scale" || char.type === "percentage";

const getStudentCharacteristicValue = (student: Student, char: Characteristic) =>
  ((student.characteristics || {}) as Record<string, string | string[]>)[char.name];

const parseCharacteristicNumber = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return null;
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const getNumericTargets = (students: Student[], characteristics: Characteristic[]) => {
  const targets = new Map<string, { average: number; range: number }>();
  for (const char of characteristics) {
    if (!isNumericCharacteristic(char)) continue;
    const values = students
      .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
      .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
      .filter((value): value is number => value !== null);
    if (values.length === 0) continue;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    targets.set(char.id, { average, range: Math.max(1, max - min) });
  }
  return targets;
};

const calculateCharacteristicScore = (
  classStudents: Student[],
  char: Characteristic,
  numericTargets: Map<string, { average: number; range: number }>,
) => {
  if (classStudents.length === 0) return 100;

  if (isNumericCharacteristic(char)) {
    const values = classStudents
      .filter((student) => isCharacteristicApplicableToGrade(char, student.grade))
      .map((student) => parseCharacteristicNumber(getStudentCharacteristicValue(student, char)))
      .filter((value): value is number => value !== null);
    const target = numericTargets.get(char.id);
    if (!target || values.length === 0) return 100;
    const classAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.abs(classAverage - target.average) / target.range;
    return Math.max(0, Math.round(100 - Math.min(1, deviation) * 100));
  }

  const distribution: Record<string, number> = {};
  for (const student of classStudents) {
    if (!isCharacteristicApplicableToGrade(char, student.grade)) continue;
    const values = characteristicValueToArray(getStudentCharacteristicValue(student, char));
    for (const value of values) {
      distribution[value] = (distribution[value] || 0) + 1;
    }
  }

  const values = Object.values(distribution);
  if (values.length <= 1) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const maxVariance = Math.max(1, Math.pow(classStudents.length, 2));
  return Math.max(0, Math.round(100 - (variance / maxVariance) * 100));
};

const calculateCandidateBalanceScore = (
  candidateStudents: Student[],
  char: Characteristic,
  numericTargets: Map<string, { average: number; range: number }>,
) => {
  const priority = char.priority || 1; // Priority is the balancing weight: higher priority has more influence.
  const score = calculateCharacteristicScore(candidateStudents, char, numericTargets);
  return (score - 100) * priority;
};

// Class generation algorithm with balancing
async function generateBalancedClasses(
  students: Student[],
  classConfigs: ClassConfig[],
  rules: Rule[],
  characteristics: Characteristic[]
): Promise<ClassGenerationResult> {
  const activeCharacteristics = [...characteristics]
    .filter((char) => !char.tagOnly)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 50);
  const numericTargets = getNumericTargets(students, activeCharacteristics);
  const numClasses = classConfigs.length;
  const classAssignments: Map<string, Student[]> = new Map();
  
  // Initialize empty classes
  classConfigs.forEach(config => {
    classAssignments.set(config.id, []);
  });

  // Build pairing and separation maps
  const pairings: Map<string, Set<string>> = new Map();
  const separations: Map<string, Set<string>> = new Map();
  
  for (const rule of rules) {
    if (rule.type === "pair") {
      if (!pairings.has(rule.studentId1)) pairings.set(rule.studentId1, new Set());
      if (!pairings.has(rule.studentId2)) pairings.set(rule.studentId2, new Set());
      pairings.get(rule.studentId1)!.add(rule.studentId2);
      pairings.get(rule.studentId2)!.add(rule.studentId1);
    } else if (rule.type === "separate") {
      if (!separations.has(rule.studentId1)) separations.set(rule.studentId1, new Set());
      if (!separations.has(rule.studentId2)) separations.set(rule.studentId2, new Set());
      separations.get(rule.studentId1)!.add(rule.studentId2);
      separations.get(rule.studentId2)!.add(rule.studentId1);
    }
  }

  // Group students by pairing requirements first
  const pairingGroups: Student[][] = [];
  const processedStudents = new Set<string>();

  for (const student of students) {
    if (processedStudents.has(student.id)) continue;
    
    const group: Student[] = [student];
    processedStudents.add(student.id);
    
    const toProcess = [student.id];
    while (toProcess.length > 0) {
      const currentId = toProcess.pop()!;
      const pairedWith = pairings.get(currentId);
      if (pairedWith) {
        for (const pairedId of pairedWith) {
          if (!processedStudents.has(pairedId)) {
            const pairedStudent = students.find(s => s.id === pairedId);
            if (pairedStudent) {
              group.push(pairedStudent);
              processedStudents.add(pairedId);
              toProcess.push(pairedId);
            }
          }
        }
      }
    }
    
    pairingGroups.push(group);
  }

  // Sort groups by size (larger groups first) to handle constraints early
  pairingGroups.sort((a, b) => b.length - a.length);

  // Assign groups to classes using a balanced approach
  const classConfigList = Array.from(classConfigs);
  
  for (const group of pairingGroups) {
    // Find the best class for this group
    let bestClassId = classConfigList[0].id;
    let bestScore = -Infinity;
    
    for (const config of classConfigList) {
      const currentStudents = classAssignments.get(config.id)!;
      
      // Check capacity
      if (currentStudents.length + group.length > (config.capacity || 30)) {
        continue;
      }
      
      // Check separations
      let separationViolations = 0;
      for (const student of group) {
        const mustSeparate = separations.get(student.id);
        if (mustSeparate) {
          for (const existing of currentStudents) {
            if (mustSeparate.has(existing.id)) {
              separationViolations++;
            }
          }
        }
      }
      
      // Calculate balance score based on active characteristics.
      // Category responses are balanced by distribution; scale/percentage values are balanced numerically.
      let balanceScore = 0;
      const candidateStudents = [...currentStudents, ...group];
      for (const char of activeCharacteristics) {
        balanceScore += calculateCandidateBalanceScore(candidateStudents, char, numericTargets);
      }
      
      // Prefer smaller classes to balance sizes
      const sizeBalance = -(currentStudents.length + group.length);
      
      // Calculate total score
      const totalScore = balanceScore + sizeBalance * 10 - separationViolations * 1000;
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestClassId = config.id;
      }
    }
    
    // Assign group to best class
    const targetClass = classAssignments.get(bestClassId)!;
    targetClass.push(...group);
  }

  // Generate conflict warnings
  const conflicts: ConflictWarning[] = [];
  
  for (const [classId, classStudents] of classAssignments) {
    const config = classConfigs.find(c => c.id === classId)!;
    
    // Check capacity
    if (classStudents.length > (config.capacity || 30)) {
      conflicts.push({
        type: "capacity",
        message: `${config.name} exceeds capacity (${classStudents.length}/${config.capacity || 30})`,
        studentIds: classStudents.map(s => s.id),
      });
    }
    
    // Check separation violations
    for (let i = 0; i < classStudents.length; i++) {
      const student = classStudents[i];
      const mustSeparate = separations.get(student.id);
      if (mustSeparate) {
        for (let j = i + 1; j < classStudents.length; j++) {
          if (mustSeparate.has(classStudents[j].id)) {
            const rule = rules.find(
              r => r.type === "separate" &&
                ((r.studentId1 === student.id && r.studentId2 === classStudents[j].id) ||
                 (r.studentId2 === student.id && r.studentId1 === classStudents[j].id))
            );
            conflicts.push({
              type: "separation",
              message: `Separation rule violated: ${rule?.reason || "Students should be in different classes"}`,
              studentIds: [student.id, classStudents[j].id],
              ruleId: rule?.id,
            });
          }
        }
      }
    }
  }

  // Check pairing violations (students who should be together but aren't)
  for (const rule of rules) {
    if (rule.type === "pair") {
      let student1Class: string | null = null;
      let student2Class: string | null = null;
      
      for (const [classId, classStudents] of classAssignments) {
        if (classStudents.some(s => s.id === rule.studentId1)) student1Class = classId;
        if (classStudents.some(s => s.id === rule.studentId2)) student2Class = classId;
      }
      
      if (student1Class && student2Class && student1Class !== student2Class) {
        conflicts.push({
          type: "pairing",
          message: `Pairing rule violated: ${rule.reason || "Students should be in the same class"}`,
          studentIds: [rule.studentId1, rule.studentId2],
          ruleId: rule.id,
        });
      }
    }
  }

  // Build result
  const generatedClasses: GeneratedClass[] = classConfigs.map(config => {
    const classStudents = classAssignments.get(config.id) || [];
    
    // Calculate balance scores for each active characteristic using the same scoring model as generation.
    const balanceScores: Record<string, number> = {};
    for (const char of activeCharacteristics) {
      balanceScores[char.id] = calculateCharacteristicScore(classStudents, char, numericTargets);
    }
    
    return {
      classConfig: config,
      students: classStudents,
      balanceScores,
    };
  });

  // Calculate overall balance
  let totalScore = 0;
  let scoreCount = 0;
  for (const gc of generatedClasses) {
    for (const score of Object.values(gc.balanceScores)) {
      totalScore += score;
      scoreCount++;
    }
  }
  const overallBalance = scoreCount > 0 ? totalScore / scoreCount : 100;

  return {
    classes: generatedClasses,
    overallBalance,
    conflicts,
  };
}
