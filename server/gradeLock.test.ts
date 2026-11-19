import assert from "node:assert/strict";
import test from "node:test";
import { db, pool } from "./db";
import { gradeLocks, gradeSnapshots, accounts, profiles, students, classConfigs, placements, teachers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DatabaseStorage } from "./storage";
import { getStudentTargetGrade, normalizeGradeValue } from "@shared/grades";

const TEST_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const TEST_USER_ID = "00000000-0000-4000-8000-000000000002";

async function cleanupTestData() {
  await db.delete(gradeSnapshots).where(eq(gradeSnapshots.accountId, TEST_ACCOUNT_ID));
  await db.delete(gradeLocks).where(eq(gradeLocks.accountId, TEST_ACCOUNT_ID));
  await db.delete(placements).where(eq(placements.accountId, TEST_ACCOUNT_ID));
  await db.delete(students).where(eq(students.accountId, TEST_ACCOUNT_ID));
  await db.delete(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
  await db.delete(teachers).where(eq(teachers.accountId, TEST_ACCOUNT_ID));
  await db.delete(profiles).where(eq(profiles.id, TEST_USER_ID));
  await db.delete(accounts).where(eq(accounts.id, TEST_ACCOUNT_ID));
}

async function setupTestData() {
  await cleanupTestData();

  // Create test account
  await db.insert(accounts).values({
    id: TEST_ACCOUNT_ID,
    name: "Test School",
    status: "active",
    workspaceMode: "live",
    solverRevision: 0,
  });

  // Create test user profile
  await db.insert(profiles).values({
    id: TEST_USER_ID,
    email: "test@example.com",
    firstName: "Test",
    lastName: "Admin",
  });

  // Create test class configs for grades 1 and 2
  await db.insert(classConfigs).values([
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, name: "1A", grade: "1", capacity: 30 },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, name: "1B", grade: "1", capacity: 30 },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, name: "2A", grade: "2", capacity: 30 },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, name: "2B", grade: "2", capacity: 30 },
  ]);

  // Create test students
  const student1 = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "John", lastName: "Doe", grade: "1", characteristics: {} };
  const student2 = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "Jane", lastName: "Smith", grade: "1", characteristics: {} };
  const student3 = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "Bob", lastName: "Wilson", grade: "2", characteristics: {} };
  const student4 = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "Alice", lastName: "Brown", grade: "2", characteristics: {} };

  await db.insert(students).values([student1, student2, student3, student4]);

  // Create initial placements
  const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
  const grade1Class = classConfigsResult.find(c => c.grade === "1")!;
  const grade2Class = classConfigsResult.find(c => c.grade === "2")!;

  await db.insert(placements).values([
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, studentId: student1.id, classId: grade1Class.id },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, studentId: student2.id, classId: grade1Class.id },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, studentId: student3.id, classId: grade2Class.id },
    { id: randomUUID(), accountId: TEST_ACCOUNT_ID, studentId: student4.id, classId: grade2Class.id },
  ]);
}

