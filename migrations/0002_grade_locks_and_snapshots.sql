BEGIN;

-- Replace this value with currentRole from the Render-backed diagnostic.
-- Never use a connection string, password, API key, or pooler username here.
DO $$
DECLARE
  backend_role name := 'REPLACE_WITH_VERIFIED_BACKEND_ROLE';
BEGIN
  IF backend_role = 'REPLACE_WITH_VERIFIED_BACKEND_ROLE'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = backend_role) THEN
    RAISE EXCEPTION 'Set backend_role to the verified Render PostgreSQL currentRole';
  END IF;
  IF backend_role IN ('anon', 'authenticated', 'authenticator')
    OR pg_has_role('anon', backend_role, 'MEMBER')
    OR pg_has_role('authenticated', backend_role, 'MEMBER') THEN
    RAISE EXCEPTION 'Backend role must not be accessible to browser/Data API client roles';
  END IF;
  PERFORM set_config('shuffleschool.migration_backend_role', backend_role::text, true);

  -- Validate the production prerequisites without changing existing data.
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

-- Backend-only tables: browser/Data API client roles have no access.
ALTER TABLE public.grade_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_snapshots ENABLE ROW LEVEL SECURITY;

-- Reset standard Supabase default grants; re-grant the verified role below.
REVOKE ALL PRIVILEGES ON TABLE public.grade_locks, public.grade_snapshots
  FROM PUBLIC, anon, authenticated, service_role;

-- Grant only the verified backend role. Role identifiers are safely quoted.
-- Explicit backend-only policies also support a custom role without BYPASSRLS.
-- The trusted backend enforces account membership and account_id filtering;
-- its pooled PostgreSQL connection does not set a per-request auth.uid().
DO $$
DECLARE
  backend_role name := current_setting('shuffleschool.migration_backend_role');
BEGIN
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grade_locks, public.grade_snapshots TO %I',
    backend_role
  );
  EXECUTE format(
    'CREATE POLICY grade_locks_backend_access ON public.grade_locks FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
  EXECUTE format(
    'CREATE POLICY grade_snapshots_backend_access ON public.grade_snapshots FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
END;
$$;

COMMIT;