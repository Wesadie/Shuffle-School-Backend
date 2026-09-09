import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Link2, Loader2, Pencil, Unlink, X } from "lucide-react";
import { apiUrl } from "@/lib/apiUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isCharacteristicApplicableToGrade, normalizeResponses } from "@shared/characteristics";
import type { Characteristic, PlacementRequestView, Rule, RuleImportance, Student } from "@shared/schema";

type SurveyTeacherOption = { id: string; name: string };

type SurveyData = {
  completed: boolean;
  teacherName: string;
  className?: string;
  students?: Student[];
  characteristics?: Characteristic[];
  requests?: Rule[];
  teachers?: SurveyTeacherOption[];
  placementRequests?: PlacementRequestView[];
};

type RequestDraftInput = {
  type: "separate" | "pair";
  studentId1: string;
  studentId2: string;
  importance: RuleImportance;
  comment: string;
};

type RequestEditorState =
  | { mode: "create"; prefill?: Partial<RequestDraftInput> }
  | { mode: "edit"; ruleId: string }
  | null;

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Unable to load survey");
  return body as T;
}

const importanceLabel = (rule: Rule) => (rule.importance === "important" ? "Important" : "Mandatory");

function RequestTypeBadge({ rule }: { rule: Rule }) {
  return rule.type === "separate" ? (
    <Badge variant="destructive" className="gap-1"><Unlink className="h-3 w-3" />Separate</Badge>
  ) : (
    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><Link2 className="h-3 w-3" />Together</Badge>
  );
}

function RequestImportanceBadge({ rule }: { rule: Rule }) {
  return rule.importance === "important" ? (
    <Badge variant="outline" className="border-amber-600/50 text-amber-700 dark:text-amber-400">Important</Badge>
  ) : (
    <Badge className="bg-slate-800 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900">Mandatory</Badge>
  );
}

// Small numbered indicator shown beside both learners involved in a request.
// Green numbers are Together requests, red numbers are Separate requests.
function requestBadgeClassName(rule: Rule) {
  return `inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white ${
    rule.type === "separate" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
  }`;
}

