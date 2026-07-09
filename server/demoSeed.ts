import { pathToFileURL } from "url";
import { pool } from "./db";
import { DEVELOPMENT_ACCOUNT_ID } from "@shared/schema";

export interface DemoSeedResult {
  accountId: string;
  students: number;
  teachers: number;
  classConfigs: number;
  characteristics: number;
  rules: number;
  placements: number;
  surveys: number;
}

const DEMO_ACCOUNT_NAME = "ShuffleSchool Fictional Demo School";
const DEMO_ACCOUNT_SLUG = "shuffleschool-fictional-demo";

const characteristicDefinitions = [
  {
    id: "demo-char-learning-style",
    name: "Learning Style",
    type: "category",
    priority: 6,
    options: ["Visual", "Verbal", "Hands-on", "Mixed"],
    colors: ["#2563eb", "#7c3aed", "#059669", "#f97316"],
  },
  {
    id: "demo-char-confidence",
    name: "Confidence Level",
    type: "category",
    priority: 5,
    options: ["Emerging", "Developing", "Confident", "Highly Confident"],
    colors: ["#dc2626", "#f59e0b", "#16a34a", "#0d9488"],
  },
  {
    id: "demo-char-support",
    name: "Support Need",
    type: "category",
    priority: 4,
    options: ["Low", "Moderate", "High"],
    colors: ["#22c55e", "#eab308", "#ef4444"],
  },
  {
    id: "demo-char-collaboration",
    name: "Collaboration Style",
    type: "category",
    priority: 3,
    options: ["Quiet Partner", "Team Builder", "Independent", "Discussion Leader"],
    colors: ["#64748b", "#0891b2", "#a855f7", "#ea580c"],
  },
  {
    id: "demo-char-reading-band",
    name: "Reading Band",
    type: "category",
    priority: 2,
    options: ["Foundation", "Core", "Extension"],
    colors: ["#f43f5e", "#3b82f6", "#10b981"],
  },
  {
    id: "demo-char-new-student",
    name: "New Student",
    type: "category",
    priority: 1,
    options: ["Yes", "No"],
    colors: ["#f97316", "#94a3b8"],
  },
];

const classConfigs = [
  { id: "demo-class-river-5", name: "River 5", grade: "5", capacity: 22 },
  { id: "demo-class-harbor-5", name: "Harbor 5", grade: "5", capacity: 22 },
  { id: "demo-class-meadow-5", name: "Meadow 5", grade: "5", capacity: 22 },
  { id: "demo-class-summit-5", name: "Summit 5", grade: "5", capacity: 22 },
];

const teachers = [
  { id: "demo-teacher-avery-lane", firstName: "Avery", lastName: "Lane", email: "avery.lane@example.invalid", currentClass: "River 5", allocatedClass: "River 5", surveyStatus: "Submitted", surveyDate: "2026-02-04" },
  { id: "demo-teacher-morgan-reed", firstName: "Morgan", lastName: "Reed", email: "morgan.reed@example.invalid", currentClass: "Harbor 5", allocatedClass: "Harbor 5", surveyStatus: "Submitted", surveyDate: "2026-02-05" },
  { id: "demo-teacher-riley-brooks", firstName: "Riley", lastName: "Brooks", email: "riley.brooks@example.invalid", currentClass: "Meadow 5", allocatedClass: "Meadow 5", surveyStatus: "Submitted", surveyDate: "2026-02-06" },
  { id: "demo-teacher-jordan-kim", firstName: "Jordan", lastName: "Kim", email: "jordan.kim@example.invalid", currentClass: "Summit 5", allocatedClass: "Summit 5", surveyStatus: "Submitted", surveyDate: "2026-02-07" },
];