test("Grade Lock and Snapshot System", async () => {
  await cleanupTestData();
  await setupTestData();
  const storage = new DatabaseStorage();

  // Test Grade Locks
  {
    const lock = await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);
    assert.equal(lock.grade, "1");
    assert.equal(lock.locked, true);
    assert.equal(lock.lockedBy, TEST_USER_ID);
    assert.ok(lock.lockedAt);

    const retrieved = await storage.getGradeLock(TEST_ACCOUNT_ID, "1");
    assert.ok(retrieved);
    assert.equal(retrieved!.locked, true);
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);
    const lock = await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", false, TEST_USER_ID);
    assert.equal(lock.locked, false);
    assert.equal(lock.unlockedBy, TEST_USER_ID);
    assert.ok(lock.unlockedAt);
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "2", false, TEST_USER_ID);

    const locks = await storage.getGradeLocks(TEST_ACCOUNT_ID);
    assert.equal(locks.length, 2);
    const grade1Lock = locks.find(l => l.grade === "1");
    const grade2Lock = locks.find(l => l.grade === "2");
    assert.equal(grade1Lock!.locked, true);
    assert.equal(grade2Lock!.locked, false);
  }

  // Test Grade Snapshots
  {
    const snapshot = await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "1",
      name: "Grade 1 Snapshot",
      description: "Test snapshot",
      placements: [
        { studentId: "student1", classId: "class1" },
        { studentId: "student2", classId: "class1" },
      ],
      classConfigs: [
        { id: "class1", name: "1A", grade: "1", capacity: 30 },
      ],
      teacherAllocations: [
        { teacherId: "teacher1", className: "1A" },
      ],
      savedBy: TEST_USER_ID,
    });

    assert.ok(snapshot.id);
    assert.equal(snapshot.grade, "1");
    assert.equal(snapshot.name, "Grade 1 Snapshot");
    assert.equal(snapshot.placements.length, 2);

    const retrieved = await storage.getGradeSnapshot(TEST_ACCOUNT_ID, snapshot.id);
    assert.ok(retrieved);
    assert.equal(retrieved!.name, "Grade 1 Snapshot");
  }

  {
    await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "1",
      name: "Snapshot 1",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });
    await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "1",
      name: "Snapshot 2",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });
    await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "2",
      name: "Snapshot 3",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });

    const grade1Snapshots = await storage.getGradeSnapshots(TEST_ACCOUNT_ID, "1");
    assert.equal(grade1Snapshots.length, 2);

    const allSnapshots = await storage.getGradeSnapshots(TEST_ACCOUNT_ID);
    assert.equal(allSnapshots.length, 3);
  }

  {
    const snapshot = await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "1",
      name: "To Delete",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });

    const deleted = await storage.deleteGradeSnapshot(TEST_ACCOUNT_ID, snapshot.id);
    assert.equal(deleted, true);

    const retrieved = await storage.getGradeSnapshot(TEST_ACCOUNT_ID, snapshot.id);
    assert.equal(retrieved, undefined);
  }

  // Test Lock Enforcement on Placement Operations
  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade1Class = classConfigsResult.find(c => c.grade === "1")!;

    const newStudent = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "New", lastName: "Student", grade: "1", characteristics: {} };
    await db.insert(students).values(newStudent);

    await assert.rejects(
      storage.createPlacement(TEST_ACCOUNT_ID, {
        studentId: newStudent.id,
        classId: grade1Class.id,
      }, 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade1Class = classConfigsResult.find(c => c.grade === "1")!;
    const grade2Class = classConfigsResult.find(c => c.grade === "2")!;

    const student = (await db.select().from(students).where(and(eq(students.accountId, TEST_ACCOUNT_ID), eq(students.grade, "1"))))[0];

    await assert.rejects(
      storage.movePlacement(TEST_ACCOUNT_ID, student.id, grade2Class.id, 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const placement = (await db.select().from(placements).where(eq(placements.accountId, TEST_ACCOUNT_ID)))[0];

    await assert.rejects(
      storage.updatePlacement(TEST_ACCOUNT_ID, placement.id, { classId: placement.classId }, 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const placement = (await db.select().from(placements).where(eq(placements.accountId, TEST_ACCOUNT_ID)))[0];

    await assert.rejects(
      storage.deletePlacement(TEST_ACCOUNT_ID, placement.id, 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade1Class = classConfigsResult.find(c => c.grade === "1")!;
    const grade2Class = classConfigsResult.find(c => c.grade === "2")!;

    const student1 = (await db.select().from(students).where(and(eq(students.accountId, TEST_ACCOUNT_ID), eq(students.grade, "1"))))[0];
    const student2 = (await db.select().from(students).where(and(eq(students.accountId, TEST_ACCOUNT_ID), eq(students.grade, "2"))))[0];

    await assert.rejects(
      storage.swapPlacements(TEST_ACCOUNT_ID, student1.id, grade2Class.id, student2.id, grade1Class.id, 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade1Class = classConfigsResult.find(c => c.grade === "1")!;

    const student = (await db.select().from(students).where(and(eq(students.accountId, TEST_ACCOUNT_ID), eq(students.grade, "1"))))[0];

    await assert.rejects(
      storage.replacePlacements(TEST_ACCOUNT_ID, [
        { studentId: student.id, classId: grade1Class.id },
      ], 0, [student.id]),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade1Class = classConfigsResult.find(c => c.grade === "1")!;

    const newStudent = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "New", lastName: "Student", grade: "1", characteristics: {} };
    await db.insert(students).values(newStudent);

    await assert.rejects(
      storage.bulkCreatePlacements(TEST_ACCOUNT_ID, [
        { studentId: newStudent.id, classId: grade1Class.id },
      ], 0),
      /Grade 1 is locked and cannot be modified/
    );
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const classConfigsResult = await db.select().from(classConfigs).where(eq(classConfigs.accountId, TEST_ACCOUNT_ID));
    const grade2Class = classConfigsResult.find(c => c.grade === "2")!;

    const newStudent = { id: randomUUID(), accountId: TEST_ACCOUNT_ID, firstName: "New", lastName: "Student", grade: "2", characteristics: {} };
    await db.insert(students).values(newStudent);

    // This should succeed because grade 2 is not locked
    const result = await storage.createPlacement(TEST_ACCOUNT_ID, {
      studentId: newStudent.id,
      classId: grade2Class.id,
    }, 0);

    assert.ok(result.placement);
    assert.equal(result.placement.classId, grade2Class.id);
  }

  // Test Generation with Locked Grades
  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const lock = await storage.getGradeLock(TEST_ACCOUNT_ID, "1");
    assert.equal(lock?.locked, true);
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const locks = await storage.getGradeLocks(TEST_ACCOUNT_ID);
    const lockedGrades = new Set(locks.filter(l => l.locked).map(l => l.grade));

    assert.ok(lockedGrades.has("1"));
    assert.ok(!lockedGrades.has("2"));
  }

  // Test Snapshot Restore with Lock Check
  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const snapshot = await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "1",
      name: "Locked Snapshot",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });

    const lock = await storage.getGradeLock(TEST_ACCOUNT_ID, "1");
    assert.equal(lock?.locked, true);
  }

  {
    await storage.upsertGradeLock(TEST_ACCOUNT_ID, "1", true, TEST_USER_ID);

    const snapshot = await storage.createGradeSnapshot(TEST_ACCOUNT_ID, {
      accountId: TEST_ACCOUNT_ID,
      grade: "2",
      name: "Unlocked Snapshot",
      placements: [],
      classConfigs: [],
      teacherAllocations: [],
      savedBy: TEST_USER_ID,
    });

    const lock = await storage.getGradeLock(TEST_ACCOUNT_ID, "2");
    assert.equal(lock?.locked, false);
  }

  await cleanupTestData();
});