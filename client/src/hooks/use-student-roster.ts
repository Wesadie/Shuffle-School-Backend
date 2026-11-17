import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { applyStudentPatch, normalizeRosterGrade, previousStudentPatch, updateRosterRows, rosterSpecialFilters, type StudentRosterOptions } from "@shared/student-roster";
import type { InsertStudent, Student } from "@shared/schema";

const EMPTY_STUDENTS: Student[] = [];
const isRosterList = (key: QueryKey) => key[0] === "/api/students" && (key.length === 1 || key[1] === "roster");

export function useStudentRoster(selectedGrade: string) {
  const { data: auth } = useQuery<{ id: string; accountContext?: { accountId: string } }>({ queryKey: ["/api/auth/user"] });
  const scope = auth?.accountContext?.accountId || auth?.id;
  const grade = rosterSpecialFilters.has(selectedGrade) ? "all" : normalizeRosterGrade(selectedGrade);
  const key = ["/api/students", "roster", grade, scope] as const;
  const [settledGrade, setSettledGrade] = useState(grade);
  useEffect(() => {
    const timer = setTimeout(() => setSettledGrade(grade), 120);
    return () => clearTimeout(timer);
  }, [grade]);
  const cached = queryClient.getQueryData<Student[]>(key);
  const source = (grade !== "all" ? queryClient.getQueryState<Student[]>(["/api/students", "roster", "all", scope]) : undefined)
    || queryClient.getQueryState<Student[]>(["/api/students"]);
  const sourceRows = useMemo(() => !source?.isInvalidated && auth?.accountContext?.accountId && source?.data?.every((s) => s.accountId === scope) ? source.data : undefined,
    [source?.data, source?.isInvalidated, scope, auth?.accountContext?.accountId]);
  const roster = useQuery<Student[]>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", grade === "all" ? "/api/students" : `/api/students?grade=${encodeURIComponent(grade)}`, undefined, signal);
      return response.json();
    },
    enabled: !!scope && (grade === settledGrade || !!cached),
    initialData: sourceRows ? () => grade === "all" ? sourceRows : sourceRows.filter((s) => normalizeRosterGrade(s.grade) === grade) : undefined,
    initialDataUpdatedAt: source?.dataUpdatedAt,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const options = useQuery<StudentRosterOptions>({
    queryKey: ["/api/students", "options", scope],
    queryFn: async ({ signal }) => (await apiRequest("GET", "/api/students/roster-options", undefined, signal)).json(),
    enabled: !!scope,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return { students: roster.data || EMPTY_STUDENTS, isLoading: roster.isPending, isFetching: roster.isFetching, error: roster.error, refetch: roster.refetch, options: options.data, optionsError: options.error, refetchOptions: options.refetch };
}

export function useSaveRosterStudent() {
  const queues = useRef(new Map<string, Promise<void>>());
  return useCallback(async (student: Student, patch: Partial<InsertStudent>) => {
    if (!Object.keys(patch).length) return;
    const queueKey = `${student.accountId}:${student.id}`;
    const previous = queues.current.get(queueKey) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const auth = queryClient.getQueryData<{ id: string; accountContext?: { accountId: string } }>(["/api/auth/user"]);
      if (!auth || (auth.accountContext && auth.accountContext.accountId !== student.accountId)) {
        toast({ title: "Your school session changed", description: "Reopen the learner in the current school before saving.", variant: "destructive" });
        throw new Error("School context changed before saving");
      }
      const predicate = (query: { queryKey: QueryKey }) => isRosterList(query.queryKey)
        && (query.queryKey.length === 1 || query.queryKey[3] === student.accountId || query.queryKey[3] === auth.id);
      await queryClient.cancelQueries({ predicate });
      const snapshots = queryClient.getQueriesData<Student[]>({ predicate });
      const before = snapshots.map(([, rows]) => rows?.find((s) => s.id === student.id && s.accountId === student.accountId)).find(Boolean) || student;
      const updateCaches = (next: Student, rollback = false) => {
        const currentAuth = queryClient.getQueryData<typeof auth>(["/api/auth/user"]);
        if (currentAuth?.id !== auth.id || (currentAuth.accountContext && currentAuth.accountContext.accountId !== student.accountId)) return;
        queryClient.getQueriesData<Student[]>({ predicate }).forEach(([key, rows]) => {
          if (!rows || rows.some((s) => s.accountId !== student.accountId)) return;
          queryClient.setQueryData<Student[]>(key, (current) => current
            ? updateRosterRows(current, before, rollback ? patch : previousStudentPatch(next, patch), key[1] === "roster" ? String(key[2]) : "all", rollback)
            : current);
        });
      };
      updateCaches(applyStudentPatch(before, patch));
      try {
        const response = await apiRequest("PATCH", `/api/students/${student.id}/roster`, patch);
        const saved = await response.json() as Student;
        updateCaches(saved);
        const detailKey = ["/api/students", student.id];
        if (queryClient.getQueryData(detailKey)) queryClient.setQueryData<Student>(detailKey, (current) => current ? applyStudentPatch(current, previousStudentPatch(saved, patch)) : current);
        if (["grade", "currentClass", "gender"].some((field) => field in patch) || patch.characteristics?.newGrade !== undefined) {
          void queryClient.invalidateQueries({ queryKey: ["/api/students", "options"] });
        }
      } catch (error) {
        updateCaches(before, true);
        toast({ title: "Learner changes were not saved", description: "The previous values have been restored. Please try again.", variant: "destructive" });
        throw error;
      } finally {
        // A grade switch may have mounted an uncached query while this save was queued.
        void queryClient.refetchQueries({ predicate: (query) => predicate(query) && query.state.data === undefined && query.isActive() });
      }
    });
    queues.current.set(queueKey, operation);
    try { await operation; }
    finally { if (queues.current.get(queueKey) === operation) queues.current.delete(queueKey); }
  }, []);
}