const firstNames = [
  "Adley", "Briar", "Callen", "Della", "Ellis", "Finley", "Greer", "Hollis", "Indie", "Jules",
  "Koa", "Lennon", "Maren", "Nico", "Oakley", "Piper", "Quinn", "Remy", "Sage", "Tatum",
  "Arden", "Blake", "Cleo", "Devon", "Emery", "Frankie", "Gray", "Hadley", "Ira", "Jamie",
  "Keaton", "Luca", "Mika", "Noa", "Onyx", "Parker", "Rowan", "Scout", "Teagan", "Vale",
  "Ari", "Bellamy", "Cedar", "Drew", "Elliot", "Flora", "Galen", "Hayes", "Isla", "Jory",
  "Kai", "Lyra", "Milo", "Nova", "Orin", "Phoebe", "Rory", "Selah", "Theo", "Uma",
  "Atlas", "Bex", "Cassia", "Dorian", "Esme", "Felix", "Gia", "Hugo", "Ivy", "Jonah",
  "Kira", "Leo", "Maeve", "Nell", "Otis", "Pearl", "Rafa", "Sloane", "Toby", "Wren",
];

const lastNames = [
  "Fable", "North", "Willow", "Stone", "Bright", "Field", "Wilder", "Lake", "Quill", "March",
  "Haven", "Fox", "Moss", "Vale", "Rain", "Bell", "Cove", "Hart", "Lark", "Bloom",
];

function ensureSeedableDemoAccount(accountId: string): void {
  if (!accountId) throw new Error("A demo account ID is required");
  if (accountId === DEVELOPMENT_ACCOUNT_ID) {
    throw new Error("Refusing to seed the live development account");
  }
}

function seedKeyFor(accountId: string): string {
  return accountId.replace(/-/g, "").slice(0, 8);
}

function stableStudentId(seedKey: string, index: number): string {
  return `demo-${seedKey}-student-${String(index + 1).padStart(2, "0")}`;
}

function stableClassId(seedKey: string, classId: string): string {
  return `${classId}-${seedKey}`;
}

function stableTeacherId(seedKey: string, teacherId: string): string {
  return `${teacherId}-${seedKey}`;
}

function buildStudents(seedKey: string) {
  return firstNames.map((firstName, index) => {
    const lastName = lastNames[index % lastNames.length];
    const currentClass = classConfigs[Math.floor(index / 20)]?.name ?? classConfigs[index % classConfigs.length].name;
    const learningStyle = characteristicDefinitions[0].options[index % 4];
    const confidenceLevel = characteristicDefinitions[1].options[(index + Math.floor(index / 5)) % 4];
    const supportNeed = characteristicDefinitions[2].options[index % 10 === 0 ? 2 : index % 3 === 0 ? 1 : 0];
    const collaborationStyle = characteristicDefinitions[3].options[(index * 2 + 1) % 4];
    const readingBand = characteristicDefinitions[4].options[index % 9 < 2 ? 0 : index % 9 < 7 ? 1 : 2];
    const isNew = index % 13 === 0;

    return {
      id: stableStudentId(seedKey, index),
      studentId: `FIC-${String(index + 1).padStart(3, "0")}`,
      firstName,
      lastName,
      grade: "5",
      currentClass,
      gender: ["Female", "Male", "Non-binary", "Prefer not to say"][index % 4],
      characteristics: {
        "Learning Style": learningStyle,
        "Confidence Level": confidenceLevel,
        "Support Need": supportNeed,
        "Collaboration Style": collaborationStyle,
        "Reading Band": readingBand,
        "New Student": isNew ? "Yes" : "No",
      },
      notes: index % 11 === 0 ? "Fictional note: benefits from a calm transition plan." : null,
      parentRequests: index % 17 === 0 ? "Fictional request: consider one familiar peer where possible." : null,
      parentNotes: index % 19 === 0 ? "Fictional family context for demo only." : null,
      isNew,
      isLeaving: false,
    };
  });
}

