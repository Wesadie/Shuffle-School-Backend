BEGIN;

-- Grade lock table: one row per account per grade
CREATE TABLE grade_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  grade text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  locked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  locked_at timestamptz,
  unlocked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, grade)
);

CREATE INDEX grade_locks_account_id_idx ON grade_locks (account_id);

-- Grade snapshot table: permanent saved snapshots per grade
CREATE TABLE grade_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  grade text NOT NULL,
  name text NOT NULL,
  description text,
  placements jsonb NOT NULL, -- array of { studentId, classId }
  class_configs jsonb NOT NULL, -- array of class configs at time of save
  teacher_allocations jsonb NOT NULL, -- array of { teacherId, className }
  saved_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX grade_snapshots_account_id_idx ON grade_snapshots (account_id);
CREATE INDEX grade_snapshots_account_grade_idx ON grade_snapshots (account_id, grade);

COMMIT;