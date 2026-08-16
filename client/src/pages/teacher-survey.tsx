import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isCharacteristicApplicableToGrade, normalizeResponses } from "@shared/characteristics";
import type { Characteristic, Student } from "@shared/schema";

type SurveyData = {
  completed: boolean;
  teacherName: string;
  className?: string;
  students?: Student[];
  characteristics?: Characteristic[];
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to load survey");
  return body as T;
}

export default function TeacherSurveyPage({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([]);
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

        <div className="rounded-md border">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background">First Name</TableHead>
                <TableHead className="sticky left-[140px] z-10 bg-background">Last Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Grade</TableHead>
                {characteristics.map((characteristic) => (
                  <TableHead key={characteristic.id}>{characteristic.name}</TableHead>
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
          </Table>
        </div>
      </main>
    </div>
  );
}