function buildRules(seedKey: string) {
  return [
    { id: `demo-${seedKey}-rule-pair-01`, type: "pair", studentId1: stableStudentId(seedKey, 0), studentId2: stableStudentId(seedKey, 8), reason: "Fictional supportive peer pairing" },
    { id: `demo-${seedKey}-rule-pair-02`, type: "pair", studentId1: stableStudentId(seedKey, 13), studentId2: stableStudentId(seedKey, 22), reason: "Fictional confidence-building pairing" },
    { id: `demo-${seedKey}-rule-pair-03`, type: "pair", studentId1: stableStudentId(seedKey, 31), studentId2: stableStudentId(seedKey, 39), reason: "Fictional positive collaboration history" },
    { id: `demo-${seedKey}-rule-pair-04`, type: "pair", studentId1: stableStudentId(seedKey, 48), studentId2: stableStudentId(seedKey, 56), reason: "Fictional transition support" },
    { id: `demo-${seedKey}-rule-separate-01`, type: "separate", studentId1: stableStudentId(seedKey, 5), studentId2: stableStudentId(seedKey, 6), reason: "Fictional separation request" },
    { id: `demo-${seedKey}-rule-separate-02`, type: "separate", studentId1: stableStudentId(seedKey, 17), studentId2: stableStudentId(seedKey, 18), reason: "Fictional learning focus concern" },
    { id: `demo-${seedKey}-rule-separate-03`, type: "separate", studentId1: stableStudentId(seedKey, 27), studentId2: stableStudentId(seedKey, 35), reason: "Fictional teacher recommendation" },
    { id: `demo-${seedKey}-rule-separate-04`, type: "separate", studentId1: stableStudentId(seedKey, 64), studentId2: stableStudentId(seedKey, 72), reason: "Fictional classroom dynamic" },
  ];
}

function buildPlacements(seedKey: string) {
  return firstNames.map((_, index) => ({
    id: `demo-${seedKey}-placement-${String(index + 1).padStart(2, "0")}`,
    studentId: stableStudentId(seedKey, index),
    classId: stableClassId(seedKey, classConfigs[index % classConfigs.length].id),
    locked: index % 23 === 0,
  }));
}

function buildSurveys(seedKey: string) {
  return firstNames.slice(0, 16).map((_, index) => ({
    id: `demo-${seedKey}-survey-${String(index + 1).padStart(2, "0")}`,
    teacherName: `${teachers[index % teachers.length].firstName} ${teachers[index % teachers.length].lastName}`,
    studentId: stableStudentId(seedKey, index),
    characteristicRatings: {
      "Confidence Level": characteristicDefinitions[1].options[(index + 1) % 4],
      "Support Need": characteristicDefinitions[2].options[index % 3],
      "Collaboration Style": characteristicDefinitions[3].options[index % 4],
    },
    pairWith: index % 4 === 0 ? [stableStudentId(seedKey, index + 1)] : [],
    separateFrom: index % 5 === 0 ? [stableStudentId(seedKey, index + 2)] : [],
    notes: "Fictional teacher survey note for demo data.",
    submittedAt: `2026-02-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`,
  }));
}

