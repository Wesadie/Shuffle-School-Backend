BEGIN;

-- Validate the production prerequisites without changing existing data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = to_regclass('public.accounts')
      AND attname = 'id'
      AND atttypid = 'uuid'::regtype
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'public.accounts.id must exist and have type uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = to_regclass('public.profiles')
      AND attname = 'id'
      AND atttypid = 'uuid'::regtype
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'public.profiles.id must exist and have type uuid';
  END IF;
END;
$$;

-- Grade lock table: one row per account per grade.
CREATE TABLE public.grade_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  grade text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  locked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  locked_at timestamptz,
  unlocked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, grade)
);

CREATE INDEX grade_locks_account_id_idx ON public.grade_locks (account_id);

-- Saved snapshots per grade; account/profile deletion can cascade to snapshots.
CREATE TABLE public.grade_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  grade text NOT NULL,
  name text NOT NULL,
  description text,
  placements jsonb NOT NULL, -- array of { studentId, classId }
  class_configs jsonb NOT NULL, -- array of class configs at time of save
  teacher_allocations jsonb NOT NULL, -- array of { teacherId, className }
  saved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX grade_snapshots_account_id_idx ON public.grade_snapshots (account_id);
CREATE INDEX grade_snapshots_account_grade_idx ON public.grade_snapshots (account_id, grade);

-- Backend-only tables: no browser/Data API policies are intentionally defined.
-- With RLS enabled and no policies, ordinary roles cannot access any rows.
ALTER TABLE public.grade_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_snapshots ENABLE ROW LEVEL SECURITY;

-- Remove privileges potentially inherited from Supabase default table grants.
REVOKE ALL PRIVILEGES ON TABLE public.grade_locks, public.grade_snapshots
  FROM PUBLIC, anon, authenticated;

-- Trusted server roles only. Never expose service-role credentials to clients.
-- The backend DB connection must use the table owner or a BYPASSRLS/superuser
-- role with these privileges; no per-request JWT is set on its pooled connection.
-- Do not FORCE RLS: owner access is needed by the backend-only architecture.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.grade_locks, public.grade_snapshots
  TO postgres, service_role;

COMMIT;