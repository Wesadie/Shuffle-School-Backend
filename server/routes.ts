import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertStudentSchema,
  insertRuleSchema,
  insertCharacteristicSchema,
  insertClassConfigSchema,
  insertPlacementSchema,
  insertSurveySchema,
  insertScenarioSchema,
  type Student,
  type Rule,
  type ClassConfig,
  type Characteristic,
  type ConflictWarning,
  type ClassGenerationResult,
  type GeneratedClass,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Students CRUD
  app.get("/api/students", async (req, res) => {
    const students = await storage.getStudents();
    res.json(students);
  });

  app.get("/api/students/:id", async (req, res) => {
    const student = await storage.getStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  });

  app.post("/api/students", async (req, res) => {
    try {
      const data = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(data);
      res.status(201).json(student);
    } catch (error) {
      res.status(400).json({ error: "Invalid student data" });
    }
  });

  app.patch("/api/students/:id", async (req, res) => {
    const student = await storage.updateStudent(req.params.id, req.body);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  });

  app.delete("/api/students/:id", async (req, res) => {
    const deleted = await storage.deleteStudent(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.status(204).send();
  });

  app.post("/api/students/bulk-import", async (req, res) => {
    try {
      const { students } = req.body;
      if (!Array.isArray(students)) {
        return res.status(400).json({ error: "students must be an array" });
      }
      const result = await storage.bulkImportStudents(students);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: "Failed to import students" });
    }
  });

  app.delete("/api/students", async (req, res) => {
    await storage.deleteAllStudents();
    res.status(204).send();
  });

  app.post("/api/students/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await storage.deleteStudent(id);
        if (deleted) deletedCount++;
      }
      res.json({ count: deletedCount });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete students" });
    }
  });

  // Rules CRUD
  app.get("/api/rules", async (req, res) => {
    const rules = await storage.getRules();
    res.json(rules);
  });

  app.get("/api/rules/:id", async (req, res) => {
    const rule = await storage.getRule(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  });

  app.post("/api/rules", async (req, res) => {
    try {
      const data = insertRuleSchema.parse(req.body);
      const rule = await storage.createRule(data);
      res.status(201).json(rule);
    } catch (error) {
      res.status(400).json({ error: "Invalid rule data" });
    }
  });

  app.patch("/api/rules/:id", async (req, res) => {
    const rule = await storage.updateRule(req.params.id, req.body);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  });

  app.delete("/api/rules/:id", async (req, res) => {
    const deleted = await storage.deleteRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.status(204).send();
  });

  // Characteristics CRUD
  app.get("/api/characteristics", async (req, res) => {
    const characteristics = await storage.getCharacteristics();
    res.json(characteristics);
  });

  app.get("/api/characteristics/:id", async (req, res) => {
    const characteristic = await storage.getCharacteristic(req.params.id);
    if (!characteristic) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.json(characteristic);
  });

  app.post("/api/characteristics", async (req, res) => {
    try {
      const data = insertCharacteristicSchema.parse(req.body);
      const characteristic = await storage.createCharacteristic(data);
      res.status(201).json(characteristic);
    } catch (error) {
      res.status(400).json({ error: "Invalid characteristic data" });
    }
  });

  app.patch("/api/characteristics/:id", async (req, res) => {
    const characteristic = await storage.updateCharacteristic(req.params.id, req.body);
    if (!characteristic) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.json(characteristic);
  });

  app.delete("/api/characteristics/:id", async (req, res) => {
    const deleted = await storage.deleteCharacteristic(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Characteristic not found" });
    }
    res.status(204).send();
  });

  app.post("/api/characteristics/reorder", async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: "orderedIds must be an array" });
      }
      const totalCount = orderedIds.length;
      for (let i = 0; i < orderedIds.length; i++) {
        const priority = totalCount - i;
        await storage.updateCharacteristic(orderedIds[i], { priority });
      }
      const characteristics = await storage.getCharacteristics();
      res.json(characteristics);
    } catch (error) {
      res.status(400).json({ error: "Failed to reorder characteristics" });
    }
  });

  // Class Configs CRUD
  app.get("/api/class-configs", async (req, res) => {
    const configs = await storage.getClassConfigs();
    res.json(configs);
  });

  app.get("/api/class-configs/:id", async (req, res) => {
    const config = await storage.getClassConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.json(config);
  });

  app.post("/api/class-configs", async (req, res) => {
    try {
      const data = insertClassConfigSchema.parse(req.body);
      const config = await storage.createClassConfig(data);
      res.status(201).json(config);
    } catch (error) {
      res.status(400).json({ error: "Invalid class config data" });
    }
  });

  app.patch("/api/class-configs/:id", async (req, res) => {
    const config = await storage.updateClassConfig(req.params.id, req.body);
    if (!config) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.json(config);
  });

  app.delete("/api/class-configs/:id", async (req, res) => {
    const deleted = await storage.deleteClassConfig(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Class config not found" });
    }
    res.status(204).send();
  });

  app.delete("/api/class-configs", async (req, res) => {
    await storage.deleteAllClassConfigs();
    res.status(204).send();
  });

  // Placements CRUD
  app.get("/api/placements", async (req, res) => {
    const placements = await storage.getPlacements();
    res.json(placements);
  });

  app.get("/api/placements/:id", async (req, res) => {
    const placement = await storage.getPlacement(req.params.id);
    if (!placement) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.json(placement);
  });

  app.post("/api/placements", async (req, res) => {
    try {
      const data = insertPlacementSchema.parse(req.body);
      const placement = await storage.createPlacement(data);
      res.status(201).json(placement);
    } catch (error) {
      res.status(400).json({ error: "Invalid placement data" });
    }
  });

  app.patch("/api/placements/:id", async (req, res) => {
    const placement = await storage.updatePlacement(req.params.id, req.body);
    if (!placement) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.json(placement);
  });

  app.delete("/api/placements/:id", async (req, res) => {
    const deleted = await storage.deletePlacement(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Placement not found" });
    }
    res.status(204).send();
  });

  app.delete("/api/placements", async (req, res) => {
    await storage.deleteAllPlacements();
    res.status(204).send();
  });

  // Move student (reassign to different class)
  app.post("/api/placements/move", async (req, res) => {
    try {
      const { studentId, targetClassId } = req.body;
      
      const placements = await storage.getPlacements();
      const existingPlacement = placements.find(p => p.studentId === studentId);
      
      if (existingPlacement) {
        const updated = await storage.updatePlacement(existingPlacement.id, {
          classId: targetClassId,
        });
        
        // Check for conflicts after move
        const rules = await storage.getRules();
        const conflicts = await checkConflicts(studentId, targetClassId, rules, placements.filter(p => p.id !== existingPlacement.id).concat(updated!));
        
        res.json({ placement: updated, conflicts });
      } else {
        const newPlacement = await storage.createPlacement({
          studentId,
          classId: targetClassId,
        });
        res.status(201).json({ placement: newPlacement, conflicts: [] });
      }
    } catch (error) {
      res.status(400).json({ error: "Failed to move student" });
    }
  });

  // Class generation algorithm
  app.post("/api/generate-classes", async (req, res) => {
    try {
      const { grade } = req.body;
      
      const allStudents = await storage.getStudents();
      const students = grade ? allStudents.filter(s => s.grade === grade) : allStudents;
      const classConfigs = await storage.getClassConfigs();
      const rules = await storage.getRules();
      const characteristics = await storage.getCharacteristics();

      const targetConfigs = grade ? classConfigs.filter(c => c.grade === grade) : classConfigs;

      if (targetConfigs.length === 0) {
        return res.status(400).json({ error: "No class configurations found for the specified grade" });
      }

      if (students.length === 0) {
        return res.status(400).json({ error: "No students found for the specified grade" });
      }

      // Clear existing placements for regeneration
      await storage.deleteAllPlacements();

      // Generate balanced class assignments
      const result = await generateBalancedClasses(students, targetConfigs, rules, characteristics);

      // Save placements
      for (const generatedClass of result.classes) {
        for (const student of generatedClass.students) {
          await storage.createPlacement({
            studentId: student.id,
            classId: generatedClass.classConfig.id,
          });
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({ error: "Failed to generate classes" });
    }
  });

  // Boost optimization - suggest student swaps to improve balance
  app.post("/api/boost", async (req, res) => {
    try {
      const placements = await storage.getPlacements();
      const students = await storage.getStudents();
      const classConfigs = await storage.getClassConfigs();
      const characteristics = await storage.getCharacteristics();
      const rules = await storage.getRules();

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

      // Calculate balance score for a class
      const calculateClassBalance = (classStudentList: Student[]): number => {
        if (characteristics.length === 0 || classStudentList.length === 0) return 100;
        
        let totalScore = 0;
        for (const char of characteristics) {
          const distribution: Record<string, number> = {};
          for (const s of classStudentList) {
            const val = s.characteristics?.[char.name] || "unknown";
            distribution[val] = (distribution[val] || 0) + 1;
          }
          
          const values = Object.values(distribution);
          if (values.length > 1) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
            const maxVariance = Math.pow(classStudentList.length, 2);
            totalScore += Math.max(0, 100 - (variance / maxVariance) * 100);
          } else {
            totalScore += 100;
          }
        }
        return totalScore / characteristics.length;
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

  // Apply a boost suggestion (swap two students)
  app.post("/api/boost/apply", async (req, res) => {
    try {
      const { student1Id, student1NewClassId, student2Id, student2NewClassId } = req.body;
      
      const placements = await storage.getPlacements();
      
      const placement1 = placements.find(p => p.studentId === student1Id);
      const placement2 = placements.find(p => p.studentId === student2Id);
      
      if (!placement1 || !placement2) {
        return res.status(404).json({ error: "One or both students not found in placements" });
      }
      
      // Update both placements
      await storage.updatePlacement(placement1.id, { classId: student1NewClassId });
      await storage.updatePlacement(placement2.id, { classId: student2NewClassId });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to apply boost suggestion" });
    }
  });

  // Surveys CRUD
  app.get("/api/surveys", async (req, res) => {
    const surveys = await storage.getSurveys();
    res.json(surveys);
  });

  app.get("/api/surveys/:id", async (req, res) => {
    const survey = await storage.getSurvey(req.params.id);
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.json(survey);
  });

  app.get("/api/surveys/student/:studentId", async (req, res) => {
    const surveys = await storage.getSurveysByStudent(req.params.studentId);
    res.json(surveys);
  });

  app.post("/api/surveys", async (req, res) => {
    try {
      const data = insertSurveySchema.parse(req.body);
      const survey = await storage.createSurvey(data);
      res.status(201).json(survey);
    } catch (error) {
      res.status(400).json({ error: "Invalid survey data" });
    }
  });

  app.patch("/api/surveys/:id", async (req, res) => {
    const survey = await storage.updateSurvey(req.params.id, req.body);
    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.json(survey);
  });

  app.delete("/api/surveys/:id", async (req, res) => {
    const deleted = await storage.deleteSurvey(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Survey not found" });
    }
    res.status(204).send();
  });

  // Scenarios CRUD
  app.get("/api/scenarios", async (req, res) => {
    const scenarios = await storage.getScenarios();
    res.json(scenarios);
  });

  app.get("/api/scenarios/:id", async (req, res) => {
    const scenario = await storage.getScenario(req.params.id);
    if (!scenario) {
      return res.status(404).json({ error: "Scenario not found" });
    }
    res.json(scenario);
  });

  app.post("/api/scenarios", async (req, res) => {
    try {
      // Get current placements and calculate balance metrics
      const placements = await storage.getPlacements();
      const students = await storage.getStudents();
      const classConfigs = await storage.getClassConfigs();
      const characteristics = await storage.getCharacteristics();

      if (placements.length === 0) {
        return res.status(400).json({ error: "No placements found. Generate classes first." });
      }

      // Calculate balance scores for each class
      const classBalances: { classId: string; className: string; balance: number }[] = [];
      let totalBalance = 0;

      for (const config of classConfigs) {
        const classPlacementStudentIds = placements.filter(p => p.classId === config.id).map(p => p.studentId);
        const classStudents = students.filter(s => classPlacementStudentIds.includes(s.id));

        let classScore = 0;
        if (classStudents.length === 0) {
          classScore = 0;
        } else if (characteristics.length > 0) {
          let charTotal = 0;
          for (const char of characteristics) {
            const distribution: Record<string, number> = {};
            for (const s of classStudents) {
              const val = s.characteristics?.[char.name] || "unknown";
              distribution[val] = (distribution[val] || 0) + 1;
            }

            const values = Object.values(distribution);
            if (values.length > 1) {
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
              const maxVariance = Math.pow(classStudents.length, 2);
              charTotal += Math.max(0, 100 - (variance / maxVariance) * 100);
            } else {
              charTotal += 100;
            }
          }
          classScore = charTotal / characteristics.length;
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
      const scenario = await storage.createScenario(data);
      res.status(201).json(scenario);
    } catch (error) {
      console.error("Scenario creation error:", error);
      res.status(400).json({ error: "Invalid scenario data" });
    }
  });

  app.delete("/api/scenarios/:id", async (req, res) => {
    const deleted = await storage.deleteScenario(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Scenario not found" });
    }
    res.status(204).send();
  });

  // Restore placements from a scenario
  app.post("/api/scenarios/:id/restore", async (req, res) => {
    try {
      const scenario = await storage.getScenario(req.params.id);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const placementsToRestore = scenario.placements || [];
      if (placementsToRestore.length === 0) {
        return res.status(400).json({ error: "Scenario has no placements to restore" });
      }

      // Clear current placements
      await storage.deleteAllPlacements();

      // Restore placements from scenario
      for (const placement of placementsToRestore) {
        await storage.createPlacement({
          studentId: placement.studentId,
          classId: placement.classId,
        });
      }

      res.json({ success: true, placementsRestored: placementsToRestore.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to restore scenario" });
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

// Class generation algorithm with balancing
async function generateBalancedClasses(
  students: Student[],
  classConfigs: ClassConfig[],
  rules: Rule[],
  characteristics: Characteristic[]
): Promise<ClassGenerationResult> {
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
      
      // Calculate balance score based on characteristics
      let balanceScore = 0;
      for (const char of characteristics) {
        const charName = char.name;
        const priority = char.priority || 1;
        
        // Count distribution in this class
        const distribution: Record<string, number> = {};
        for (const s of currentStudents) {
          const val = s.characteristics?.[charName] || "unknown";
          distribution[val] = (distribution[val] || 0) + 1;
        }
        for (const s of group) {
          const val = s.characteristics?.[charName] || "unknown";
          distribution[val] = (distribution[val] || 0) + 1;
        }
        
        // Lower variance = better balance
        const values = Object.values(distribution);
        if (values.length > 0) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
          balanceScore -= variance * priority;
        }
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
    
    // Calculate balance scores for each characteristic
    const balanceScores: Record<string, number> = {};
    for (const char of characteristics) {
      const distribution: Record<string, number> = {};
      for (const s of classStudents) {
        const val = s.characteristics?.[char.name] || "unknown";
        distribution[val] = (distribution[val] || 0) + 1;
      }
      
      const values = Object.values(distribution);
      if (values.length > 1) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const maxVariance = Math.pow(classStudents.length, 2);
        balanceScores[char.id] = Math.max(0, 100 - (variance / maxVariance) * 100);
      } else {
        balanceScores[char.id] = 100;
      }
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