function buildCharacteristicRows(accountId: string, seedKey: string) {
  return characteristicDefinitions.map((char) => ({
    id: `${char.id}-${seedKey}`,
    accountId,
    name: char.name,
    type: char.type,
    options: JSON.stringify(char.options),
    responseConfig: JSON.stringify(char.options.map((option, index) => ({
      id: `${char.id}-${seedKey}-${option.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: option,
      color: char.colors[index],
      description: "Fictional demo response option",
      sortOrder: index + 1,
    }))),
    priority: char.priority,
    tagOnly: false,
    multiSelect: false,
    adminOnly: false,
    applyToAllGrades: true,
    applicableGrades: JSON.stringify([]),
  }));
}

export async function seedDemoData(accountId: string): Promise<DemoSeedResult> {
  ensureSeedableDemoAccount(accountId);

  const seedKey = seedKeyFor(accountId);
  const students = buildStudents(seedKey);
  const rules = buildRules(seedKey);
  const placements = buildPlacements(seedKey);
  const surveys = buildSurveys(seedKey);
  const characteristicRows = buildCharacteristicRows(accountId, seedKey);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO accounts (id, name, slug, type, status, workspace_mode)
       VALUES ($1, $2, $3, 'school', 'active', 'demo')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, type = EXCLUDED.type, status = EXCLUDED.status, workspace_mode = EXCLUDED.workspace_mode, updated_at = NOW()`,
      [accountId, DEMO_ACCOUNT_NAME, `${DEMO_ACCOUNT_SLUG}-${accountId.slice(0, 8)}`],
    );

    await client.query("DELETE FROM surveys WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM scenarios WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM placements WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM rules WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM app_settings WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM students WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM teachers WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM class_configs WHERE account_id = $1", [accountId]);
    await client.query("DELETE FROM characteristics WHERE account_id = $1", [accountId]);

    for (const char of characteristicRows) {
      await client.query(
        `INSERT INTO characteristics (id, account_id, name, type, options, response_config, priority, tag_only, multi_select, admin_only, apply_to_all_grades, applicable_grades)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)`,
        [char.id, char.accountId, char.name, char.type, char.options, char.responseConfig, char.priority, char.tagOnly, char.multiSelect, char.adminOnly, char.applyToAllGrades, char.applicableGrades],
      );
    }

    for (const config of classConfigs) {
      await client.query(
        "INSERT INTO class_configs (id, account_id, name, grade, capacity) VALUES ($1, $2, $3, $4, $5)",
        [stableClassId(seedKey, config.id), accountId, config.name, config.grade, config.capacity],
      );
    }

    for (const teacher of teachers) {
      await client.query(
        `INSERT INTO teachers (id, account_id, first_name, last_name, email, current_class, allocated_class, survey_status, survey_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [stableTeacherId(seedKey, teacher.id), accountId, teacher.firstName, teacher.lastName, teacher.email, teacher.currentClass, teacher.allocatedClass, teacher.surveyStatus, teacher.surveyDate],
      );
    }

    for (const student of students) {
      await client.query(
        `INSERT INTO students (id, account_id, student_id, first_name, last_name, grade, current_class, gender, characteristics, notes, parent_requests, parent_notes, is_new, is_leaving)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)`,
        [student.id, accountId, student.studentId, student.firstName, student.lastName, student.grade, student.currentClass, student.gender, JSON.stringify(student.characteristics), student.notes, student.parentRequests, student.parentNotes, student.isNew, student.isLeaving],
      );
    }

    for (const rule of rules) {
      await client.query(
        "INSERT INTO rules (id, account_id, type, student_id_1, student_id_2, reason) VALUES ($1, $2, $3, $4, $5, $6)",
        [rule.id, accountId, rule.type, rule.studentId1, rule.studentId2, rule.reason],
      );
    }

    for (const placement of placements) {
      await client.query(
        "INSERT INTO placements (id, account_id, student_id, class_id, locked) VALUES ($1, $2, $3, $4, $5)",
        [placement.id, accountId, placement.studentId, placement.classId, placement.locked],
      );
    }

    for (const survey of surveys) {
      await client.query(
        `INSERT INTO surveys (id, account_id, teacher_name, student_id, characteristic_ratings, pair_with, separate_from, notes, submitted_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
        [survey.id, accountId, survey.teacherName, survey.studentId, JSON.stringify(survey.characteristicRatings), JSON.stringify(survey.pairWith), JSON.stringify(survey.separateFrom), survey.notes, survey.submittedAt],
      );
    }

    await client.query(
      "INSERT INTO app_settings (id, account_id, max_friend_nominations, allow_teacher_student_requests, allow_teacher_teacher_requests) VALUES ($1, $2, $3, $4, $5)",
      [`demo-${seedKey}-app-settings`, accountId, 2, true, true],
    );

    await client.query("COMMIT");

    return {
      accountId,
      students: students.length,
      teachers: teachers.length,
      classConfigs: classConfigs.length,
      characteristics: characteristicRows.length,
      rules: rules.length,
      placements: placements.length,
      surveys: surveys.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runFromCli(): Promise<void> {
  const accountId = process.argv[2];
  const result = await seedDemoData(accountId);
  console.log("[demo-seed] seeded fictional demo data", result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCli().catch((error) => {
    console.error("[demo-seed] failed to seed fictional demo data", error);
    process.exit(1);
  });
}