function LearnerSelect({
  students,
  value,
  onChange,
  excludedId,
  disabled,
}: {
  students: Student[];
  value: string;
  onChange: (value: string) => void;
  excludedId?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
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

// Editable input for one characteristic, shared by the class table and the
// edit-learner dialog so both save through the same endpoint.
function CharacteristicField({
  characteristic,
  value,
  onChange,
}: {
  characteristic: Characteristic;
  value: string;
  onChange: (value: string) => void;
}) {
  const responses = characteristic.type === "category" ? normalizeResponses(characteristic) : [];
  if (responses.length > 0) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {responses.map((response) => (
            <SelectItem key={response.id} value={response.name}>{response.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      type={characteristic.type === "scale" || characteristic.type === "percentage" ? "number" : "text"}
      min={characteristic.type === "percentage" ? 0 : undefined}
      max={characteristic.type === "percentage" ? 100 : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function RequestFormDialog({
  students,
  rule,
  prefill,
  readOnlyReason,
  onClose,
  onSubmit,
  onDelete,
  pending,
  deletePending,
}: {
  students: Student[];
  rule: Rule | null;
  prefill?: Partial<RequestDraftInput>;
  readOnlyReason: string | null;
  onClose: () => void;
  onSubmit: (input: RequestDraftInput) => void;
  onDelete: (() => void) | null;
  pending: boolean;
  deletePending: boolean;
}) {
  const readOnly = readOnlyReason !== null;
  const [type, setType] = useState<"separate" | "pair">(
    (rule ? rule.type : prefill?.type ?? "separate") as "separate" | "pair",
  );
  const [studentId1, setStudentId1] = useState(rule ? rule.studentId1 : prefill?.studentId1 ?? "");
  const [studentId2, setStudentId2] = useState(rule ? rule.studentId2 : prefill?.studentId2 ?? "");
  const [importance, setImportance] = useState<RuleImportance>(
    rule ? (rule.importance === "important" ? "important" : "mandatory") : prefill?.importance ?? "mandatory",
  );
  const [comment, setComment] = useState(rule?.comment ?? "");

  const valid = !!studentId1 && !!studentId2 && studentId1 !== studentId2;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? (readOnly ? "Request details" : "Edit request") : "Add request"}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? `This request was added by the school (${readOnlyReason}) and can only be edited by a school administrator.`
              : "Mandatory requests are hard requirements for the solver. Important requests are preferences the solver tries to satisfy after class size, characteristics, and mandatory rules."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(next) => setType(next === "pair" ? "pair" : "separate")} disabled={readOnly}>
                <SelectTrigger data-testid="select-edit-request-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separate">Separate</SelectItem>
                  <SelectItem value="pair">Together</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Importance</Label>
              <Select value={importance} onValueChange={(next) => setImportance(next === "important" ? "important" : "mandatory")} disabled={readOnly}>
                <SelectTrigger data-testid="select-edit-request-importance"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Learner 1</Label>
            <LearnerSelect students={students} value={studentId1} excludedId={studentId2} onChange={setStudentId1} disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <Label>Learner 2</Label>
            <LearnerSelect students={students} value={studentId2} excludedId={studentId1} onChange={setStudentId2} disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-comment">Comment (optional)</Label>
            <Textarea
              id="request-comment"
              rows={2}
              value={comment}
              disabled={readOnly}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a note for the school…"
              data-testid="textarea-request-comment"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onDelete && (
            <Button
              variant="outline"
              className="mr-auto text-destructive"
              onClick={onDelete}
              disabled={deletePending}
              data-testid="button-delete-request"
            >
              {deletePending ? "Removing…" : "Remove"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-request">Cancel</Button>
          <Button
            onClick={() => onSubmit({ type, studentId1, studentId2, importance, comment })}
            disabled={!valid || pending || readOnly}
            data-testid="button-save-request"
          >
            {pending ? "Saving…" : rule ? "Save changes" : "Add request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLearnerDialog({
  student,
  students,
  characteristics,
  requests,
  requestNumberById,
  ownRequestReason,
  busy,
  onClose,
  onUpdateResponse,
  onEditRequest,
  onAddRequest,
  onRemoveRequest,
  onToggleFriendship,
}: {
  student: Student;
  students: Student[];
  characteristics: Characteristic[];
  requests: Rule[];
  requestNumberById: Map<string, number>;
  ownRequestReason: string;
  busy: boolean;
  onClose: () => void;
  onUpdateResponse: (studentId: string, characteristic: string, value: string) => void;
  onEditRequest: (ruleId: string) => void;
  onAddRequest: (prefill: Partial<RequestDraftInput>) => void;
  onRemoveRequest: (ruleId: string) => void;
  onToggleFriendship: (studentId: string, mateId: string, currentRule: Rule | null) => void;
}) {
  const learnerRequests = requests
    .filter((rule) => rule.studentId1 === student.id || rule.studentId2 === student.id)
    .map((rule) => ({ rule, number: requestNumberById.get(rule.id) ?? 0 }))
    .sort((a, b) => a.number - b.number);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit learner</DialogTitle>
          <DialogDescription>
            {student.firstName} {student.lastName}{student.studentId ? ` · ${student.studentId}` : ""} · Grade {student.grade}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="characteristics">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="characteristics">Characteristics</TabsTrigger>
            <TabsTrigger value="requests">Requests ({learnerRequests.length})</TabsTrigger>
            <TabsTrigger value="friendships">Friendships</TabsTrigger>
          </TabsList>

          <TabsContent value="characteristics" className="mt-3">
            {characteristics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No characteristics to edit.</p>
            ) : (
              <div className="grid gap-3">
                {characteristics.map((characteristic) => {
                  const applicable = isCharacteristicApplicableToGrade(characteristic, student.grade);
                  const rawValue = ((student.characteristics || {}) as Record<string, string | string[]>)[characteristic.name];
                  const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue || "";
                  return (
                    <div key={characteristic.id} className="grid gap-1.5">
                      <Label className="text-sm">{characteristic.name}</Label>
                      {applicable ? (
                        <CharacteristicField
                          characteristic={characteristic}
                          value={value}
                          onChange={(next) => onUpdateResponse(student.id, characteristic.name, next)}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">Not applicable to grade {student.grade}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-3">
            {learnerRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests involve this learner yet.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="list-learner-requests">
                {learnerRequests.map(({ rule, number }) => {
                  const otherId = rule.studentId1 === student.id ? rule.studentId2 : rule.studentId1;
                  const other = students.find((mate) => mate.id === otherId);
                  const canModify = rule.reason === ownRequestReason;
                  return (
                    <li
                      key={rule.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      data-testid={`learner-request-${rule.id}`}
                    >
                      <span className={requestBadgeClassName(rule)}>{number}</span>
                      <RequestTypeBadge rule={rule} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {other ? `${other.firstName} ${other.lastName}` : "Unknown learner"}
                      </span>
                      <RequestImportanceBadge rule={rule} />
                      {rule.comment && (
                        <span className="w-full truncate text-xs text-muted-foreground" title={rule.comment}>
                          {rule.comment}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => onEditRequest(rule.id)}
                        aria-label="View or edit request"
                        data-testid={`button-edit-request-${rule.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canModify && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => onRemoveRequest(rule.id)}
                          disabled={busy}
                          aria-label="Remove request"
                          data-testid={`button-remove-request-${rule.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => onAddRequest({ type: "separate", studentId1: student.id, importance: "mandatory" })}
              data-testid="button-add-request-for-learner"
            >
              Add request
            </Button>
          </TabsContent>

          <TabsContent value="friendships" className="mt-3">
            <p className="text-sm text-muted-foreground">
              Select the classmates who are friends with {student.firstName}. Each friendship is saved as a
              Together request marked Important, so the solver treats it as a preference.
            </p>
            <div className="mt-2 max-h-64 space-y-0.5 overflow-auto rounded-md border p-2" data-testid="list-friendships">
              {students
                .filter((mate) => mate.id !== student.id)
                .map((mate) => {
                  const pairRule = requests.find((rule) =>
                    rule.type === "pair" &&
                    ((rule.studentId1 === student.id && rule.studentId2 === mate.id) ||
                      (rule.studentId2 === student.id && rule.studentId1 === mate.id)),
                  );
                  const canModify = !!pairRule && pairRule.reason === ownRequestReason;
                  return (
                    <label
                      key={mate.id}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-sm"
                      data-testid={`friend-option-${mate.id}`}
                    >
                      <Checkbox
                        checked={!!pairRule}
                        disabled={busy || (!!pairRule && !canModify)}
                        onCheckedChange={() => onToggleFriendship(student.id, mate.id, pairRule ?? null)}
                        aria-label={`Friendship with ${mate.firstName} ${mate.lastName}`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {mate.firstName} {mate.lastName}{mate.studentId ? ` · ${mate.studentId}` : ""}
                      </span>
                      {pairRule && pairRule.importance !== "important" && <RequestImportanceBadge rule={pairRule} />}
                      {pairRule && !canModify && (
                        <span className="shrink-0 text-xs text-muted-foreground">added by school</span>
                      )}
                    </label>
                  );
                })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function TeacherSurveyPage({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<Rule[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<SurveyTeacherOption[]>([]);
  const [placementRequests, setPlacementRequests] = useState<PlacementRequestView[]>([]);
  const [placementStudentId, setPlacementStudentId] = useState("");
  const [placementTeacherId, setPlacementTeacherId] = useState("");
  const [requestType, setRequestType] = useState<"separate" | "pair">("separate");
  const [requestStudent1, setRequestStudent1] = useState("");
  const [requestStudent2, setRequestStudent2] = useState("");
  const [requestImportance, setRequestImportance] = useState<RuleImportance>("mandatory");
  const [requestComment, setRequestComment] = useState("");
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [requestEditor, setRequestEditor] = useState<RequestEditorState>(null);
  const [requestSaveState, setRequestSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [placementSaveState, setPlacementSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
    if (surveyQuery.data?.placementRequests) setPlacementRequests(surveyQuery.data.placementRequests);
  }, [surveyQuery.data]);

  useEffect(() => () => {
    saveTimers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  // Requests are numbered in list order; the same number is shown beside both
  // learners involved so connected learners are immediately obvious.
  const requestNumberById = useMemo(() => {
    const map = new Map<string, number>();
    requests.forEach((rule, index) => map.set(rule.id, index + 1));
    return map;
  }, [requests]);

  const requestsByStudent = useMemo(() => {
    const map = new Map<string, { rule: Rule; number: number }[]>();
    for (const rule of requests) {
      const number = requestNumberById.get(rule.id) ?? 0;
      for (const studentId of [rule.studentId1, rule.studentId2]) {
        const list = map.get(studentId) ?? [];
        list.push({ rule, number });
        map.set(studentId, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.number - b.number);
    return map;
  }, [requests, requestNumberById]);

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
    mutationFn: async (input: RequestDraftInput) =>
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
      setRequestImportance("mandatory");
      setRequestComment("");
      setRequestEditor(null);
      setRequestSaveState("saved");
    },
    onError: () => setRequestSaveState("error"),
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ ruleId, ...input }: { ruleId: string } & RequestDraftInput) =>
      readJsonResponse<{ rule: Rule }>(
        await fetch(
          apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/requests/${encodeURIComponent(ruleId)}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        ),
      ),
    onMutate: () => setRequestSaveState("saving"),
    onSuccess: (data) => {
      setRequests((current) => current.map((rule) => (rule.id === data.rule.id ? data.rule : rule)));
      setRequestEditor(null);
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

  const openRequestEditor = (state: Exclude<RequestEditorState, null>) => {
    setEditingStudentId(null);
    setRequestEditor(state);
  };

  const toggleFriendship = (studentId: string, mateId: string, currentRule: Rule | null) => {
    if (currentRule) {
      removeRequestMutation.mutate(currentRule.id);
      return;
    }
    addRequestMutation.mutate({
      type: "pair",
      studentId1: studentId,
      studentId2: mateId,
      importance: "important",
      comment: "",
    });
  };

  const addPlacementRequestMutation = useMutation({
    mutationFn: async (input: { studentId: string; teacherId: string }) =>
      readJsonResponse<{ request: PlacementRequestView }>(
        await fetch(apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/placement-requests`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onMutate: () => setPlacementSaveState("saving"),
    onSuccess: (data) => {
      setPlacementRequests((current) => [
        ...current.filter((request) => request.studentId !== data.request.studentId),
        data.request,
      ]);
      setPlacementStudentId("");
      setPlacementTeacherId("");
      setPlacementSaveState("saved");
    },
    onError: () => setPlacementSaveState("error"),
  });

  const removePlacementRequestMutation = useMutation({
    mutationFn: async (requestId: string) =>
      readJsonResponse<{ deleted: boolean }>(
        await fetch(
          apiUrl(`/api/public/teacher-surveys/${encodeURIComponent(token)}/placement-requests/${encodeURIComponent(requestId)}`),
          { method: "DELETE" },
        ),
      ),
    onMutate: () => setPlacementSaveState("saving"),
    onSuccess: (_data, requestId) => {
      setPlacementRequests((current) => current.filter((request) => request.id !== requestId));
      setPlacementSaveState("saved");
    },
    onError: () => setPlacementSaveState("error"),
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
  const editingStudent = editingStudentId ? students.find((student) => student.id === editingStudentId) ?? null : null;
  const editingRule =
    requestEditor?.mode === "edit" ? requests.find((rule) => rule.id === requestEditor.ruleId) ?? null : null;

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
            <p className="text-sm text-muted-foreground">
              Edit responses directly or use Edit on a learner. Request numbers appear beside both learners involved.
            </p>
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
                    <TableCell className="sticky left-[140px] bg-background font-medium">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{student.lastName}</span>
                        {(requestsByStudent.get(student.id) ?? []).map(({ rule, number }) => {
                          const otherId = rule.studentId1 === student.id ? rule.studentId2 : rule.studentId1;
                          const other = students.find((mate) => mate.id === otherId);
                          return (
                            <button
                              key={rule.id}
                              type="button"
                              className={requestBadgeClassName(rule)}
                              title={`${rule.type === "pair" ? "Together" : "Separate"} request #${number} with ${
                                other ? `${other.firstName} ${other.lastName}` : "unknown learner"
                              } · ${importanceLabel(rule)} — click to edit`}
                              onClick={() => openRequestEditor({ mode: "edit", ruleId: rule.id })}
                              data-testid={`button-request-badge-${rule.id}`}
                            >
                              {number}
                            </button>
                          );
                        })}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          onClick={() => setEditingStudentId(student.id)}
                          aria-label={`Edit ${student.firstName} ${student.lastName}`}
                          title="Edit learner"
                          data-testid={`button-edit-learner-${student.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{student.studentId || "—"}</TableCell>
                    <TableCell>{student.grade}</TableCell>
                    {characteristics.map((characteristic) => {
                      if (!isCharacteristicApplicableToGrade(characteristic, student.grade)) {
                        return <TableCell key={characteristic.id} className="text-muted-foreground">—</TableCell>;
                      }
                      const rawValue = values[characteristic.name];
                      const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue || "";
                      return (
                        <TableCell key={characteristic.id} className="min-w-40">
                          <CharacteristicField
                            characteristic={characteristic}
                            value={value}
                            onChange={(next) => updateResponse(student.id, characteristic.name, next)}
                          />
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
                Requests are numbered — the same number appears beside both learners in the class list. Click a
                number to view or edit the request.
              </p>
            </div>
            {requestSaveState === "saving" && <span className="text-sm text-muted-foreground">Saving…</span>}
            {requestSaveState === "saved" && <span className="text-sm text-green-700">Requests saved</span>}
            {requestSaveState === "error" && <span className="text-sm text-destructive">A request could not be saved</span>}
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_150px_auto] md:items-center">
                <Select value={requestType} onValueChange={(next) => setRequestType(next === "pair" ? "pair" : "separate")}>
                  <SelectTrigger data-testid="select-request-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="separate">Separate</SelectItem>
                    <SelectItem value="pair">Together</SelectItem>
                  </SelectContent>
                </Select>
                <LearnerSelect students={students} value={requestStudent1} excludedId={requestStudent2} onChange={setRequestStudent1} />
                <LearnerSelect students={students} value={requestStudent2} excludedId={requestStudent1} onChange={setRequestStudent2} />
                <Select
                  value={requestImportance}
                  onValueChange={(next) => setRequestImportance(next === "important" ? "important" : "mandatory")}
                >
                  <SelectTrigger data-testid="select-request-importance"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mandatory">Mandatory</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={
                    !requestStudent1 || !requestStudent2 || requestStudent1 === requestStudent2 || addRequestMutation.isPending
                  }
                  onClick={() => addRequestMutation.mutate({
                    type: requestType,
                    studentId1: requestStudent1,
                    studentId2: requestStudent2,
                    importance: requestImportance,
                    comment: requestComment,
                  })}
                  data-testid="button-add-request"
                >
                  {addRequestMutation.isPending ? "Saving…" : "Add request"}
                </Button>
              </div>
              <Input
                value={requestComment}
                onChange={(event) => setRequestComment(event.target.value)}
                placeholder="Optional comment for the school…"
                data-testid="input-request-comment"
              />
            </div>

            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests submitted yet.</p>
            ) : (
              <ul className="space-y-1.5" data-testid="list-teacher-requests">
                {requests.map((rule) => {
                  const student1 = students.find((student) => student.id === rule.studentId1);
                  const student2 = students.find((student) => student.id === rule.studentId2);
                  const canModify = rule.reason === ownRequestReason;
                  const number = requestNumberById.get(rule.id);
                  return (
                    <li
                      key={rule.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      data-testid={`teacher-request-${rule.id}`}
                    >
                      <span className={requestBadgeClassName(rule)}>{number}</span>
                      <RequestTypeBadge rule={rule} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {student1 ? `${student1.firstName} ${student1.lastName}` : "Unknown learner"}
                        {" "}{rule.type === "separate" ? "✕" : "↔"}{" "}
                        {student2 ? `${student2.firstName} ${student2.lastName}` : "Unknown learner"}
                      </span>
                      <RequestImportanceBadge rule={rule} />
                      {(rule.comment || (!canModify && rule.reason)) && (
                        <span
                          className="hidden max-w-52 truncate text-xs text-muted-foreground md:inline"
                          title={rule.comment || rule.reason || undefined}
                        >
                          {rule.comment || rule.reason}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => openRequestEditor({ mode: "edit", ruleId: rule.id })}
                        aria-label="View or edit request"
                        data-testid={`button-edit-request-${rule.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canModify && (
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
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-medium">Learner placement requests for next year</label>
                  <p className="text-sm text-muted-foreground">
                    Recommend which teacher a learner from your class should be placed with next year.
                  </p>
                </div>
                {placementSaveState === "saving" && <span className="text-sm text-muted-foreground">Saving…</span>}
                {placementSaveState === "saved" && <span className="text-sm text-green-700">Requests saved</span>}
                {placementSaveState === "error" && <span className="text-sm text-destructive">A request could not be saved</span>}
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                <LearnerSelect students={students} value={placementStudentId} onChange={setPlacementStudentId} />
                <Select value={placementTeacherId || undefined} onValueChange={setPlacementTeacherId}>
                  <SelectTrigger data-testid="select-placement-teacher"><SelectValue placeholder="Select a teacher…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {teacherOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!placementStudentId || !placementTeacherId || addPlacementRequestMutation.isPending}
                  onClick={() => addPlacementRequestMutation.mutate({
                    studentId: placementStudentId,
                    teacherId: placementTeacherId,
                  })}
                  data-testid="button-add-placement-request"
                >
                  {addPlacementRequestMutation.isPending ? "Saving…" : "Add request"}
                </Button>
              </div>

              {placementRequests.length > 0 && (
                <ul className="mt-3 space-y-1.5" data-testid="list-placement-requests">
                  {placementRequests.map((request) => (
                    <li
                      key={request.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      data-testid={`placement-request-${request.id}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{request.studentName}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{request.teacherName}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => removePlacementRequestMutation.mutate(request.id)}
                        disabled={removePlacementRequestMutation.isPending}
                        aria-label="Remove placement request"
                        data-testid={`button-remove-placement-request-${request.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </main>

      {editingStudent && (
        <EditLearnerDialog
          student={editingStudent}
          students={students}
          characteristics={characteristics}
          requests={requests}
          requestNumberById={requestNumberById}
          ownRequestReason={ownRequestReason}
          busy={addRequestMutation.isPending || removeRequestMutation.isPending}
          onClose={() => setEditingStudentId(null)}
          onUpdateResponse={updateResponse}
          onEditRequest={(ruleId) => openRequestEditor({ mode: "edit", ruleId })}
          onAddRequest={(prefill) => openRequestEditor({ mode: "create", prefill })}
          onRemoveRequest={(ruleId) => removeRequestMutation.mutate(ruleId)}
          onToggleFriendship={toggleFriendship}
        />
      )}

      {requestEditor && (requestEditor.mode === "create" || editingRule) && (
        <RequestFormDialog
          key={
            requestEditor.mode === "edit"
              ? `edit-${requestEditor.ruleId}`
              : `create-${requestEditor.prefill?.type ?? "separate"}-${requestEditor.prefill?.studentId1 ?? ""}`
          }
          students={students}
          rule={requestEditor.mode === "edit" ? editingRule : null}
          prefill={requestEditor.mode === "create" ? requestEditor.prefill : undefined}
          readOnlyReason={
            requestEditor.mode === "edit" && editingRule && editingRule.reason !== ownRequestReason
              ? editingRule.reason || "Added by school"
              : null
          }
          onClose={() => setRequestEditor(null)}
          onSubmit={(input) =>
            requestEditor.mode === "edit" && editingRule
              ? updateRequestMutation.mutate({ ruleId: editingRule.id, ...input })
              : addRequestMutation.mutate(input)
          }
          onDelete={
            requestEditor.mode === "edit" && editingRule && editingRule.reason === ownRequestReason
              ? () => removeRequestMutation.mutate(editingRule.id)
              : null
          }
          pending={addRequestMutation.isPending || updateRequestMutation.isPending}
          deletePending={removeRequestMutation.isPending}
        />
      )}
    </div>
  );
}
