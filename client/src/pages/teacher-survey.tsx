import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Link2, Loader2, Unlink, X } from "lucide-react";
import { apiUrl } from "@/lib/apiUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isCharacteristicApplicableToGrade, normalizeResponses } from "@shared/characteristics";
import type { Characteristic, Rule, Student } from "@shared/schema";

type SurveyTeacherOption = { id: string; name: string };

type SurveyData = {
  completed: boolean;
  teacherName: string;
  className?: string;
  students?: Student[];
  characteristics?: Characteristic[];
  requests?: Rule[];
  teachers?: SurveyTeacherOption[];
  teacherPreference?: SurveyTeacherOption | null;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to load survey");
  return body as T;
}

function LearnerSelect({
  students,
  value,
  onChange,
  excludedId,
}: {
  students: Student[];
  value: string;
  onChange: (value: string) => void;
  excludedId?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select a learner…" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {students
          .filter((student) => student.id !== excludedId)
          .map((student) => (
            <SelectItem key={student.id} value={student.id}>
              {student.firstName} {student.lastName}{student.studentId ? ` · ${student.studentId}` : ""}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

export default function TeacherSurveyPage({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<Rule[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<SurveyTeacherOption[]>([]);
  const [teacherPreference, setTeacherPreference] = useState<SurveyTeacherOption | null>(null);
  const [requestType, setRequestType] = useState<"separate" | "pair">("separate");
  const [requestStudent1, setRequestStudent1] = useState("");
  const [requestStudent2, setRequestStudent2] = useState("");
  const [requestSaveState, setRequestSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [preferenceSaveState, setPreferenceSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeSaves = useRef(0);
  const saveFailed = useRef(false);

  const surveyQuery = useQuery<SurveyData>({
    queryKey: ["public-teacher-survey", token],
    queryFn: async () => readJsonResponse(await fetch(apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}`))),
    retry: false,
  });

  useEffect(() => {
    if (surveyQuery.data?.students) setStudents(surveyQuery.data.students);
    if (surveyQuery.data?.requests) setRequests(surveyQuery.data.requests);
    if (surveyQuery.data?.teachers) setTeacherOptions(surveyQuery.data.teachers);
    if (surveyQuery.data?.teacherPreference !== undefined) {
      setTeacherPreference(surveyQuery.data.teacherPreference);
    }
  }, [surveyQuery.data]);

  useEffect(() => () => {
    saveTimers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const saveResponse = async (studentId: string, characteristic: string, value: string) => {
    activeSaves.current += 1;
    try {
      const response = await fetch(
        apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/students/${studentId}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characteristic, value }),
        },
      );
      await readJsonResponse(response);
    } catch {
      saveFailed.current = true;
    } finally {
      activeSaves.current -= 1;
      if (activeSaves.current === 0 && saveTimers.current.size === 0) {
        setSaveState(saveFailed.current ? "error" : "saved");
        saveFailed.current = false;
      }
    }
  };

  const updateResponse = (studentId: string, characteristic: string, value: string) => {
    setSaveState("saving");
    setStudents((current) => current.map((student) =>
      student.id === studentId
        ? { ...student, characteristics: { ...(student.characteristics || {}), [characteristic]: value } }
        : student,
    ));

    const key = `${studentId}:${characteristic}`;

    const existingTimer = saveTimers.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    saveTimers.current.set(key, setTimeout(() => {
      saveTimers.current.delete(key);
      void saveResponse(studentId, characteristic, value);
    }, 600));
  };

  const completeMutation = useMutation({
    mutationFn: async () => readJsonResponse<{ completed: boolean }>(
      await fetch(apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/complete`), { method: "POST" }),
    ),
    onSuccess: () => surveyQuery.refetch(),
  });

  const ownRequestReason = `Teacher survey request by ${surveyQuery.data?.teacherName ?? ""}`;

  const addRequestMutation = useMutation({
    mutationFn: async (input: { type: "separate" | "pair"; studentId1: string; studentId2: string }) =>
      readJsonResponse<{ rule: Rule }>(
        await fetch(apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/requests`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onMutate: () => setRequestSaveState("saving"),
    onSuccess: (data) => {
      setRequests((current) => [...current, data.rule]);
      setRequestStudent1("");
      setRequestStudent2("");
      setRequestSaveState("saved");
    },
    onError: () => setRequestSaveState("error"),
  });

  const removeRequestMutation = useMutation({
    mutationFn: async (ruleId: string) =>
      readJsonResponse<{ deleted: boolean }>(
        await fetch(
          apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/requests/${encodeURIComponent(ruleId)}`),
          { method: "DELETE" },
        ),
      ),
    onMutate: () => setRequestSaveState("saving"),
    onSuccess: (_data, ruleId) => {
      setRequests((current) => current.filter((rule) => rule.id !== ruleId));
      setRequestSaveState("saved");
    },
    onError: () => setRequestSaveState("error"),
  });

  const savePreferenceMutation = useMutation({
    mutationFn: async (teacherId: string) =>
      readJsonResponse<{ teacherPreference: SurveyTeacherOption | null }>(
        await fetch(apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/preference`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        }),
      ),
    onMutate: () => setPreferenceSaveState("saving"),
    onSuccess: (data) => {
      setTeacherPreference(data.teacherPreference);
      setPreferenceSaveState("saved");
    },
    onError: () => setPreferenceSaveState("error"),
  });

  if (surveyQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading survey…</div>;
  }

  if (surveyQuery.isError || !surveyQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Survey unavailable</h1>
          <p className="mt-2 text-muted-foreground">{surveyQuery.error?.message || "This survey link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  if (surveyQuery.data.completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="max-w-xl rounded-lg border bg-card p-10 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <h1 className="mt-4 text-2xl font-semibold">Thank you!</h1>
          <p className="mt-2 text-muted-foreground">
            This survey has been completed and closed. Please contact your school administrator if it needs to be reopened.
          </p>
        </div>
      </div>
    );
  }

  const characteristics = surveyQuery.data.characteristics || [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-3">
        <div>
          <h1 className="text-xl font-semibold">ShuffleSchool Teacher Survey</h1>
          <p className="text-sm text-muted-foreground">{surveyQuery.data.teacherName} · Class {surveyQuery.data.className}</p>
        </div>
        <div className="flex items-center gap-3">
          {saveState === "saving" && <span className="text-sm text-muted-foreground">Saving…</span>}
          {saveState === "saved" && <span className="text-sm text-green-700">All changes saved</span>}
          {saveState === "error" && <span className="text-sm text-destructive">A change could not be saved</span>}
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending || saveState === "saving" || saveState === "error"}
            title={saveState === "saving" ? "Please wait for changes to finish saving" : undefined}
          >
            {completeMutation.isPending ? "Completing…" : "Mark Survey Complete"}
          </Button>

        </div>
      </header>

      <main className="flex-1 overflow-auto p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Class characteristics</h2>
            <p className="text-sm text-muted-foreground">Edit responses directly. Every change is saved automatically.</p>
          </div>
          <Badge variant="secondary">{students.length} students</Badge>
        </div>

        {/* Single scroll container: its horizontal scrollbar stays pinned to the
            bottom of the visible table area while scrolling vertically. */}
        <div className="max-h-[65vh] overflow-auto rounded-md border">
          <table className="w-full caption-bottom text-sm min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 top-0 z-30 bg-background">First Name</TableHead>
                <TableHead className="sticky left-[140px] top-0 z-30 bg-background">Last Name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">ID</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background">Grade</TableHead>
                {characteristics.map((characteristic) => (
                  <TableHead key={characteristic.id} className="sticky top-0 z-20 bg-background">{characteristic.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const values = (student.characteristics || {}) as Record<string, string | string[]>;
                return (
                  <TableRow key={student.id}>
                    <TableCell className="sticky left-0 bg-background font-medium">{student.firstName}</TableCell>
                    <TableCell className="sticky left-[140px] bg-background font-medium">{student.lastName}</TableCell>
                    <TableCell>{student.studentId || "—"}</TableCell>
                    <TableCell>{student.grade}</TableCell>
                    {characteristics.map((characteristic) => {
                      if (!isCharacteristicApplicableToGrade(characteristic, student.grade)) {
                        return <TableCell key={characteristic.id} className="text-muted-foreground">—</TableCell>;
                      }
                      const rawValue = values[characteristic.name];
                      const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue || "";
                      const responses = characteristic.type === "category" ? normalizeResponses(characteristic) : [];
                      return (
                        <TableCell key={characteristic.id} className="min-w-40">
                          {responses.length > 0 ? (
                            <Select value={value || undefined} onValueChange={(next) => updateResponse(student.id, characteristic.name, next)}>
                              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                              <SelectContent>
                                {responses.map((response) => <SelectItem key={response.id} value={response.name}>{response.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={characteristic.type === "scale" || characteristic.type === "percentage" ? "number" : "text"}
                              min={characteristic.type === "percentage" ? 0 : undefined}
                              max={characteristic.type === "percentage" ? 100 : undefined}
                              value={value}
                              onChange={(event) => updateResponse(student.id, characteristic.name, event.target.value)}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Teacher requests</h2>
              <p className="text-sm text-muted-foreground">
                Separation and together requests are sent to the school and used by the class solver.
              </p>
            </div>
            {requestSaveState === "saving" && <span className="text-sm text-muted-foreground">Saving…</span>}
            {requestSaveState === "saved" && <span className="text-sm text-green-700">Requests saved</span>}
            {requestSaveState === "error" && <span className="text-sm text-destructive">A request could not be saved</span>}
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
              <Select value={requestType} onValueChange={(next) => setRequestType(next === "pair" ? "pair" : "separate")}>
                <SelectTrigger data-testid="select-request-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separate">Separate</SelectItem>
                  <SelectItem value="pair">Together</SelectItem>
                </SelectContent>
              </Select>
              <LearnerSelect students={students} value={requestStudent1} excludedId={requestStudent2} onChange={setRequestStudent1} />
              <LearnerSelect students={students} value={requestStudent2} excludedId={requestStudent1} onChange={setRequestStudent2} />
              <Button
                size="sm"
                disabled={
                  !requestStudent1 || !requestStudent2 || requestStudent1 === requestStudent2 || addRequestMutation.isPending
                }
                onClick={() => addRequestMutation.mutate({
                  type: requestType,
                  studentId1: requestStudent1,
                  studentId2: requestStudent2,
                })}
                data-testid="button-add-request"
              >
                {addRequestMutation.isPending ? "Saving…" : "Add request"}
              </Button>
            </div>

            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests submitted yet.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="list-teacher-requests">
                {requests.map((rule) => {
                  const student1 = students.find((student) => student.id === rule.studentId1);
                  const student2 = students.find((student) => student.id === rule.studentId2);
                  const canRemove = rule.reason === ownRequestReason;
                  return (
                    <li
                      key={rule.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      data-testid={`teacher-request-${rule.id}`}
                    >
                      {rule.type === "separate" ? (
                        <Badge variant="destructive" className="gap-1"><Unlink className="h-3 w-3" />Separate</Badge>
                      ) : (
                        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><Link2 className="h-3 w-3" />Together</Badge>
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {student1 ? `${student1.firstName} ${student1.lastName}` : "Unknown learner"}
                        {" "}{rule.type === "separate" ? "✕" : "↔"}{" "}
                        {student2 ? `${student2.firstName} ${student2.lastName}` : "Unknown learner"}
                      </span>
                      {canRemove ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => removeRequestMutation.mutate(rule.id)}
                          disabled={removeRequestMutation.isPending}
                          aria-label="Remove request"
                          data-testid={`button-remove-request-${rule.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">{rule.reason || "Added by school"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t pt-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <label className="text-sm font-medium">Teacher preference for next year</label>
                  <p className="text-sm text-muted-foreground">
                    Optional — who would you prefer to work with next year?
                  </p>
                </div>
                <div className="flex items-center gap-2 md:w-80">
                  <Select
                    value={teacherPreference?.id ?? "none"}
                    onValueChange={(next) => savePreferenceMutation.mutate(next === "none" ? "" : next)}
                  >
                    <SelectTrigger data-testid="select-teacher-preference"><SelectValue placeholder="No preference" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">No preference</SelectItem>
                      {teacherOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {preferenceSaveState === "saving" && <span className="text-sm text-muted-foreground">Saving…</span>}
                  {preferenceSaveState === "saved" && <span className="text-sm text-green-700">Saved</span>}
                  {preferenceSaveState === "error" && <span className="text-sm text-destructive">Not saved</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
