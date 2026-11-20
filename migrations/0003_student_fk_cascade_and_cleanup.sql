BEGIN;

-- This migration adds foreign key constraints with ON DELETE CASCADE from
-- placements, rules, and surveys to students, so that deleting a learner
-- automatically removes their associated records. It also cleans up any
-- existing orphaned placement records that reference deleted students.

-- Replace this value with currentRole from the Render-backed diagnostic.
-- Never use a connection string, password, API key, or pooler username here.
DO $$
DECLARE
  backend_role name := 'postgres';
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
END;
$$;

-- 1. Clean up existing orphaned placements (studentId references a non-existent student)
DELETE FROM public.placements p
WHERE NOT EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = p.student_id AND s.account_id = p.account_id
);

-- 2. Clean up existing orphaned rules (studentId1 or studentId2 references a non-existent student)
DELETE FROM public.rules r
WHERE NOT EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = r.student_id_1 AND s.account_id = r.account_id
)
OR NOT EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = r.student_id_2 AND s.account_id = r.account_id
);

-- 3. Clean up existing orphaned surveys (studentId references a non-existent student)
DELETE FROM public.surveys sv
WHERE NOT EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = sv.student_id AND s.account_id = sv.account_id
);

-- 4. Add foreign key constraint: placements.student_id -> students.id ON DELETE CASCADE
ALTER TABLE public.placements
  ADD CONSTRAINT placements_student_id_fkey
  FOREIGN KEY (student_id, account_id)
  REFERENCES public.students (id, account_id)
  ON DELETE CASCADE;

-- 5. Add foreign key constraint: rules.student_id_1 -> students.id ON DELETE CASCADE
ALTER TABLE public.rules
  ADD CONSTRAINT rules_student_id_1_fkey
  FOREIGN KEY (student_id_1, account_id)
  REFERENCES public.students (id, account_id)
  ON DELETE CASCADE;

-- 6. Add foreign key constraint: rules.student_id_2 -> students.id ON DELETE CASCADE
ALTER TABLE public.rules
  ADD CONSTRAINT rules_student_id_2_fkey
  FOREIGN KEY (student_id_2, account_id)
  REFERENCES public.students (id, account_id)
  ON DELETE CASCADE;

-- 7. Add foreign key constraint: surveys.student_id -> students.id ON DELETE CASCADE
ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_student_id_fkey
  FOREIGN KEY (student_id, account_id)
  REFERENCES public.students (id, account_id)
  ON DELETE CASCADE;

-- Backend-only tables: browser/Data API client roles have no access.
-- (RLS already enabled on these tables from previous migrations)

-- Reset standard Supabase default grants; re-grant the verified role below.
REVOKE ALL PRIVILEGES ON TABLE public.placements, public.rules, public.surveys
  FROM PUBLIC, anon, authenticated, service_role;

-- Grant only the verified backend role.
DO $$
DECLARE
  backend_role name := current_setting('shuffleschool.migration_backend_role');
BEGIN
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.placements, public.rules, public.surveys TO %I',
    backend_role
  );
  EXECUTE format(
    'CREATE POLICY placements_backend_access ON public.placements FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
  EXECUTE format(
    'CREATE POLICY rules_backend_access ON public.rules FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
  EXECUTE format(
    'CREATE POLICY surveys_backend_access ON public.surveys FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
END;
$$;

COMMIT;