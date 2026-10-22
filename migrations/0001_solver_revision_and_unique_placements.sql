BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM placements
    GROUP BY account_id, student_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add placements_account_student_unique: duplicate account/student placements exist; resolve them without deleting learner allocation data first';
  END IF;
END;
$$;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS solver_revision integer NOT NULL DEFAULT 0;

ALTER TABLE placements
  ADD CONSTRAINT placements_account_student_unique UNIQUE (account_id, student_id);

COMMIT;
