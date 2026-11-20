import { pool } from "./db";

const placementIntegrityStatements = [
  `DELETE FROM public.placements p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.students s
     WHERE s.id = p.student_id AND s.account_id = p.account_id
   )
   OR NOT EXISTS (
     SELECT 1 FROM public.class_configs c
     WHERE c.id = p.class_id AND c.account_id = p.account_id
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS students_id_account_unique
   ON public.students (id, account_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS class_configs_id_account_unique
   ON public.class_configs (id, account_id)`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.placements'::regclass
         AND conname = 'placements_student_id_account_id_fkey'
     ) THEN
       ALTER TABLE public.placements
         ADD CONSTRAINT placements_student_id_account_id_fkey
         FOREIGN KEY (student_id, account_id)
         REFERENCES public.students (id, account_id)
         ON DELETE CASCADE;
     END IF;
     IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.placements'::regclass
         AND conname = 'placements_class_id_account_id_fkey'
     ) THEN
       ALTER TABLE public.placements
         ADD CONSTRAINT placements_class_id_account_id_fkey
         FOREIGN KEY (class_id, account_id)
         REFERENCES public.class_configs (id, account_id)
         ON DELETE CASCADE;
     END IF;
   END;
   $$`,
];

export async function ensureStudentPlacementIntegrity(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE public.placements IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE public.students, public.class_configs IN SHARE MODE");

    let cleanedPlacements = 0;
    for (let i = 0; i < placementIntegrityStatements.length; i++) {
      const result = await client.query(placementIntegrityStatements[i]);
      if (i === 0) cleanedPlacements = result.rowCount ?? 0;
    }

    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.placements'::regclass
        AND conname IN (
          'placements_student_id_account_id_fkey',
          'placements_class_id_account_id_fkey'
        )
    `);
    const definitions = new Map(constraints.rows.map((row) => [row.conname, row]));
    const studentConstraint = definitions.get("placements_student_id_account_id_fkey");
    const classConstraint = definitions.get("placements_class_id_account_id_fkey");
    if (!studentConstraint?.convalidated || !/FOREIGN KEY \(student_id, account_id\) REFERENCES .*students\(id, account_id\) ON DELETE CASCADE/i.test(studentConstraint.definition)) {
      throw new Error("Student placement ownership constraint is missing or invalid");
    }
    if (!classConstraint?.convalidated || !/FOREIGN KEY \(class_id, account_id\) REFERENCES .*class_configs\(id, account_id\) ON DELETE CASCADE/i.test(classConstraint.definition)) {
      throw new Error("Class placement ownership constraint is missing or invalid");
    }

    await client.query("COMMIT");
    return cleanedPlacements;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readAccountPlacementIntegrity(accountId: string) {
  const [migration, audit] = await Promise.all([
    pool.query(`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition,
        convalidated AS "validated"
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.placements'::regclass
        AND conname IN (
          'placements_student_id_account_id_fkey',
          'placements_class_id_account_id_fkey'
        )
      ORDER BY conname
    `),
    pool.query(`
      SELECT p.id AS "placementId", p.account_id AS "placementAccountId",
        p.student_id AS "studentId", p.class_id AS "classId",
        s.account_id AS "studentAccountId", c.account_id AS "classAccountId"
      FROM public.placements p
      LEFT JOIN public.students s ON s.id = p.student_id
      LEFT JOIN public.class_configs c ON c.id = p.class_id
      WHERE p.account_id = $1
        AND (s.id IS NULL OR s.account_id <> p.account_id
          OR c.id IS NULL OR c.account_id <> p.account_id)
      ORDER BY p.id
    `, [accountId]),
  ]);
  return {
    constraints: migration.rows,
    orphanedPlacements: audit.rows,
  };
}
